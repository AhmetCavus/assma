import { daysBetween, dayOf, type ApplicationSummary, type Day } from "./applications.js";

/**
 * Progress over a week or a calendar month. Each recorded submission counts once on its
 * submission day, also for archived projects. Notes and follow-ups are not submissions.
 */

export const PERIOD_KINDS = ["week", "month"] as const;
export type PeriodKind = (typeof PERIOD_KINDS)[number];

/** A period from its first to its last day, both included. */
export type Period = { kind: PeriodKind; start: Day; end: Day };

const pad = (value: number) => String(value).padStart(2, "0");

function toDay(year: number, month: number, date: number): Day {
  // Date.UTC normalises overflowing months and days.
  const value = new Date(Date.UTC(year, month - 1, date));
  return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
}

const parts = (day: Day) => [+day.slice(0, 4), +day.slice(5, 7), +day.slice(8, 10)] as const;

export function addDays(day: Day, days: number): Day {
  const [year, month, date] = parts(day);
  return toDay(year, month, date + days);
}

/** Weeks start on Monday. */
export function periodOf(kind: PeriodKind, day: Day): Period {
  const [year, month, date] = parts(day);
  if (kind === "month") {
    return { kind, start: toDay(year, month, 1), end: toDay(year, month + 1, 0) };
  }
  const weekday = (new Date(Date.UTC(year, month - 1, date)).getUTCDay() + 6) % 7;
  const start = toDay(year, month, date - weekday);
  return { kind, start, end: addDays(start, 6) };
}

/** The period `steps` weeks or months before (negative) or after (positive) this one. */
export function shiftPeriod(period: Period, steps: number): Period {
  if (period.kind === "week") {
    return periodOf("week", addDays(period.start, steps * 7));
  }
  const [year, month] = parts(period.start);
  return periodOf("month", toDay(year, month + steps, 1));
}

export const inPeriod = (day: Day, period: Period) => day >= period.start && day <= period.end;

/** A bar of the chart: one day of a week, or a seven-day stretch of a month. */
export type ProgressBucket = { start: Day; end: Day; count: number };

export type ProgressItem = Pick<
  ApplicationSummary,
  "projectId" | "company" | "agency" | "title" | "channel" | "submittedAt" | "status"
>;

export type Progress<T extends ProgressItem> = {
  period: Period;
  /** Submissions in the period, newest first. */
  submissions: T[];
  previous: number;
  /** Distinct companies, by end client, else agency, else project. */
  companies: number;
  /** Distinct projects from the period whose current status is interview. */
  interviews: number;
  channels: { email: number; portal: number };
  buckets: ProgressBucket[];
};

function bucketsOf(period: Period): Omit<ProgressBucket, "count">[] {
  const length = daysBetween(period.start, period.end) + 1;
  const size = period.kind === "week" ? 1 : 7;
  const buckets = [];
  for (let offset = 0; offset < length; offset += size) {
    const start = addDays(period.start, offset);
    const last = addDays(start, size - 1);
    buckets.push({ start, end: last > period.end ? period.end : last });
  }
  return buckets;
}

/** Submission days are local calendar days of the person's own clock. */
export function progressOf<T extends ProgressItem>(
  applications: readonly T[],
  period: Period,
  dayOfSubmission: (item: T) => Day = (item) => dayOf(new Date(item.submittedAt)),
): Progress<T> {
  const days = new Map(applications.map((item) => [item, dayOfSubmission(item)]));
  const submissions = applications
    .filter((item) => inPeriod(days.get(item)!, period))
    .sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : a.submittedAt > b.submittedAt ? -1 : 0));
  const before = shiftPeriod(period, -1);
  const company = (item: T) =>
    (item.company.trim() || item.agency.trim() || `project:${item.projectId}`).toLowerCase();
  return {
    period,
    submissions,
    previous: applications.filter((item) => inPeriod(days.get(item)!, before)).length,
    companies: new Set(submissions.map(company)).size,
    interviews: new Set(
      submissions.filter((item) => item.status === "interview").map((item) => item.projectId),
    ).size,
    channels: {
      email: submissions.filter((item) => item.channel === "email").length,
      portal: submissions.filter((item) => item.channel === "portal").length,
    },
    buckets: bucketsOf(period).map((bucket) => ({
      ...bucket,
      count: submissions.filter((item) => {
        const day = days.get(item)!;
        return day >= bucket.start && day <= bucket.end;
      }).length,
    })),
  };
}

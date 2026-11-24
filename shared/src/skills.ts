import type { ExperienceReference, YearMonth } from "./experience.js";

/**
 * The skill matrix of a CV, computed from the project references: how many years each
 * technology and each role was practised, in how many projects and when last. Overlapping
 * projects count once, so two parallel Kotlin projects in 2023 make one year, not two.
 */

export type MatrixRow = {
  name: string;
  /** Rounded to half years. */
  years: number;
  projects: number;
  lastYear: number;
};

/** Months since year 0, both ends included. */
export type MonthPeriod = { start: number; end: number };
type Period = MonthPeriod;

/** Months since year 0, so periods compare and subtract simply. */
export function monthIndex(value: YearMonth): number {
  return Number(value.slice(0, 4)) * 12 + Number(value.slice(5, 7)) - 1;
}

export function currentMonth(now = new Date()): YearMonth {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function periodOf(reference: Pick<ExperienceReference, "start" | "end">, today: YearMonth): Period {
  const start = monthIndex(reference.start);
  const end = monthIndex(reference.end ?? today);
  return { start, end: Math.max(start, end) };
}

/** Whole months covered by the periods, counting each month once. */
export function coveredMonths(periods: readonly Period[]): number {
  const sorted = [...periods].sort((a, b) => a.start - b.start);
  let total = 0;
  let current: Period | null = null;
  for (const period of sorted) {
    if (current && period.start <= current.end + 1) {
      current.end = Math.max(current.end, period.end);
    } else {
      if (current) {
        total += current.end - current.start + 1;
      }
      current = { ...period };
    }
  }
  if (current) {
    total += current.end - current.start + 1;
  }
  return total;
}

const halfYears = (months: number) => Math.round((months / 12) * 2) / 2;

const keyOf = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

function group(
  references: readonly Pick<ExperienceReference, "start" | "end" | "skills" | "role">[],
  namesOf: (reference: Pick<ExperienceReference, "skills" | "role">) => string[],
  today: YearMonth,
): MatrixRow[] {
  const groups = new Map<string, { spellings: Map<string, number>; periods: Period[] }>();
  for (const reference of references) {
    const period = periodOf(reference, today);
    for (const name of namesOf(reference)) {
      const key = keyOf(name);
      if (!key) {
        continue;
      }
      const entry = groups.get(key) ?? {
        spellings: new Map<string, number>(),
        periods: [] as Period[],
      };
      entry.spellings.set(name.trim(), (entry.spellings.get(name.trim()) ?? 0) + 1);
      entry.periods.push(period);
      groups.set(key, entry);
    }
  }
  return [...groups.values()]
    .map(({ spellings, periods }) => ({
      // The most frequent spelling, so "kotlin" and "Kotlin" show as "Kotlin".
      name: [...spellings.entries()].sort((a, b) => b[1] - a[1])[0]![0],
      years: Math.max(0.5, halfYears(coveredMonths(periods))),
      projects: periods.length,
      lastYear: Math.floor(Math.max(...periods.map((period) => period.end)) / 12),
    }))
    .sort((a, b) => b.years - a.years || b.lastYear - a.lastYear || a.name.localeCompare(b.name));
}

export function skillRows(
  references: readonly ExperienceReference[],
  today: YearMonth = currentMonth(),
): MatrixRow[] {
  return group(references, (reference) => reference.skills, today);
}

export function roleRows(
  references: readonly ExperienceReference[],
  today: YearMonth = currentMonth(),
): MatrixRow[] {
  return group(references, (reference) => [reference.role], today);
}

/** Years of professional experience: every month covered by at least one reference. */
export function totalYears(
  references: readonly Pick<ExperienceReference, "start" | "end">[],
  today: YearMonth = currentMonth(),
): number {
  return halfYears(coveredMonths(references.map((reference) => periodOf(reference, today))));
}

/** Whether a skill is asked for by a project's tech stack or requirements. */
export function relevantTo(
  skill: string,
  project: { tech: string[]; required: string[]; preferred: string[] },
) {
  const needle = keyOf(skill);
  if (needle.length < 2) {
    return false;
  }
  const words = new RegExp(
    `(^|[^\\p{L}\\p{N}+#])${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}\\p{N}+#])`,
    "iu",
  );
  return [...project.tech, ...project.required, ...project.preferred].some(
    (entry) => keyOf(entry) === needle || words.test(entry),
  );
}

/**
 * The skills a CV shows by default: those the project asks for first, then the most
 * practised, at most `limit`.
 */
export function defaultSkills(
  rows: readonly MatrixRow[],
  project: { tech: string[]; required: string[]; preferred: string[] },
  limit = 12,
): string[] {
  const relevant = rows.filter((row) => relevantTo(row.name, project));
  const others = rows.filter((row) => !relevantTo(row.name, project));
  return [...relevant, ...others].slice(0, limit).map((row) => row.name);
}

/** Skill names in alphabetical order, ignoring case and accents. */
export function alphabetical<T extends { name: string }>(rows: readonly T[], locale = "de"): T[] {
  return [...rows].sort((a, b) => a.name.localeCompare(b.name, locale, { sensitivity: "base" }));
}

/** The years the person set for a skill, whatever its spelling, or undefined. */
export function yearsSetFor(skillYears: Readonly<Record<string, number>>, name: string) {
  const key = keyOf(name);
  return Object.entries(skillYears).find(([skill]) => keyOf(skill) === key)?.[1];
}

/**
 * The skill matrix of a CV: the chosen skills with the years the person set or the computed
 * ones, in alphabetical order.
 */
export function cvMatrix(
  rows: readonly MatrixRow[],
  skills: readonly string[],
  skillYears: Readonly<Record<string, number>>,
  locale = "de",
): MatrixRow[] {
  const byName = new Map(rows.map((row) => [keyOf(row.name), row]));
  return alphabetical(
    skills.flatMap((name) => {
      const row = byName.get(keyOf(name));
      return row ? [{ ...row, years: yearsSetFor(skillYears, row.name) ?? row.years }] : [];
    }),
    locale,
  );
}

/** How many roles a CV lists when the person has not chosen. */
export const DEFAULT_ROLE_COUNT = 6;

/**
 * The lines under "Berufserfahrung": the most practised roles when nothing was chosen,
 * otherwise the chosen ones with the years set or detected; an added role needs its years.
 */
export function cvRoles(
  rows: readonly MatrixRow[],
  roles: readonly { name: string; years: number | null }[] | null,
): { name: string; years: number }[] {
  if (roles === null) {
    return rows.slice(0, DEFAULT_ROLE_COUNT).map(({ name, years }) => ({ name, years }));
  }
  const byName = new Map(rows.map((row) => [keyOf(row.name), row]));
  return roles
    .flatMap((role) => {
      const years = role.years ?? byName.get(keyOf(role.name))?.years;
      return years === undefined ? [] : [{ name: role.name.trim(), years }];
    })
    .sort((a, b) => b.years - a.years);
}

/** "5 Jahre" / "5 years", with a half shown as ",5" or ".5" by the locale. */
export function formatYears(years: number, locale: string, unit: { one: string; many: string }) {
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(years);
  return `${number} ${years === 1 ? unit.one : unit.many}`;
}

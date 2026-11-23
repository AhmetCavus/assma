import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays, periodOf, progressOf, shiftPeriod, type ProgressItem } from "../src/index.ts";

test("weeks run Monday to Sunday and months to their last day", () => {
  assert.deepEqual(periodOf("week", "2026-11-18"), {
    kind: "week",
    start: "2026-11-16",
    end: "2026-11-22",
  });
  assert.deepEqual(periodOf("week", "2026-11-22"), {
    kind: "week",
    start: "2026-11-16",
    end: "2026-11-22",
  });
  assert.deepEqual(periodOf("week", "2027-01-01").start, "2026-12-28");
  assert.deepEqual(periodOf("month", "2028-02-10"), {
    kind: "month",
    start: "2028-02-01",
    end: "2028-02-29",
  });
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
});

test("periods step back and forward across years", () => {
  assert.deepEqual(
    shiftPeriod(periodOf("month", "2027-01-15"), -1),
    periodOf("month", "2026-12-01"),
  );
  assert.deepEqual(shiftPeriod(periodOf("week", "2027-01-01"), 1).start, "2027-01-04");
  // From a 31-day month to a shorter one, never into the month after.
  assert.equal(shiftPeriod(periodOf("month", "2027-01-31"), 1).start, "2027-02-01");
});

const item = (
  submittedAt: string,
  extra: Partial<ProgressItem> = {},
): ProgressItem & { id: string } => ({
  id: submittedAt,
  projectId: "p1",
  company: "Aster Care",
  agency: "",
  title: "Android",
  channel: "email",
  submittedAt,
  status: "applied",
  ...extra,
});

test("progress counts submissions per period, company, interview and channel", () => {
  const list = [
    item("2026-11-17T09:00:00.000Z"),
    item("2026-11-18T10:00:00.000Z", { projectId: "p2", company: "aster care", channel: "portal" }),
    item("2026-11-18T12:00:00.000Z", {
      projectId: "p3",
      company: "",
      agency: "Northline",
      status: "interview",
    }),
    item("2026-11-19T12:00:00.000Z", {
      projectId: "p3",
      company: "",
      agency: "Northline",
      status: "interview",
    }),
    item("2026-11-20T12:00:00.000Z", { projectId: "p4", company: "", agency: "", status: null }),
    item("2026-11-10T12:00:00.000Z"),
    item("2026-11-30T12:00:00.000Z"),
  ];
  const day = (entry: ProgressItem) => entry.submittedAt.slice(0, 10);
  const week = progressOf(list, periodOf("week", "2026-11-18"), day);
  assert.equal(week.submissions.length, 5);
  assert.equal(week.submissions[0]!.submittedAt, "2026-11-20T12:00:00.000Z");
  assert.equal(week.previous, 1);
  // Aster Care twice in different case, Northline twice, and one project without names.
  assert.equal(week.companies, 3);
  // The same project counts once.
  assert.equal(week.interviews, 1);
  assert.deepEqual(week.channels, { email: 4, portal: 1 });
  assert.deepEqual(
    week.buckets.map((bucket) => bucket.count),
    [0, 1, 2, 1, 1, 0, 0],
  );

  const month = progressOf(list, periodOf("month", "2026-11-01"), day);
  assert.equal(month.submissions.length, 7);
  assert.deepEqual(
    month.buckets.map((bucket) => [bucket.start.slice(8), bucket.end.slice(8), bucket.count]),
    [
      ["01", "07", 0],
      ["08", "14", 1],
      ["15", "21", 5],
      ["22", "28", 0],
      ["29", "30", 1],
    ],
  );
});

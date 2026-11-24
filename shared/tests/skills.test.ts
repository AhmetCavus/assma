import assert from "node:assert/strict";
import { test } from "node:test";
import {
  certificateSchema,
  CV_LAYOUTS,
  CV_THEME_IDS,
  cvDesignSchema,
  educationSchema,
  sortEducation,
  coveredMonths,
  cvMatrix,
  cvRoles,
  defaultSkills,
  formatYears,
  profileInputSchema,
  roleRows,
  skillRows,
  totalYears,
  type ExperienceReference,
} from "../src/index.ts";

const reference = (
  role: string,
  start: string,
  end: string | null,
  skills: string[],
): ExperienceReference => ({
  id: "a".repeat(24),
  organization: "Org",
  role,
  start: start as ExperienceReference["start"],
  end: end as ExperienceReference["end"],
  contribution: "Work.",
  skills,
  skillUsage: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

const references = [
  reference("Android Engineer", "2021-01", "2022-12", ["Kotlin", "TalkBack"]),
  // Overlaps the first by a year: Kotlin counts 2021–2023 once, three years.
  reference("Mobile Engineer", "2022-01", "2023-12", ["kotlin", "Compose"]),
  reference("Android Engineer", "2019-01", "2019-06", ["Java"]),
  reference("Tech Lead", "2025-01", null, ["Kotlin", "Kubernetes"]),
];

test("overlapping periods count once", () => {
  assert.equal(
    coveredMonths([
      { start: 0, end: 11 },
      { start: 6, end: 17 },
    ]),
    18,
  );
  assert.equal(
    coveredMonths([
      { start: 0, end: 5 },
      { start: 6, end: 11 },
    ]),
    12,
  );
  assert.equal(coveredMonths([]), 0);
});

test("the skill matrix sums years per skill, merges spellings and sorts by years", () => {
  const rows = skillRows(references, "2026-12");
  assert.deepEqual(rows[0], { name: "Kotlin", years: 5, projects: 3, lastYear: 2026 });
  assert.deepEqual(
    rows.map((row) => [row.name, row.years]),
    [
      ["Kotlin", 5],
      // Equal years: the more recently used first.
      ["Kubernetes", 2],
      ["Compose", 2],
      ["TalkBack", 2],
      ["Java", 0.5],
    ],
  );
});

test("roles and the total experience come from the same periods", () => {
  assert.deepEqual(
    roleRows(references, "2026-12").map((row) => [row.name, row.years]),
    [
      ["Android Engineer", 2.5],
      ["Tech Lead", 2],
      ["Mobile Engineer", 2],
    ],
  );
  assert.equal(totalYears(references, "2026-12"), 5.5);
});

test("skills the project asks for come first", () => {
  const rows = skillRows(references, "2026-12");
  const project = {
    tech: ["Jetpack Compose", "Kotlin"],
    required: ["Barrierefreiheit mit TalkBack"],
    preferred: [],
  };
  assert.deepEqual(defaultSkills(rows, project, 4), [
    "Kotlin",
    "Compose",
    "TalkBack",
    "Kubernetes",
  ]);
});

test("years read naturally in both languages", () => {
  assert.equal(formatYears(2.5, "de", { one: "Jahr", many: "Jahre" }), "2,5 Jahre");
  assert.equal(formatYears(1, "en", { one: "year", many: "years" }), "1 year");
});

test("phone, website and certificates are validated", () => {
  assert.equal(profileInputSchema.safeParse({ phone: "+49 (0)211 / 123-45" }).success, true);
  assert.equal(profileInputSchema.safeParse({ phone: "ring me" }).success, false);
  assert.equal(
    profileInputSchema.parse({ website: "github.com/mara" }).website,
    "https://github.com/mara",
  );
  assert.equal(profileInputSchema.safeParse({ website: "not a url at all" }).success, false);
  assert.equal(certificateSchema.safeParse({ name: "Scrum Master", year: "2023" }).success, true);
  assert.equal(certificateSchema.safeParse({ name: "", year: "2023" }).success, false);
  assert.equal(certificateSchema.safeParse({ name: "X", year: "23" }).success, false);
});

test("education needs a degree and an end not before its start; newest first", () => {
  assert.equal(
    educationSchema.safeParse({ degree: "M.Sc.", start: "2015", end: "2013" }).success,
    false,
  );
  assert.equal(educationSchema.safeParse({ degree: "", start: "2013" }).success, false);
  assert.deepEqual(
    sortEducation([
      { start: "2010", end: "2013" },
      { start: "2013", end: "" },
      { start: "2013", end: "2015" },
    ]).map((entry) => entry.end),
    ["", "2015", "2013"],
  );
});

test("the design keeps the original layout as default and rejects unknown options", () => {
  assert.equal(CV_LAYOUTS.length, 10);
  assert.equal(CV_THEME_IDS.length, 11);
  assert.equal(CV_LAYOUTS[0], "sidebar");
  assert.deepEqual(cvDesignSchema.parse({}), {
    theme: "aubergine",
    layout: "sidebar",
    photoShape: "circle",
  });
  assert.ok(CV_THEME_IDS.includes("sand"));
  assert.equal(cvDesignSchema.safeParse({ layout: "fancy" }).success, false);
  assert.equal(cvDesignSchema.safeParse({ photoShape: "star" }).success, false);
});

test("the CV matrix lists chosen skills alphabetically with the years set by hand", () => {
  const rows = skillRows(references, "2024-12");
  const talkBack = rows.find((row) => row.name === "TalkBack")!.years;
  const matrix = cvMatrix(rows, ["TalkBack", "kotlin", "Unknown"], { KOTLIN: 7 }, "de");
  assert.deepEqual(
    matrix.map((row) => [row.name, row.years]),
    [
      ["Kotlin", 7],
      ["TalkBack", talkBack],
    ],
  );
});

test("work experience shows the top roles, or the chosen and added ones with their years", () => {
  const rows = [
    { name: "Android Engineer", years: 6, projects: 3, lastYear: 2024 },
    { name: "Mobile Lead", years: 2, projects: 1, lastYear: 2023 },
  ];
  assert.deepEqual(cvRoles(rows, null), [
    { name: "Android Engineer", years: 6 },
    { name: "Mobile Lead", years: 2 },
  ]);
  assert.deepEqual(
    cvRoles(rows, [
      { name: "mobile lead", years: null },
      { name: "Tech Lead", years: 9 },
      // An added role without years has nothing to show.
      { name: "Architect", years: null },
    ]),
    [
      { name: "Tech Lead", years: 9 },
      { name: "mobile lead", years: 2 },
    ],
  );
});

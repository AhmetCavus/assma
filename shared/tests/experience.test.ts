import assert from "node:assert/strict";
import { test } from "node:test";
import {
  experienceReferenceSchema,
  formatPeriod,
  parseSkills,
  profileInputSchema,
  referenceInputSchema,
  referenceLabel,
  sortReferences,
} from "../src/index.ts";

const reference = {
  organization: " Juniper Health ",
  role: "Mobile Engineer",
  start: "2023-01",
  end: "2025-12",
  contribution: "Built a Kotlin and Compose patient check-in flow.",
  skills: ["Kotlin", " jetpack  compose", "kotlin", ""],
};

test("a reference is trimmed and its skills are de-duplicated", () => {
  const parsed = referenceInputSchema.parse(reference);
  assert.equal(parsed.organization, "Juniper Health");
  assert.deepEqual(parsed.skills, ["Kotlin", "jetpack compose"]);
});

test("a reference needs organization, role, a valid start and contribution", () => {
  const result = referenceInputSchema.safeParse({
    ...reference,
    organization: "  ",
    start: "2023-13",
  });
  assert.equal(result.success, false);
  const fields = result.error!.issues.map((issue) => String(issue.path[0]));
  assert.ok(fields.includes("organization"));
  assert.ok(fields.includes("start"));
});

test("an ongoing reference has no end, and an end may not precede the start", () => {
  assert.equal(referenceInputSchema.parse({ ...reference, end: null }).end, null);
  assert.equal(referenceInputSchema.parse({ ...reference, end: undefined }).end, null);
  const result = referenceInputSchema.safeParse({ ...reference, end: "2022-12" });
  assert.equal(result.success, false);
  assert.equal(result.error!.issues[0]?.message, "end_before_start");
  assert.deepEqual(result.error!.issues[0]?.path, ["end"]);
});

test("at most 20 distinct skills are accepted", () => {
  for (const link of ["https://not a link", "localhost", "https://user@evil.example"]) {
    assert.equal(referenceInputSchema.safeParse({ ...reference, links: [link] }).success, false, link);
  }

  const many = Array.from({ length: 21 }, (_, index) => `Skill ${index}`);
  assert.equal(referenceInputSchema.safeParse({ ...reference, skills: many }).success, false);
  assert.equal(
    referenceInputSchema.safeParse({ ...reference, skills: [...many.slice(0, 20), "skill 0"] })
      .success,
    true,
  );
});

test("typed skills split on commas, semicolons, middle dots and lines", () => {
  assert.deepEqual(parseSkills("Kotlin · Jetpack Compose, Offline-first;REST\nkotlin"), [
    "Kotlin",
    "Jetpack Compose",
    "Offline-first",
    "REST",
  ]);
});

test("profile fields default to empty and the email must be an address or empty", () => {
  assert.deepEqual(profileInputSchema.parse({}), {
    name: "",
    headline: "",
    location: "",
    email: "",
    phone: "",
    address: "",
    website: "",
    summary: "",
    certificates: [],
    languages: [],
    education: [],
    hobbies: [],
  });
  assert.equal(profileInputSchema.safeParse({ email: "admin" }).success, false);
  assert.equal(
    profileInputSchema.parse({ email: " mara@linden.example " }).email,
    "mara@linden.example",
  );
});

test("references sort ongoing first, then by end and start, newest first", () => {
  const sorted = sortReferences([
    { id: "a", start: "2019-01", end: "2021-12" },
    { id: "b", start: "2023-01", end: null },
    { id: "c", start: "2021-01", end: "2023-06" },
    { id: "d", start: "2022-01", end: "2023-06" },
  ]);
  assert.deepEqual(
    sorted.map((item) => item.id),
    ["b", "d", "c", "a"],
  );
});

test("labels and periods match the design", () => {
  assert.equal(referenceLabel(0), "E01");
  assert.equal(referenceLabel(11), "E12");
  assert.equal(formatPeriod("2023-01", "2025-12", "de", "heute"), "2023–2025");
  assert.equal(formatPeriod("2024-01", "2024-12", "en", "today"), "2024");
  assert.match(formatPeriod("2023-03", "2024-06", "de", "heute"), /^03\D2023–06\D2024$/);
  assert.equal(formatPeriod("2023-03", null, "en", "today"), "03/2023–today");
});

test("stored references are validated before they leave the API", () => {
  const stored = {
    ...referenceInputSchema.parse(reference),
    id: "a".repeat(24),
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
  assert.equal(experienceReferenceSchema.safeParse(stored).success, true);
  assert.equal(experienceReferenceSchema.safeParse({ ...stored, id: "x" }).success, false);
});

test("project links are completed with https, empty ones dropped and repeats kept once", () => {
  const parsed = referenceInputSchema.parse({
    ...reference,
    links: [" juniper.health/app ", "", "https://juniper.health/app", "http://example.com/case"],
  });
  assert.deepEqual(parsed.links, ["https://juniper.health/app", "http://example.com/case"]);
});

test("project links are optional, so an update without them keeps the stored ones", () => {
  assert.equal(referenceInputSchema.parse(reference).links, undefined);
  assert.deepEqual(referenceInputSchema.parse({ ...reference, links: [] }).links, []);
});

test("a project link must be a web address, and a reference takes at most ten", () => {
  const invalid = referenceInputSchema.safeParse({ ...reference, links: ["not a link"] });
  assert.equal(invalid.success, false);
  assert.equal(invalid.error!.issues[0]!.path[0], "links");
  assert.equal(invalid.error!.issues[0]!.message, "invalid_url");

  const many = Array.from({ length: 11 }, (_, index) => `https://example.com/${index}`);
  const tooMany = referenceInputSchema.safeParse({ ...reference, links: many });
  assert.equal(tooMany.success, false);
  assert.equal(tooMany.error!.issues[0]!.message, "too_many");
});

test("a stored reference without links reads as an empty list", () => {
  const stored = experienceReferenceSchema.parse({
    id: "6b05a056317bdb697f51a66f",
    organization: "Juniper Health",
    role: "Mobile Engineer",
    start: "2023-01",
    end: null,
    contribution: "Check-in.",
    skills: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  assert.deepEqual(stored.links, []);
});

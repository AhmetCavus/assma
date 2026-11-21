import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cvImportApplySchema,
  cvImportRequestSchema,
  estimateCvSeconds,
  isKnownReference,
  mergeSuggestions,
  normaliseSuggestions,
  profileFill,
  profileInputSchema,
  readMonth,
  referenceInputSchema,
  splitCvText,
  suggestionInput,
} from "../src/index.ts";

test("CV dates in common spellings become months", () => {
  assert.equal(readMonth("2023-04", "start"), "2023-04");
  assert.equal(readMonth("04/2023", "start"), "2023-04");
  assert.equal(readMonth("4.2023", "start"), "2023-04");
  assert.equal(readMonth("März 2021", "start"), "2021-03");
  assert.equal(readMonth("Oct 2020", "end"), "2020-10");
  assert.equal(readMonth("2019", "start"), "2019-01");
  assert.equal(readMonth("2021", "end"), "2021-12");
  assert.equal(readMonth("", "start"), null);
  assert.equal(readMonth("13/2023", "start"), null);
  assert.equal(readMonth("1890", "start"), null);
});

test("model output is normalised and limited", () => {
  const suggestions = normaliseSuggestions({
    profile: {
      name: " Mara  Linden ",
      headline: "Android Engineer",
      location: "Düsseldorf",
      email: "not an address",
      summary: "x".repeat(900),
    },
    references: [
      {
        organization: "Juniper Health",
        role: "Mobile Engineer",
        start: "01/2023",
        end: "heute",
        contribution: "Built the check-in.",
        skills: ["Kotlin", "kotlin", 42, "Compose"],
      },
      { organization: "", role: "", start: "2020", end: "2021" },
      "garbage",
      { organization: "Atelier Tools", role: "Engineer", start: "", end: "" },
    ],
  });
  assert.equal(suggestions.profile.name, "Mara Linden");
  assert.equal(suggestions.profile.email, "");
  assert.equal(suggestions.profile.summary.length, 800);
  assert.equal(suggestions.references.length, 2);
  const [juniper, atelier] = suggestions.references;
  assert.deepEqual(
    { start: juniper!.start, end: juniper!.end, ongoing: juniper!.ongoing },
    { start: "2023-01", end: null, ongoing: true },
  );
  assert.deepEqual(juniper!.skills, ["Kotlin", "Compose"]);
  assert.equal(referenceInputSchema.safeParse(suggestionInput(juniper!)).success, true);
  // Missing dates and contribution need review before they can be saved.
  assert.equal(referenceInputSchema.safeParse(suggestionInput(atelier!)).success, false);
});

test("unusable model output yields no suggestions instead of failing", () => {
  assert.deepEqual(normaliseSuggestions(null).references, []);
  assert.deepEqual(normaliseSuggestions({ references: "x" }).references, []);
});

test("a suggestion matching an existing reference is recognised", () => {
  const existing = [{ organization: "Juniper  Health", start: "2023-01" }];
  assert.equal(
    isKnownReference({ organization: "juniper health", start: "2023-01" }, existing),
    true,
  );
  assert.equal(isKnownReference({ organization: "Juniper Health", start: null }, existing), true);
  assert.equal(
    isKnownReference({ organization: "Juniper Health", start: "2019-01" }, existing),
    false,
  );
});

test("CV text is normalised and bounded", () => {
  assert.equal(
    cvImportRequestSchema.parse({ text: `  ${"a".repeat(80)}  \r\nb  ` }).text,
    `${"a".repeat(80)}\nb`,
  );
  assert.equal(cvImportRequestSchema.safeParse({ text: "short" }).success, false);
  assert.equal(cvImportRequestSchema.safeParse({ text: "a".repeat(100_000) }).success, true);
  assert.equal(cvImportRequestSchema.safeParse({ text: "a".repeat(100_001) }).success, false);
});

test("an applied selection is validated like manual entries", () => {
  assert.equal(
    cvImportApplySchema.safeParse({
      references: [{ organization: "X", role: "Y", start: "2020-01", contribution: "" }],
    }).success,
    false,
  );
  assert.deepEqual(cvImportApplySchema.parse({}), { profile: null, references: [] });
});

test("long CVs split at paragraph breaks, overlap, and cover the whole text", () => {
  const paragraphs = Array.from(
    { length: 60 },
    (_, index) => `Position ${index}\n${"x".repeat(480)}`,
  );
  const text = paragraphs.join("\n\n");
  const parts = splitCvText(text, 12_000, 800);
  assert.ok(parts.length >= 3);
  assert.ok(parts.every((part) => part.length <= 12_000));
  // Every paragraph appears whole in at least one part.
  for (const paragraph of paragraphs) {
    assert.ok(
      parts.some((part) => part.includes(paragraph)),
      paragraph.slice(0, 12),
    );
  }
  // Consecutive parts share their boundary text.
  for (let index = 1; index < parts.length; index += 1) {
    const tail = parts[index - 1]!.slice(-300);
    assert.ok(parts[index]!.includes(tail.slice(tail.indexOf("\n") + 1, tail.indexOf("\n") + 40)));
  }
  assert.deepEqual(splitCvText("short CV"), ["short CV"]);
});

const emptyProfile = profileInputSchema.required().parse({});

test("merging keeps one entry per position with the fuller details", () => {
  const base = {
    organization: "Paylane GmbH",
    role: "Backend Developer",
    start: "2022-02" as const,
    end: "2024-04" as const,
    ongoing: false,
    contribution: "SEPA.",
    skills: ["Java"],
  };
  const merged = mergeSuggestions([
    {
      profile: { ...emptyProfile, name: "Jonas", hobbies: ["Segeln"] },
      references: [base],
    },
    {
      profile: {
        ...emptyProfile,
        name: "Other",
        headline: "Developer",
        hobbies: ["segeln", "Klettern"],
      },
      references: [
        {
          ...base,
          organization: "Paylane",
          contribution: "Built the SEPA service.",
          skills: ["Spring"],
        },
        { ...base, organization: "Otto", start: "2020-01" as const },
      ],
    },
  ]);
  assert.equal(merged.profile.name, "Jonas");
  assert.equal(merged.profile.headline, "Developer");
  assert.deepEqual(merged.profile.hobbies, ["Segeln", "Klettern"]);
  assert.equal(merged.references.length, 2);
  assert.equal(merged.references[0]!.contribution, "Built the SEPA service.");
  assert.deepEqual(merged.references[0]!.skills, ["Java", "Spring"]);
});

test("the duration estimate is a range that grows with the text", () => {
  const short = estimateCvSeconds(3000);
  const long = estimateCvSeconds(30_000);
  assert.ok(short.min < short.max && short.max < 120);
  assert.ok(long.min > short.max);
  assert.ok(long.min < long.max);
});

test("contact details, certificates and hobbies are read from the CV", () => {
  const { profile } = normaliseSuggestions({
    profile: {
      name: "Mara",
      phone: "+49 170 1234567",
      address: "Königsallee 1,  40212 Düsseldorf",
      website: "linden.example",
      certificates: [
        { name: "AWS Solutions Architect", issuer: "Amazon", year: "2023" },
        "Scrum Master",
        { name: "aws solutions architect", issuer: "", year: "x" },
      ],
      hobbies: ["Segeln", "segeln", 4, "Klettern"],
    },
  });
  assert.equal(profile.phone, "+49 170 1234567");
  assert.equal(profile.address, "Königsallee 1, 40212 Düsseldorf");
  assert.equal(profile.website, "https://linden.example");
  assert.deepEqual(profile.certificates, [
    { name: "AWS Solutions Architect", issuer: "Amazon", year: "2023" },
    { name: "Scrum Master", issuer: "", year: "" },
  ]);
  assert.deepEqual(profile.hobbies, ["Segeln", "Klettern"]);
  assert.equal(normaliseSuggestions({ profile: { phone: "call me maybe" } }).profile.phone, "");
});

test("an import fills only what the saved profile leaves empty", () => {
  const incoming = {
    ...emptyProfile,
    name: "Mara Linden",
    phone: "+49 170 1",
    hobbies: ["Segeln"],
    certificates: [{ name: "Scrum Master", issuer: "", year: "" }],
  };
  assert.deepEqual(Object.keys(profileFill(null, incoming)).sort(), [
    "certificates",
    "hobbies",
    "name",
    "phone",
  ]);
  const saved = { ...emptyProfile, name: "Mara", hobbies: ["Laufen"], certificates: [] };
  assert.deepEqual(Object.keys(profileFill(saved, incoming)).sort(), ["certificates", "phone"]);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  listingSuggestRequestSchema,
  matchesSearch,
  normaliseListing,
  parseLines,
  projectChangeSchema,
  projectInputSchema,
  sortProjects,
} from "../src/index.ts";

test("a project needs a title; lists are cleaned and de-duplicated", () => {
  assert.equal(projectInputSchema.safeParse({ title: " " }).success, false);
  const project = projectInputSchema.parse({
    title: " Senior Android Engineer ",
    tech: ["Kotlin", "kotlin", " Compose ", ""],
    required: parseLines("- Kotlin und Compose\n• Offline-first, Android\n\n"),
  });
  assert.equal(project.title, "Senior Android Engineer");
  assert.deepEqual(project.tech, ["Kotlin", "Compose"]);
  assert.deepEqual(project.required, ["Kotlin und Compose", "Offline-first, Android"]);
  assert.deepEqual(project.preferred, []);
});

test("source links must be http(s) and contact emails valid", () => {
  assert.equal(
    projectInputSchema.safeParse({ title: "x", sourceUrl: "javascript:alert(1)" }).success,
    false,
  );
  assert.equal(
    projectInputSchema.safeParse({ title: "x", sourceUrl: "ftp://example.com" }).success,
    false,
  );
  assert.equal(
    projectInputSchema.safeParse({ title: "x", sourceUrl: "https://example.com/p/1" }).success,
    true,
  );
  assert.equal(projectInputSchema.safeParse({ title: "x", contactEmail: "jonas" }).success, false);
});

test("a change sets status, archive or both, never nothing", () => {
  assert.equal(projectChangeSchema.safeParse({}).success, false);
  assert.equal(projectChangeSchema.safeParse({ status: "interview" }).success, true);
  assert.equal(projectChangeSchema.safeParse({ status: "won" }).success, false);
  assert.equal(projectChangeSchema.safeParse({ archived: true }).success, true);
});

test("model suggestions for a listing are normalised and bounded", () => {
  const suggestions = normaliseListing({
    title: "  Senior   Android Engineer ",
    company: "Aster Care",
    contactEmail: "not-an-address",
    tech: ["Kotlin", "Kotlin", 3, "Compose"],
    required: Array.from({ length: 40 }, (_, index) => `Requirement ${index}`),
    terms: "Düsseldorf · 80 % remote",
  });
  assert.equal(suggestions.title, "Senior Android Engineer");
  assert.equal(suggestions.agency, "");
  assert.equal(suggestions.contactEmail, "");
  assert.deepEqual(suggestions.tech, ["Kotlin", "Compose"]);
  assert.equal(suggestions.required.length, 30);
  assert.deepEqual(normaliseListing("garbage").tech, []);
});

test("search ignores case and accents across title, client and agency", () => {
  const project = {
    title: "Kotlin Platform Engineer",
    company: "Grove Ledger",
    agency: "Talentmühle",
  };
  assert.equal(matchesSearch(project, "grove"), true);
  assert.equal(matchesSearch(project, "talentmuhle"), true);
  assert.equal(matchesSearch(project, "react"), false);
  assert.equal(matchesSearch(project, "  "), true);
});

test("projects sort newest first and listing text is bounded", () => {
  const sorted = sortProjects([
    { id: "a", createdAt: "2026-11-12T10:00:00.000Z" },
    { id: "b", createdAt: "2026-11-18T10:00:00.000Z" },
  ]);
  assert.deepEqual(
    sorted.map((project) => project.id),
    ["b", "a"],
  );
  assert.equal(listingSuggestRequestSchema.safeParse({ text: "too short" }).success, false);
  assert.equal(listingSuggestRequestSchema.safeParse({ text: "x".repeat(30_001) }).success, false);
});

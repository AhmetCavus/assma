import assert from "node:assert/strict";
import { test } from "node:test";
import {
  draftTitle,
  linksIn,
  listingSuggestRequestSchema,
  matchesSearch,
  normaliseListing,
  parseLines,
  projectChangeSchema,
  projectDraftRequestSchema,
  quickInputOf,
  textDraftTitle,
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

test("quick add finds every link in pasted text, once and without trailing punctuation", () => {
  assert.deepEqual(
    linksIn(
      "Schau mal: https://www.freelancermap.de/projekt/java-entwickler-123.html, und\n" +
        "(https://example.com/jobs/42) sowie https://www.freelancermap.de/projekt/java-entwickler-123.html",
    ),
    [
      "https://www.freelancermap.de/projekt/java-entwickler-123.html",
      "https://example.com/jobs/42",
    ],
  );
  assert.deepEqual(linksIn("no link here, ftp://x.org is not one"), []);
});

test("a draft gets a readable stand-in title from its link", () => {
  assert.equal(
    draftTitle("https://www.freelancermap.de/projekt/senior-java-entwickler-m-w-d.html"),
    "freelancermap.de · senior java entwickler m w d",
  );
  assert.equal(draftTitle("https://jobs.example.com/view/8834512"), "jobs.example.com");
  assert.equal(draftTitle("https://example.com/"), "example.com");
  assert.equal(
    draftTitle("https://example.com/K%C3%B6ln-Data_Engineer"),
    "example.com · Köln Data Engineer",
  );
});

test("quick add takes 1 to 20 http(s) links and drops repeats", () => {
  assert.deepEqual(
    projectDraftRequestSchema.parse({ urls: ["https://a.example/1", "https://a.example/1"] }),
    { urls: ["https://a.example/1"] },
  );
  assert.equal(projectDraftRequestSchema.safeParse({ urls: [] }).success, false);
  assert.equal(
    projectDraftRequestSchema.safeParse({ urls: ["javascript:alert(1)"] }).success,
    false,
  );
  assert.equal(projectDraftRequestSchema.safeParse({ urls: [""] }).success, false);
  assert.equal(
    projectDraftRequestSchema.safeParse({
      urls: Array.from({ length: 21 }, (_, index) => `https://a.example/${index}`),
    }).success,
    false,
  );
});

test("quick add tells links from listing text", () => {
  assert.deepEqual(quickInputOf("https://a.example/1\nhttps://a.example/2"), {
    kind: "links",
    urls: ["https://a.example/1", "https://a.example/2"],
  });
  // A short note around links is still links.
  assert.deepEqual(quickInputOf("Schau mal hier: https://a.example/1 und das!"), {
    kind: "links",
    urls: ["https://a.example/1"],
  });
  const listing =
    "Senior Android Entwickler (m/w/d)\nRemote, 6 Monate. Kotlin, Jetpack Compose und Erfahrung mit Barrierefreiheit.\nhttps://jobs.example/android";
  assert.deepEqual(quickInputOf(`  ${listing}\r\n`), {
    kind: "text",
    text: listing,
    url: "https://jobs.example/android",
  });
  assert.equal(quickInputOf("Android, Kotlin").kind, "empty");
  assert.equal(quickInputOf("   ").kind, "empty");
});

test("a text draft is titled by its first line with words", () => {
  assert.equal(
    textDraftTitle("https://jobs.example/x\n\n  Senior Android Entwickler (m/w/d)  \nRemote"),
    "Senior Android Entwickler (m/w/d)",
  );
  assert.equal(textDraftTitle("x".repeat(30) + " " + "y".repeat(80)).length, 80);
  assert.equal(textDraftTitle("--- 123 ---"), "");
});

test("quick add takes a pasted listing with an optional source link", () => {
  const listing = "Wir suchen eine Android-Entwicklerin mit Kotlin für ein Gesundheitsprojekt.";
  assert.deepEqual(projectDraftRequestSchema.parse({ text: `${listing}\r\n` }), {
    text: listing,
    url: "",
  });
  assert.equal(projectDraftRequestSchema.safeParse({ text: "zu kurz" }).success, false);
  assert.equal(
    projectDraftRequestSchema.safeParse({ text: listing, url: "javascript:alert(1)" }).success,
    false,
  );
  assert.equal(projectDraftRequestSchema.safeParse({ text: "x".repeat(30_001) }).success, false);
});

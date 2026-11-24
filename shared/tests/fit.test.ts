import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cvDraftSchema,
  SAVED_CV_LIMITS,
  savedCvInputSchema,
  fitBasis,
  fitSummary,
  normaliseFindings,
  requirementsOf,
  scoreFindings,
  supportingReferences,
  type Finding,
} from "../src/index.ts";

const E01 = "a".repeat(24);
const E02 = "b".repeat(24);
const E03 = "c".repeat(24);
const labels = new Map([
  ["E01", E01],
  ["E02", E02],
  ["E03", E03],
]);
const project = {
  required: ["Kotlin und Jetpack Compose", "Offline-first-Android", "Android-Barrierefreiheit"],
  preferred: ["Release-Verantwortung", "FHIR R4"],
};

test("the concept's example scores 6.5 of 8 points, 8/10", () => {
  const findings = normaliseFindings(
    {
      findings: [
        { requirement: 1, status: "confirmed", references: ["E01"], note: "Compose" },
        { requirement: 2, status: "confirmed", references: ["e01"], note: "Queue" },
        { requirement: 3, status: "confirmed", references: ["E02"], note: "TalkBack" },
        { requirement: 4, status: "partial", references: ["E03"], note: "CI" },
        { requirement: 5, status: "missing", references: [], note: "No FHIR" },
      ],
    },
    requirementsOf(project),
    labels,
  );
  assert.deepEqual(scoreFindings(findings), { score: 8, points: 6.5, maxPoints: 8 });
  assert.deepEqual(
    fitSummary({ findings }).open.map((finding) => finding.requirement),
    ["Release-Verantwortung", "FHIR R4"],
  );
  // Juniper supports two required items, Kite one, Atelier half a preferred one.
  assert.deepEqual(supportingReferences({ findings }), [E01, E02, E03]);
});

test("unsupported claims and skipped requirements count as missing", () => {
  const findings = normaliseFindings(
    {
      findings: [
        { requirement: 1, status: "confirmed", references: [], note: "trust me" },
        { requirement: 2, status: "partial", references: ["E99"], note: "unknown label" },
        { requirement: 2, status: "confirmed", references: ["E01"], note: "duplicate answer" },
        { requirement: 9, status: "confirmed", references: ["E01"], note: "no such requirement" },
        { requirement: 4, status: "excellent", references: ["E01"], note: "bad status" },
      ],
    },
    requirementsOf(project),
    labels,
  );
  assert.deepEqual(
    findings.map((finding) => finding.status),
    ["missing", "missing", "missing", "missing", "missing"],
  );
  assert.equal(findings[1]!.note, "unknown label");
  assert.ok(findings.every((finding) => finding.referenceIds.length === 0 && !finding.edited));
  assert.deepEqual(normaliseFindings("garbage", requirementsOf(project), labels).length, 5);
});

test("scores scale to 1–10; no requirements means unscored", () => {
  const finding = (kind: Finding["kind"], status: Finding["status"]) => ({ kind, status });
  assert.equal(scoreFindings([finding("required", "missing")]).score, 1);
  assert.equal(scoreFindings([finding("required", "confirmed")]).score, 10);
  assert.equal(
    scoreFindings([finding("required", "partial"), finding("preferred", "missing")]).score,
    3,
  );
  assert.deepEqual(scoreFindings([]), { score: null, points: 0, maxPoints: 0 });
});

test("the fingerprint changes with requirements or references, not with their order", () => {
  const references = [
    { id: E01, updatedAt: "2026-11-20T10:00:00.000Z" },
    { id: E02, updatedAt: "2026-11-20T10:00:00.000Z" },
  ];
  const basis = fitBasis(project, references);
  assert.equal(fitBasis(project, [...references].reverse()), basis);
  assert.notEqual(fitBasis({ ...project, preferred: ["FHIR R4"] }, references), basis);
  assert.notEqual(
    fitBasis(project, [references[0]!, { id: E02, updatedAt: "2026-11-21T08:00:00.000Z" }]),
    basis,
  );
  assert.notEqual(fitBasis(project, references.slice(0, 1)), basis);
});

test("a CV draft keeps each reference once, in order", () => {
  assert.deepEqual(cvDraftSchema.parse({ summary: " Hi ", referenceIds: [E02, E01, E02] }), {
    summary: "Hi",
    language: null,
    design: { theme: "aubergine", layout: "sidebar", photoShape: "circle" },
    imageId: null,
    skills: null,
    skillYears: {},
    roles: null,
    referenceIds: [E02, E01],
  });
  assert.equal(cvDraftSchema.safeParse({ referenceIds: ["x"] }).success, false);
});

test("a CV draft keeps years in half-year steps and each role once", () => {
  const draft = cvDraftSchema.parse({
    skillYears: { Kotlin: 7.5 },
    roles: [
      { name: "Tech Lead", years: 3 },
      { name: " tech lead ", years: 4 },
      { name: "Android Engineer" },
    ],
  });
  assert.deepEqual(draft.skillYears, { Kotlin: 7.5 });
  assert.deepEqual(draft.roles, [
    { name: "Tech Lead", years: 3 },
    { name: "Android Engineer", years: null },
  ]);
  assert.equal(cvDraftSchema.safeParse({ skillYears: { Kotlin: 7.3 } }).success, false);
  assert.equal(cvDraftSchema.safeParse({ skillYears: { Kotlin: 0 } }).success, false);
  assert.equal(cvDraftSchema.safeParse({ roles: [{ name: "", years: 2 }] }).success, false);
});

test("a saved CV needs a name and keeps the full configuration", () => {
  const saved = savedCvInputSchema.parse({
    name: "  Android senior ",
    cv: { summary: "Hi", roles: [{ name: "Tech Lead", years: 3 }] },
  });
  assert.equal(saved.name, "Android senior");
  assert.deepEqual(saved.cv.roles, [{ name: "Tech Lead", years: 3 }]);
  assert.equal(saved.cv.design.layout, "sidebar");
  assert.equal(savedCvInputSchema.safeParse({ name: " ", cv: {} }).success, false);
  assert.equal(
    savedCvInputSchema.safeParse({ name: "x".repeat(SAVED_CV_LIMITS.name + 1), cv: {} }).success,
    false,
  );
});

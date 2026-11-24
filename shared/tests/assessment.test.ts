import assert from "node:assert/strict";
import { test } from "node:test";
import {
  confirmUsage,
  DEFAULT_ECONOMIC_PREFERENCES,
  economicFit,
  economicPreferencesSchema,
  evidence,
  formalFit,
  formalItem,
  readAssessment,
  referenceInputSchema,
  requirementId,
  skillFactsInputSchema,
  skillMatches,
  technicalFit,
  UNKNOWN_CONDITIONS,
  usageOf,
  type Candidate,
  type Correction,
  type CvEvidenceInput,
  type Requirement,
  type RequirementGroup,
  type SkillUsage,
  type StoredAssessment,
  type TechnicalResult,
} from "../src/index.ts";

// ---------------------------------------------------------------------------------------
// Fixtures

type Ref = Candidate["references"][number];

const ref = (
  id: string,
  start: string,
  end: string | null,
  skills: string[],
  skillUsage: SkillUsage[] = [],
  contribution = "",
): Ref => ({
  id,
  organization: `Org ${id}`,
  role: "Engineer",
  contribution,
  start,
  end,
  skills,
  skillUsage,
});

const candidateWith = (over: Partial<Candidate> = {}): Candidate => ({
  references: [],
  profile: { summary: "", headline: "", education: [], languages: [], certificates: [] },
  skillFacts: [],
  today: "2026-11",
  ...over,
});

function req(normalised: string, over: Partial<Requirement> = {}): Requirement {
  const category = over.category ?? "technical";
  return {
    id: requirementId(category, normalised),
    groupId: `g-${normalised}`,
    text: normalised,
    normalised,
    category,
    months: null,
    level: null,
    terms: [normalised],
    dimensions: ["technical", "formal", "evidence"],
    ...over,
  };
}

function assessmentOf(
  requirements: Requirement[],
  options: {
    groups?: RequirementGroup[];
    technical?: TechnicalResult[];
    corrections?: Correction[];
  } = {},
): StoredAssessment {
  const groups =
    options.groups ??
    [...new Set(requirements.map((requirement) => requirement.groupId))].map((id) => ({
      id,
      operator: "all" as const,
      mandatory: true,
      source: id,
    }));
  return {
    version: 2,
    fingerprint: "f",
    groups,
    requirements,
    technical: options.technical ?? [],
    corrections: options.corrections ?? [],
    incomplete: false,
    assessedAt: "2026-11-23T10:00:00.000Z",
  };
}

const judged = (
  requirement: Requirement,
  state: TechnicalResult["state"],
  referenceIds: string[] = [],
  onboarding: TechnicalResult["onboarding"] = "unknown",
): TechnicalResult => ({
  requirementId: requirement.id,
  state,
  onboarding,
  cites: referenceIds.map((key) => ({ kind: "reference", key })),
  note: "",
});

// ---------------------------------------------------------------------------------------
// 1.1 Stored assessments are read leniently.

test("a stored assessment degrades bad pieces instead of failing", () => {
  const kotlin = req("Kotlin");
  const read = readAssessment({
    version: 2,
    fingerprint: "abc",
    groups: [{ id: kotlin.groupId, operator: "all", mandatory: true, source: "Kotlin" }],
    requirements: [kotlin, { ...kotlin, id: "orphan", groupId: "missing-group" }],
    technical: [
      {
        requirementId: kotlin.id,
        state: "excellent",
        onboarding: "soon",
        cites: [{ kind: "x" }],
        note: 5,
      },
      {
        requirementId: "unknown-requirement",
        state: "direct",
        onboarding: "low",
        cites: [],
        note: "",
      },
    ],
    corrections: [{ requirementId: kotlin.id, formal: "fulfilled" }, { nonsense: true }],
    assessedAt: "not a date",
  });
  assert.ok(read);
  assert.equal(read.requirements.length, 1);
  assert.deepEqual(read.technical, [
    { requirementId: kotlin.id, state: "unknown", onboarding: "unknown", cites: [], note: "" },
  ]);
  assert.equal(read.corrections.length, 1);
  assert.equal(read.corrections[0]!.formal, "fulfilled");
  assert.equal(read.assessedAt, new Date(0).toISOString());
  assert.equal(readAssessment({ version: 1 }), null);
  assert.equal(readAssessment(null), null);
});

test("requirement ids are stable across reassessments", () => {
  assert.equal(requirementId("technical", "GitLab CI"), requirementId("technical", " gitlab ci "));
  assert.notEqual(requirementId("technical", "Kotlin"), requirementId("language", "Kotlin"));
});

// ---------------------------------------------------------------------------------------
// 1.2 Skill usage and skill facts.

test("skill usage must lie inside the engagement and only covers listed skills", () => {
  const base = {
    organization: "Juniper",
    role: "Engineer",
    start: "2023-01",
    end: "2024-12",
    contribution: "Work.",
    skills: ["Kotlin", "Room"],
  };
  const parsed = referenceInputSchema.parse({
    ...base,
    skillUsage: [
      { skill: "kotlin", period: "engagement" },
      { skill: "Swift", period: "engagement" },
      { skill: "Room", period: { start: "2023-06", end: "2024-01" } },
    ],
  });
  assert.deepEqual(parsed.skillUsage, [
    { skill: "Kotlin", period: "engagement" },
    { skill: "Room", period: { start: "2023-06", end: "2024-01" } },
  ]);
  assert.equal(
    referenceInputSchema.safeParse({
      ...base,
      skillUsage: [{ skill: "Room", period: { start: "2022-06", end: "2024-01" } }],
    }).success,
    false,
  );
  // Left out, the stored usage is kept by the server.
  assert.equal(referenceInputSchema.parse(base).skillUsage, undefined);
});

test("several skills are confirmed for the whole engagement in one step", () => {
  const usage = confirmUsage(
    {
      skills: ["Kotlin", "Jetpack Compose", "Room", "GitLab"],
      skillUsage: [{ skill: "GitLab", period: { start: "2023-02", end: "2023-08" } }],
    },
    ["Kotlin", "jetpack compose", "Room"],
  );
  assert.deepEqual(usage, [
    { skill: "Kotlin", period: "engagement" },
    { skill: "Jetpack Compose", period: "engagement" },
    { skill: "Room", period: "engagement" },
    { skill: "GitLab", period: { start: "2023-02", end: "2023-08" } },
  ]);
});

test("one skill fact per skill, the last one wins", () => {
  assert.deepEqual(
    skillFactsInputSchema.parse({
      facts: [
        { skill: "GitLab", status: "complete" },
        { skill: "gitlab", status: "none" },
      ],
    }).facts,
    [{ skill: "gitlab", status: "none" }],
  );
});

// ---------------------------------------------------------------------------------------
// 1.3 Durations.

test("overlapping confirmed periods count each month once", () => {
  const usage = usageOf(
    ["Kotlin"],
    [
      ref("a", "2022-01", "2022-12", ["Kotlin"], [{ skill: "Kotlin", period: "engagement" }]),
      ref("b", "2022-07", "2023-06", ["Kotlin"], [{ skill: "Kotlin", period: "engagement" }]),
    ],
    { today: "2026-11" },
  );
  assert.equal(usage.confirmedMonths, 18);
  assert.equal(usage.possibleMonths, 18);
});

test("a stated usage period beats the engagement; assumed months are kept apart", () => {
  const stated = usageOf(
    ["GitLab"],
    [
      ref(
        "a",
        "2020-01",
        "2023-12",
        ["GitLab CI"],
        [{ skill: "GitLab CI", period: { start: "2022-01", end: "2022-12" } }],
      ),
    ],
  );
  assert.equal(stated.confirmedMonths, 12);
  const assumed = usageOf(["GitLab"], [ref("a", "2019-01", "2022-12", ["GitLab"])]);
  assert.equal(assumed.confirmedMonths, 0);
  assert.equal(assumed.possibleMonths, 48);
  assert.equal(assumed.references[0]!.usage, "assumed");
});

test("skill names match across spellings but not across different technologies", () => {
  assert.ok(skillMatches("K8s", "Kubernetes"));
  assert.ok(skillMatches("GitLab CI/CD", "GitLab"));
  assert.ok(skillMatches("Jetpack Compose", "jetpack compose"));
  assert.ok(!skillMatches("JavaScript", "Java"));
  assert.ok(!skillMatches("Kotlin Multiplatform", "Swift"));
});

// ---------------------------------------------------------------------------------------
// 1.4 Technical Fit.

test("alternatives count by their best member, never as both", () => {
  const gitlab = req("GitLab CI", { groupId: "ci" });
  const actions = req("GitHub Actions", { groupId: "ci" });
  const candidate = candidateWith({ references: [ref("a", "2022-01", null, ["GitLab CI"])] });
  const fit = technicalFit(
    assessmentOf([gitlab, actions], {
      groups: [
        { id: "ci", operator: "any", mandatory: true, source: "GitLab CI or GitHub Actions" },
      ],
      technical: [judged(gitlab, "direct", ["a"]), judged(actions, "transferable", ["a"], "low")],
    }),
    candidate,
  );
  assert.equal(fit.score, 10);
  assert.equal(fit.coverage, 1);
});

test("unknown is left out of the score and shown as coverage; split sentences do not gain weight", () => {
  const kotlin = req("Kotlin", { groupId: "mobile" });
  const coroutines = req("Coroutines", { groupId: "mobile" });
  const compose = req("Jetpack Compose", { groupId: "mobile" });
  const fhir = req("FHIR R4", { groupId: "fhir" });
  const candidate = candidateWith({ references: [ref("a", "2022-01", null, ["Kotlin"])] });
  const fit = technicalFit(
    assessmentOf([kotlin, coroutines, compose, fhir], {
      groups: [
        {
          id: "mobile",
          operator: "all",
          mandatory: true,
          source: "Kotlin, Coroutines and Compose",
        },
        { id: "fhir", operator: "all", mandatory: false, source: "FHIR R4" },
      ],
      technical: [
        judged(kotlin, "direct", ["a"]),
        judged(coroutines, "direct", ["a"]),
        judged(compose, "unknown"),
        judged(fhir, "unknown"),
      ],
    }),
    candidate,
  );
  // Mandatory group weight 2 shared by three members; two of them known and direct.
  assert.equal(fit.score, 10);
  assert.equal(fit.coverage, (2 * (2 / 3)) / 3);
  assert.equal(fit.counts.unknown, 2);
});

test("a match or gap without existing evidence is unknown; a denied skill is a gap", () => {
  const kotlin = req("Kotlin");
  const ml = req("Machine Learning");
  const terraform = req("Terraform");
  const candidate = candidateWith({
    references: [ref("a", "2022-01", null, ["Kotlin"])],
    skillFacts: [{ skill: "terraform", status: "none" }],
  });
  const fit = technicalFit(
    assessmentOf([kotlin, ml, terraform], {
      technical: [judged(kotlin, "direct", ["does-not-exist"]), judged(ml, "gap")],
    }),
    candidate,
  );
  const state = (requirement: Requirement) =>
    fit.items.find((entry) => entry.requirement.id === requirement.id)!.state;
  assert.equal(state(kotlin), "unknown");
  assert.equal(state(ml), "unknown");
  assert.equal(state(terraform), "gap");
  assert.equal(fit.score, 0);
});

test("a verified gap with cited related experience stays a gap", () => {
  const ml = req("Machine Learning");
  const candidate = candidateWith({
    references: [
      ref("a", "2018-01", null, ["Java", "Kotlin"], [], "General software engineering."),
    ],
  });
  const fit = technicalFit(
    assessmentOf([ml], { technical: [judged(ml, "gap", ["a"])] }),
    candidate,
  );
  assert.equal(fit.items[0]!.state, "gap");
});

// ---------------------------------------------------------------------------------------
// 1.5 Formal Fit.

const gitlab36 = req("GitLab", { months: 36 });
const gitlabRefs = [
  ref("a", "2020-01", "2021-06", ["GitLab"], [{ skill: "GitLab", period: "engagement" }]),
  ref("b", "2022-01", "2022-12", ["GitLab"], [{ skill: "GitLab", period: "engagement" }]),
];

test("30 of 36 confirmed months with complete data is a blocker; Technical stays independent", () => {
  const candidate = candidateWith({
    references: gitlabRefs,
    skillFacts: [{ skill: "GitLab", status: "complete" }],
  });
  const assessment = assessmentOf([gitlab36], {
    technical: [judged(gitlab36, "direct", ["a", "b"])],
  });
  const formal = formalFit(assessment, candidate);
  const item = formal.items[0]!;
  assert.equal(item.state, "not_fulfilled");
  assert.deepEqual(item.duration, { required: 36, confirmed: 30, possible: 30, gap: 6 });
  assert.equal(formal.blockers.length, 1);
  assert.equal(technicalFit(assessment, candidate).items[0]!.state, "direct");
});

test("the same shortfall without confirmed completeness is an unverified risk", () => {
  const candidate = candidateWith({ references: gitlabRefs });
  const formal = formalFit(assessmentOf([gitlab36]), candidate);
  const item = formal.items[0]!;
  assert.equal(item.state, "unverified");
  assert.equal(item.duration!.gap, 6);
  assert.equal(formal.risks.length, 1);
  assert.equal(formal.blockers.length, 0);
  assert.ok(item.actions.some((action) => action.kind === "confirm_complete"));
});

test("assumed months never satisfy a duration; confirming the usage does", () => {
  const assumed = candidateWith({ references: [ref("a", "2019-01", "2023-12", ["GitLab"])] });
  const before = formalItem(gitlab36, assessmentOf([gitlab36]), assumed);
  assert.equal(before.state, "unverified");
  assert.equal(before.duration!.possible, 60);
  assert.deepEqual(before.actions[0], {
    kind: "confirm_usage",
    referenceIds: ["a"],
    skill: "GitLab",
  });
  const confirmed = candidateWith({
    references: [
      {
        ...assumed.references[0]!,
        skillUsage: confirmUsage(assumed.references[0]!, ["GitLab"]),
      },
    ],
  });
  assert.equal(formalItem(gitlab36, assessmentOf([gitlab36]), confirmed).state, "fulfilled");
});

test("an undocumented skill is unverified and technically unknown, not missing", () => {
  const terraform = req("Terraform");
  const candidate = candidateWith({ references: [ref("a", "2022-01", null, ["Kotlin"])] });
  const assessment = assessmentOf([terraform], { technical: [judged(terraform, "gap")] });
  const formal = formalFit(assessment, candidate);
  assert.equal(formal.items[0]!.state, "unverified");
  assert.equal(formal.items[0]!.reason, "undocumented");
  assert.ok(formal.items[0]!.actions.some((action) => action.kind === "deny"));
  assert.equal(technicalFit(assessment, candidate).items[0]!.state, "unknown");
  // Denying it makes it a gap and a blocker.
  const denied = candidateWith({
    ...candidate,
    skillFacts: [{ skill: "Terraform", status: "none" }],
  });
  assert.equal(formalFit(assessment, denied).blockers.length, 1);
});

test("a completed degree comes from the education profile, not from references", () => {
  const degree = req("University degree in computer science", {
    category: "education",
    level: "degree",
    terms: ["University degree in computer science", "Informatik"],
  });
  const candidate = candidateWith({
    profile: {
      ...candidateWith().profile,
      education: [
        {
          degree: "B.Sc. Informatik",
          institution: "Hochschule Düsseldorf",
          start: "2015",
          end: "2019",
          note: "",
        },
      ],
    },
  });
  const item = formalItem(degree, assessmentOf([degree]), candidate);
  assert.equal(item.state, "fulfilled");
  assert.deepEqual(item.cites, [{ kind: "education", key: "B.Sc. Informatik" }]);
  // An unfinished or unlisted degree is not a confirmed fact against the requirement.
  const studying = candidateWith({
    profile: {
      ...candidateWith().profile,
      education: [
        { degree: "M.Sc. Informatik", institution: "", start: "2025", end: "", note: "" },
      ],
    },
  });
  assert.equal(formalItem(degree, assessmentOf([degree]), studying).state, "unverified");
  assert.equal(formalItem(degree, assessmentOf([degree]), candidateWith()).state, "unverified");
});

test("languages are compared with the language profile", () => {
  const profile = {
    ...candidateWith().profile,
    languages: [
      { name: "Deutsch", level: "native" as const },
      { name: "Englisch", level: "B2" as const },
    ],
  };
  const candidate = candidateWith({ profile });
  const german = req("German", { category: "language", level: "C1" });
  const english = req("English", { category: "language", level: "C1" });
  const french = req("French", { category: "language", level: "B1" });
  const fit = formalFit(assessmentOf([german, english, french]), candidate);
  const byName = (name: string) =>
    fit.items.find((entry) => entry.requirement.normalised === name)!;
  assert.equal(byName("German").state, "fulfilled");
  assert.equal(byName("English").state, "not_fulfilled");
  assert.deepEqual(byName("English").levels, { required: "C1", listed: "B2" });
  assert.equal(byName("French").state, "unverified");
});

test("a missing certificate is unverified; a listed one is fulfilled", () => {
  const scrum = req("Professional Scrum Master", { category: "certification" });
  const listed = candidateWith({
    profile: {
      ...candidateWith().profile,
      certificates: [{ name: "Professional Scrum Master I", issuer: "Scrum.org", year: "2022" }],
    },
  });
  assert.equal(formalItem(scrum, assessmentOf([scrum]), listed).state, "fulfilled");
  assert.equal(formalItem(scrum, assessmentOf([scrum]), candidateWith()).state, "unverified");
});

test("transferable experience never fulfils a formal requirement; a correction always wins", () => {
  const gitlab = req("GitLab CI");
  const candidate = candidateWith({ references: [ref("a", "2020-01", null, ["Azure DevOps"])] });
  const transferable = assessmentOf([gitlab], {
    technical: [judged(gitlab, "transferable", ["a"], "low")],
  });
  assert.equal(formalItem(gitlab, transferable, candidate).state, "unverified");
  assert.equal(technicalFit(transferable, candidate).items[0]!.state, "transferable");
  const corrected = assessmentOf([gitlab], {
    technical: transferable.technical,
    corrections: [{ requirementId: gitlab.id, technical: null, formal: "fulfilled", note: "" }],
  });
  assert.equal(formalItem(gitlab, corrected, candidate).state, "fulfilled");
});

test("the formal summary counts mandatory entries, risks, blockers and OR groups once", () => {
  const kotlin = req("Kotlin");
  const terraform = req("Terraform");
  const english = req("English", { category: "language", level: "C1" });
  const remote = req("80 % remote", { category: "conditions", dimensions: ["economic", "formal"] });
  const gitlab = req("GitLab CI", { groupId: "ci" });
  const actions = req("GitHub Actions", { groupId: "ci" });
  const candidate = candidateWith({
    references: [ref("a", "2022-01", null, ["Kotlin", "GitLab CI"])],
    profile: { ...candidateWith().profile, languages: [{ name: "English", level: "B2" }] },
  });
  const fit = formalFit(
    assessmentOf([kotlin, terraform, english, remote, gitlab, actions], {
      groups: [
        { id: kotlin.groupId, operator: "all", mandatory: true, source: "" },
        { id: terraform.groupId, operator: "all", mandatory: true, source: "" },
        { id: english.groupId, operator: "all", mandatory: true, source: "" },
        { id: remote.groupId, operator: "all", mandatory: true, source: "" },
        { id: "ci", operator: "any", mandatory: true, source: "" },
      ],
    }),
    candidate,
  );
  assert.deepEqual(fit.mandatory, { fulfilled: 2, total: 4 });
  assert.equal(fit.risks.length, 1);
  assert.equal(fit.blockers.length, 1);
  assert.equal(fit.blockers[0]!.items[0]!.requirement.normalised, "English");
});

// ---------------------------------------------------------------------------------------
// 1.6 Evidence.

const evidenceCandidate = candidateWith({
  references: [
    ref(
      "juniper",
      "2023-01",
      null,
      ["Kotlin", "Jetpack Compose"],
      [],
      "Patient check-in with Kotlin.",
    ),
    ref(
      "kite",
      "2021-03",
      "2022-12",
      ["Accessibility", "Scrum"],
      [],
      "Accessible ticket purchase with the screen reader.",
    ),
  ],
});
const scrum = req("Scrum", { category: "methodology" });
const talkback = req("TalkBack");
const kotlinReq = req("Kotlin");
const ml = req("Machine Learning");
const evidenceAssessment = assessmentOf([scrum, talkback, kotlinReq, ml], {
  technical: [
    judged(scrum, "direct", ["kite"]),
    judged(talkback, "partial", ["kite"], "low"),
    judged(kotlinReq, "direct", ["juniper"]),
  ],
});
const cvWith = (referenceIds: string[], summary = ""): CvEvidenceInput => ({
  summary,
  referenceIds,
  skills: null,
});

test("evidence tells undocumented experience from missing profile data", () => {
  const result = evidence(evidenceAssessment, evidenceCandidate, cvWith(["juniper"]));
  const byName = (name: string) =>
    result.items.find((entry) => entry.requirement.normalised === name);
  assert.equal(byName("Kotlin")!.state, "full");
  assert.equal(byName("Scrum")!.state, "missing");
  assert.deepEqual(byName("Scrum")!.suggestions, [
    { kind: "select_reference", referenceId: "kite" },
  ]);
  // Machine Learning has no data at all: profile data is missing, the CV is not to blame.
  assert.equal(byName("Machine Learning"), undefined);
  assert.deepEqual(
    result.missingProfileData.map((entry) => entry.requirement.normalised),
    ["Machine Learning"],
  );
  assert.equal(result.gaps, 2);
});

test("documented work without the required keyword is partially evidenced", () => {
  const result = evidence(evidenceAssessment, evidenceCandidate, cvWith(["juniper", "kite"]));
  const item = result.items.find((entry) => entry.requirement.normalised === "TalkBack")!;
  assert.equal(item.state, "partial");
  assert.deepEqual(item.missingKeywords, ["TalkBack"]);
  assert.deepEqual(item.suggestions, [
    { kind: "mention_in_summary", term: "TalkBack", referenceId: "kite" },
  ]);
});

test("without a CV the evidence score is not available, but missing profile data is shown", () => {
  const result = evidence(evidenceAssessment, evidenceCandidate, null);
  assert.equal(result.available, false);
  assert.equal(result.score, null);
  assert.equal(result.missingProfileData.length, 1);
});

test("missing competencies are never turned into CV suggestions", () => {
  const result = evidence(evidenceAssessment, evidenceCandidate, cvWith([]));
  const suggested = result.items.flatMap((entry) => entry.suggestions);
  assert.ok(
    suggested.every(
      (suggestion) =>
        suggestion.kind !== "add_skill" ||
        evidenceCandidate.references.some((reference) =>
          reference.skills.includes(suggestion.skill),
        ),
    ),
  );
  assert.ok(
    !suggested.some((suggestion) => "term" in suggestion && suggestion.term === "Machine Learning"),
  );
});

test("a better CV raises Evidence without touching Technical or Formal Fit", () => {
  const before = cvWith(["juniper"]);
  const after = cvWith(["juniper", "kite"], "Accessibility with TalkBack.");
  const technicalBefore = technicalFit(evidenceAssessment, evidenceCandidate);
  const formalBefore = formalFit(evidenceAssessment, evidenceCandidate);
  const scoreBefore = evidence(evidenceAssessment, evidenceCandidate, before).score!;
  const scoreAfter = evidence(evidenceAssessment, evidenceCandidate, after).score!;
  assert.ok(scoreAfter > scoreBefore, `${scoreAfter} > ${scoreBefore}`);
  assert.deepEqual(technicalFit(evidenceAssessment, evidenceCandidate), technicalBefore);
  assert.deepEqual(formalFit(evidenceAssessment, evidenceCandidate), formalBefore);
});

// ---------------------------------------------------------------------------------------
// 1.7 Economic Fit.

const preferences = economicPreferencesSchema.parse({
  freelance: { target: 100, minimum: 80, unit: "hour" },
  employment: { target: 90_000, minimum: 70_000, referenceHours: 40 },
  remote: { target: 100, minimum: 50 },
  contracts: { preferred: ["freelance"], acceptable: ["employment"] },
  duration: { minimum: 3, target: 6, maximum: 24 },
  workload: { target: 32, maximum: 40 },
  travel: { target: "none", maximum: "occasional" },
});

test("unknown compensation is not penalised but lowers coverage", () => {
  const known = economicFit(
    {
      ...UNKNOWN_CONDITIONS,
      contract: "freelance",
      remote: 100,
      months: 6,
      hoursPerWeek: 32,
      travel: "none",
    },
    preferences,
  );
  assert.equal(known.score, 10);
  assert.equal(known.coverage, 0.7);
  assert.deepEqual(known.unknown, ["compensation"]);
  assert.ok(known.openQuestions.includes("compensation"));
});

test("salaries are pro-rated by weekly hours and never compared with the freelance rate", () => {
  const fit = economicFit(
    {
      ...UNKNOWN_CONDITIONS,
      contract: "employment",
      compensation: { amount: 60_000, unit: "year", currency: "EUR" },
      hoursPerWeek: 30,
    },
    preferences,
  );
  const compensation = fit.criteria.find((entry) => entry.criterion === "compensation")!;
  assert.deepEqual(compensation.compared, {
    offer: 60_000,
    target: 67_500,
    unit: "year",
    currency: "EUR",
  });
  // A day rate on a freelance project is compared per hour with the freelance target.
  const freelance = economicFit(
    {
      ...UNKNOWN_CONDITIONS,
      contract: "freelance",
      compensation: { amount: 800, unit: "day", currency: "EUR" },
    },
    preferences,
  );
  assert.deepEqual(freelance.criteria[0]!.compared, {
    offer: 100,
    target: 100,
    unit: "hour",
    currency: "EUR",
  });
});

test("unknown hours for a salary and an unknown contract for a rate are open questions", () => {
  const salary = economicFit(
    {
      ...UNKNOWN_CONDITIONS,
      contract: "employment",
      compensation: { amount: 90_000, unit: "year", currency: "EUR" },
    },
    preferences,
  );
  assert.ok(salary.openQuestions.includes("hours"));
  assert.equal(salary.criteria[0]!.value, 1);
  const rate = economicFit(
    { ...UNKNOWN_CONDITIONS, compensation: { amount: 95, unit: "hour", currency: "EUR" } },
    preferences,
  );
  assert.equal(rate.criteria[0]!.status, "unknown");
  assert.ok(rate.openQuestions.includes("contract_for_compensation"));
});

test("criteria without targets are not configured and do not count", () => {
  const fit = economicFit(
    { ...UNKNOWN_CONDITIONS, remote: 20, contract: "freelance" },
    DEFAULT_ECONOMIC_PREFERENCES,
  );
  assert.equal(fit.score, null);
  assert.deepEqual(fit.notConfigured, ["remote", "contract"]);
  assert.equal(fit.coverage, 0);
});

test("exclusions are listed next to the score, not hidden in it", () => {
  const strict = economicPreferencesSchema.parse({
    ...preferences,
    exclusions: { minimumRemote: 60, contracts: ["employment"], minimumRate: 85 },
  });
  const fit = economicFit(
    {
      ...UNKNOWN_CONDITIONS,
      contract: "employment",
      remote: 20,
      compensation: { amount: 95_000, unit: "year", currency: "EUR" },
      hoursPerWeek: 40,
    },
    strict,
  );
  assert.deepEqual(fit.exclusions.map((exclusion) => exclusion.kind).sort(), [
    "contract",
    "remote",
  ]);
  assert.ok(fit.score !== null);
});

test("preference ranges are validated", () => {
  assert.equal(
    economicPreferencesSchema.safeParse({ freelance: { target: 80, minimum: 100 } }).success,
    false,
  );
  assert.equal(
    economicPreferencesSchema.safeParse({ duration: { minimum: 12, target: 6 } }).success,
    false,
  );
  assert.deepEqual(DEFAULT_ECONOMIC_PREFERENCES.weights, {
    compensation: 30,
    remote: 25,
    contract: 20,
    duration: 10,
    workload: 10,
    travel: 5,
  });
});

// ---------------------------------------------------------------------------------------
// 1.8 The four dimensions are independent.

test("each change only moves the dimensions that read it", () => {
  const assessment = assessmentOf([gitlab36, scrum, talkback, kotlinReq], {
    technical: [
      judged(gitlab36, "direct", ["a"]),
      judged(scrum, "direct", ["kite"]),
      judged(talkback, "partial", ["kite"], "low"),
      judged(kotlinReq, "direct", ["juniper"]),
    ],
  });
  const candidate = candidateWith({
    references: [...evidenceCandidate.references, ref("a", "2019-01", "2023-12", ["GitLab"])],
  });
  const conditions = { ...UNKNOWN_CONDITIONS, contract: "freelance" as const, remote: 60 };
  const all = (
    nextCandidate: Candidate,
    cv: CvEvidenceInput,
    nextConditions = conditions,
    nextPreferences = preferences,
  ) => ({
    technical: technicalFit(assessment, nextCandidate),
    formal: formalFit(assessment, nextCandidate),
    evidence: evidence(assessment, nextCandidate, cv),
    economic: economicFit(nextConditions, nextPreferences),
  });
  const base = all(candidate, cvWith(["juniper"]));

  const betterCv = all(candidate, cvWith(["juniper", "kite", "a"], "TalkBack"));
  assert.deepEqual(betterCv.technical, base.technical);
  assert.deepEqual(betterCv.formal, base.formal);
  assert.deepEqual(betterCv.economic, base.economic);
  assert.notDeepEqual(betterCv.evidence, base.evidence);

  const newPreferences = all(candidate, cvWith(["juniper"]), conditions, {
    ...preferences,
    remote: { target: 60, minimum: 40 },
  });
  assert.deepEqual(newPreferences.technical, base.technical);
  assert.deepEqual(newPreferences.formal, base.formal);
  assert.deepEqual(newPreferences.evidence, base.evidence);
  assert.notDeepEqual(newPreferences.economic, base.economic);

  const newConditions = all(candidate, cvWith(["juniper"]), { ...conditions, remote: 100 });
  assert.deepEqual(newConditions.technical, base.technical);
  assert.deepEqual(newConditions.formal, base.formal);
  assert.deepEqual(newConditions.evidence, base.evidence);
  assert.notDeepEqual(newConditions.economic, base.economic);

  const confirmed = candidateWith({
    references: candidate.references.map((reference) =>
      reference.id === "a"
        ? { ...reference, skillUsage: confirmUsage(reference, ["GitLab"]) }
        : reference,
    ),
  });
  const usageConfirmed = all(confirmed, cvWith(["juniper"]));
  assert.deepEqual(usageConfirmed.technical, base.technical);
  assert.deepEqual(usageConfirmed.economic, base.economic);
  assert.equal(base.formal.items[0]!.state, "unverified");
  assert.equal(usageConfirmed.formal.items[0]!.state, "fulfilled");
});

test("alternatives without data are not reported once another alternative is documented", () => {
  const gitlab = req("GitLab CI", { groupId: "ci" });
  const actions = req("GitHub Actions", { groupId: "ci" });
  const candidate = candidateWith({ references: [ref("a", "2022-01", null, ["GitLab CI"])] });
  const result = evidence(
    assessmentOf([gitlab, actions], {
      groups: [{ id: "ci", operator: "any", mandatory: true, source: "" }],
      technical: [judged(gitlab, "direct", ["a"])],
    }),
    candidate,
    cvWith(["a"]),
  );
  assert.deepEqual(result.missingProfileData, []);
  assert.deepEqual(
    result.items.map((entry) => [entry.requirement.normalised, entry.state]),
    [["GitLab CI", "full"]],
  );
});

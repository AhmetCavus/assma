import { z } from "zod";
import type { ExperienceProfile, ExperienceReference, SkillFact, YearMonth } from "./experience.js";
import { sameLanguage, sameTerm } from "./terms.js";
import type { UsageReference } from "./usage.js";

/**
 * The project assessment in four independent dimensions: Technical Fit, Formal Fit, Evidence
 * and Economic Fit. The model only extracts requirements and judges technical relations;
 * everything that can be counted or compared is computed by the functions in this package,
 * the same in the browser and on the server. There is deliberately no overall score.
 */

export const REQUIREMENT_CATEGORIES = [
  "technical",
  "experience",
  "domain",
  "education",
  "certification",
  "language",
  "methodology",
  "leadership",
  "conditions",
] as const;
export type RequirementCategory = (typeof REQUIREMENT_CATEGORIES)[number];

export const DIMENSIONS = ["technical", "formal", "evidence", "economic"] as const;
export type Dimension = (typeof DIMENSIONS)[number];

export const TECHNICAL_STATES = ["direct", "transferable", "partial", "gap", "unknown"] as const;
export type TechnicalState = (typeof TECHNICAL_STATES)[number];

export const ONBOARDING_EFFORTS = ["minimal", "low", "moderate", "high", "unknown"] as const;
export type OnboardingEffort = (typeof ONBOARDING_EFFORTS)[number];

export const FORMAL_STATES = [
  "fulfilled",
  "unverified",
  "not_fulfilled",
  "not_applicable",
] as const;
export type FormalState = (typeof FORMAL_STATES)[number];

export const EVIDENCE_STATES = ["full", "partial", "missing", "unknown"] as const;
export type EvidenceState = (typeof EVIDENCE_STATES)[number];

/** Degree levels, lowest first. "degree" means any university degree. */
export const EDUCATION_LEVELS = ["vocational", "degree", "bachelor", "master", "phd"] as const;
export type EducationLevel = (typeof EDUCATION_LEVELS)[number];

export const ASSESSMENT_LIMITS = {
  groups: 60,
  requirements: 80,
  text: 300,
  terms: 6,
  term: 60,
  note: 300,
  cites: 4,
  months: 600,
} as const;

const shortText = (max: number) => z.string().trim().max(max);

/** A sentence of the listing, split into requirements that are all needed or alternatives. */
export const requirementGroupSchema = z.object({
  id: z.string().min(1).max(40),
  operator: z.enum(["all", "any"]),
  mandatory: z.boolean(),
  /** The listing's own words. */
  source: shortText(ASSESSMENT_LIMITS.text),
});
export type RequirementGroup = z.infer<typeof requirementGroupSchema>;

export const requirementSchema = z.object({
  id: z.string().min(1).max(40),
  groupId: z.string().min(1).max(40),
  /** The requirement as written. */
  text: shortText(ASSESSMENT_LIMITS.text),
  /** Its short normalised name, such as "GitLab CI" or "German". */
  normalised: shortText(ASSESSMENT_LIMITS.term).min(1),
  category: z.enum(REQUIREMENT_CATEGORIES),
  /** Minimum experience in months, when the listing states one. */
  months: z.number().int().min(1).max(ASSESSMENT_LIMITS.months).nullable(),
  /** A language level (CEFR or "native") or an education level, when stated. */
  level: z.string().max(20).nullable(),
  /** Spellings and keywords to look for, the normalised name first. */
  terms: z.array(shortText(ASSESSMENT_LIMITS.term).min(1)).max(ASSESSMENT_LIMITS.terms),
  dimensions: z.array(z.enum(DIMENSIONS)).min(1),
});
export type Requirement = z.infer<typeof requirementSchema>;

/** Points at the candidate data a result rests on. */
export const citeSchema = z.object({
  kind: z.enum(["reference", "education", "language", "certificate"]),
  /** A reference id, or the degree, language or certificate name. */
  key: z.string().min(1).max(200),
});
export type Cite = z.infer<typeof citeSchema>;

/** The model's technical judgement of one requirement. */
export const technicalResultSchema = z.object({
  requirementId: z.string().min(1).max(40),
  state: z.enum(TECHNICAL_STATES),
  onboarding: z.enum(ONBOARDING_EFFORTS),
  cites: z.array(citeSchema).max(ASSESSMENT_LIMITS.cites),
  note: shortText(ASSESSMENT_LIMITS.note),
});
export type TechnicalResult = z.infer<typeof technicalResultSchema>;

/** What the person set by hand; kept across reassessments until reset. */
export const correctionSchema = z.object({
  requirementId: z.string().min(1).max(40),
  technical: z
    .object({
      state: z.enum(TECHNICAL_STATES),
      cites: z.array(citeSchema).max(ASSESSMENT_LIMITS.cites).default([]),
    })
    .nullable()
    .default(null),
  formal: z.enum(FORMAL_STATES).nullable().default(null),
  note: shortText(ASSESSMENT_LIMITS.note).default(""),
});
export type Correction = z.infer<typeof correctionSchema>;
export type CorrectionInput = z.input<typeof correctionSchema>;

/** What is stored on a project: the model's work and the person's corrections, no scores. */
export type StoredAssessment = {
  version: 2;
  /** Fingerprint of the listing the requirements were extracted from. */
  fingerprint: string;
  /** Fingerprint of the candidate data the technical judgement read; "" when unknown. */
  candidateBasis: string;
  groups: RequirementGroup[];
  requirements: Requirement[];
  technical: TechnicalResult[];
  corrections: Correction[];
  /** True when the technical judgement could not be read; its results are then unknown. */
  incomplete: boolean;
  assessedAt: string;
};

/** FNV-1a, enough to notice changed input and to give requirements stable ids. */
export function hashText(text: string): string {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  return (value >>> 0).toString(16).padStart(8, "0");
}

/** Changes when anything the requirements are read from changes. */
export function listingFingerprint(project: {
  brief: string;
  required: readonly string[];
  preferred: readonly string[];
  tech: readonly string[];
  terms: string;
}): string {
  return hashText(
    JSON.stringify([
      project.brief,
      project.required,
      project.preferred,
      project.tech,
      project.terms,
    ]),
  );
}

/** Stable across reassessments, so corrections find their requirement again. */
export function requirementId(category: RequirementCategory, normalised: string): string {
  return `r${hashText(`${category}:${normalised.trim().toLowerCase()}`)}`;
}

const objectOf = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const arrayOf = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

function each<T>(values: unknown, schema: z.ZodType<T, z.ZodTypeDef, unknown>): T[] {
  return arrayOf(values).flatMap((value) => {
    const parsed = schema.safeParse(value);
    return parsed.success ? [parsed.data] : [];
  });
}

/** One judgement read leniently: a bad state becomes unknown, bad citations are dropped. */
function readTechnical(value: unknown): TechnicalResult | null {
  const data = objectOf(value);
  if (typeof data.requirementId !== "string" || !data.requirementId) {
    return null;
  }
  const state = z.enum(TECHNICAL_STATES).safeParse(data.state);
  const onboarding = z.enum(ONBOARDING_EFFORTS).safeParse(data.onboarding);
  return {
    requirementId: data.requirementId.slice(0, 40),
    state: state.success ? state.data : "unknown",
    onboarding: onboarding.success ? onboarding.data : "unknown",
    cites: each(data.cites, citeSchema).slice(0, ASSESSMENT_LIMITS.cites),
    note: typeof data.note === "string" ? data.note.slice(0, ASSESSMENT_LIMITS.note) : "",
  };
}

/**
 * Reads a stored assessment. Stored data that no longer matches the contract is degraded
 * piece by piece rather than discarded; anything unusable as a whole reads as null.
 */
export function readAssessment(raw: unknown): StoredAssessment | null {
  const data = objectOf(raw);
  if (data.version !== 2) {
    return null;
  }
  const groups = each(data.groups, requirementGroupSchema);
  const groupIds = new Set(groups.map((group) => group.id));
  const requirements = each(data.requirements, requirementSchema).filter((requirement) =>
    groupIds.has(requirement.groupId),
  );
  if (requirements.length === 0) {
    return null;
  }
  const known = new Set(requirements.map((requirement) => requirement.id));
  const usedGroups = new Set(requirements.map((requirement) => requirement.groupId));
  return {
    version: 2,
    fingerprint: typeof data.fingerprint === "string" ? data.fingerprint : "",
    candidateBasis: typeof data.candidateBasis === "string" ? data.candidateBasis : "",
    groups: groups.filter((group) => usedGroups.has(group.id)),
    requirements,
    technical: arrayOf(data.technical)
      .map(readTechnical)
      .filter(
        (result): result is TechnicalResult => result !== null && known.has(result.requirementId),
      ),
    // Corrections of requirements that are gone are kept: the requirement may come back.
    corrections: each(data.corrections, correctionSchema),
    incomplete: data.incomplete === true,
    assessedAt:
      typeof data.assessedAt === "string" && !Number.isNaN(Date.parse(data.assessedAt))
        ? data.assessedAt
        : new Date(0).toISOString(),
  };
}

/** For API contracts: any stored value, read leniently into an assessment or null. */
export const storedAssessmentSchema = z
  .unknown()
  .transform((value): StoredAssessment | null => readAssessment(value));

// ---------------------------------------------------------------------------------------
// The candidate data every dimension reads.

export type Candidate = {
  references: (UsageReference &
    Pick<ExperienceReference, "organization" | "role" | "contribution">)[];
  profile: Pick<
    ExperienceProfile,
    "summary" | "headline" | "education" | "languages" | "certificates"
  >;
  skillFacts: readonly SkillFact[];
  /** The current month, for ongoing engagements. */
  today?: YearMonth;
};

/**
 * Changes when anything the technical judgement reads changes: references, profile text,
 * education, languages and certificates. Confirmed usage and skill facts are not part of it;
 * the computed dimensions read those directly.
 */
export function candidateFingerprint(candidate: Candidate): string {
  return hashText(
    JSON.stringify([
      [...candidate.references]
        .sort((a, b) => (a.id < b.id ? -1 : 1))
        .map((reference) => [
          reference.id,
          reference.organization,
          reference.role,
          reference.start,
          reference.end,
          reference.contribution,
          reference.skills,
        ]),
      candidate.profile.headline,
      candidate.profile.summary,
      candidate.profile.education.map((entry) => [
        entry.degree,
        entry.institution,
        entry.end,
        entry.note,
      ]),
      candidate.profile.languages.map((entry) => [entry.name, entry.level]),
      candidate.profile.certificates.map((entry) => entry.name),
    ]),
  );
}

/** Whether a citation points at data that exists. */
export function citeExists(cite: Cite, candidate: Candidate): boolean {
  switch (cite.kind) {
    case "reference":
      return candidate.references.some((reference) => reference.id === cite.key);
    case "education":
      return candidate.profile.education.some((entry) => sameTerm(entry.degree, cite.key));
    case "language":
      return candidate.profile.languages.some((entry) => sameLanguage(entry.name, cite.key));
    case "certificate":
      return candidate.profile.certificates.some((entry) => sameTerm(entry.name, cite.key));
  }
}

/** The person's statement about a requirement's skill, if any of its terms has one. */
export function skillFactFor(
  requirement: Pick<Requirement, "terms" | "normalised">,
  facts: readonly SkillFact[],
): SkillFact["status"] | null {
  const terms = [requirement.normalised, ...requirement.terms];
  const fact = facts.find((entry) => terms.some((term) => sameTerm(entry.skill, term)));
  return fact?.status ?? null;
}

export const termsOf = (requirement: Pick<Requirement, "terms" | "normalised">) => [
  ...new Set([requirement.normalised, ...requirement.terms]),
];

export function correctionFor(
  requirementId: string,
  corrections: readonly Correction[],
): Correction | null {
  return corrections.find((correction) => correction.requirementId === requirementId) ?? null;
}

/** Groups with their requirements, in listing order, for one dimension. */
export function groupsFor(
  assessment: Pick<StoredAssessment, "groups" | "requirements">,
  dimension: Dimension,
): { group: RequirementGroup; members: Requirement[] }[] {
  return assessment.groups
    .map((group) => ({
      group,
      members: assessment.requirements.filter(
        (requirement) =>
          requirement.groupId === group.id && requirement.dimensions.includes(dimension),
      ),
    }))
    .filter((entry) => entry.members.length > 0);
}

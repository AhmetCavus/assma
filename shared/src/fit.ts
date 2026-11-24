import { z } from "zod";
import { identifier } from "./account.js";
import { CV_LANGUAGES, cvDesignSchema, DEFAULT_CV_DESIGN } from "./cvDesign.js";

/**
 * The experience fit of a project and the tailored CV drafted for it.
 *
 * Scoring follows the concept: each required item carries two points and each preferred item
 * one. Confirmed evidence earns the full weight, partial evidence half, a missing reference
 * nothing. The result is scaled to 1–10 and rounded; a project without assessable
 * requirements stays unscored. The local model only proposes which reference supports which
 * requirement; the score itself is always computed here.
 */

export const FIT_STATUSES = ["confirmed", "partial", "missing"] as const;
export const fitStatusSchema = z.enum(FIT_STATUSES);
export type FitStatus = z.infer<typeof fitStatusSchema>;

export const REQUIREMENT_KINDS = ["required", "preferred"] as const;
export type RequirementKind = (typeof REQUIREMENT_KINDS)[number];

export const FIT_LIMITS = {
  note: 300,
  referencesPerFinding: 3,
  summary: 1500,
  cvReferences: 20,
  cvSkills: 40,
  cvRoles: 12,
  /** The shortest time a person can set by hand for a skill or a role. */
  cvMinYears: 1,
};

export const findingSchema = z.object({
  requirement: z.string(),
  kind: z.enum(REQUIREMENT_KINDS),
  status: fitStatusSchema,
  referenceIds: z.array(identifier).max(FIT_LIMITS.referencesPerFinding),
  note: z.string().max(FIT_LIMITS.note),
  /** True once the person corrected the model's finding. */
  edited: z.boolean(),
});
export type Finding = z.infer<typeof findingSchema>;

export const fitSchema = z.object({
  findings: z.array(findingSchema),
  score: z.number().int().min(1).max(10).nullable(),
  points: z.number().min(0),
  maxPoints: z.number().min(0),
  /** Fingerprint of the requirements and references the assessment was made from. */
  basis: z.string(),
  assessedAt: z.string().datetime(),
});
export type Fit = z.infer<typeof fitSchema>;

export const findingChangeSchema = z.object({
  status: fitStatusSchema,
  referenceIds: z.array(identifier).max(FIT_LIMITS.referencesPerFinding).default([]),
});
export type FindingChange = z.input<typeof findingChangeSchema>;

const WEIGHT: Record<RequirementKind, number> = { required: 2, preferred: 1 };
const EARNED: Record<FitStatus, number> = { confirmed: 1, partial: 0.5, missing: 0 };

export function scoreFindings(findings: readonly Pick<Finding, "kind" | "status">[]) {
  const maxPoints = findings.reduce((sum, finding) => sum + WEIGHT[finding.kind], 0);
  const points = findings.reduce(
    (sum, finding) => sum + WEIGHT[finding.kind] * EARNED[finding.status],
    0,
  );
  const score = maxPoints === 0 ? null : Math.max(1, Math.round((points / maxPoints) * 10));
  return { score, points, maxPoints };
}

/** The requirements of a project in assessment order: required first, then preferred. */
export function requirementsOf(project: { required: string[]; preferred: string[] }) {
  return [
    ...project.required.map((requirement) => ({ requirement, kind: "required" as const })),
    ...project.preferred.map((requirement) => ({ requirement, kind: "preferred" as const })),
  ];
}

/** FNV-1a, enough to notice that the inputs of an assessment changed. */
function hash(text: string): string {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  return (value >>> 0).toString(16).padStart(8, "0");
}

/**
 * Changes when a requirement or any reference changes, so the page can mark an assessment as
 * out of date.
 */
export function fitBasis(
  project: { required: string[]; preferred: string[] },
  references: readonly { id: string; updatedAt: string }[],
): string {
  const ids = [...references]
    .map((reference) => `${reference.id}@${reference.updatedAt}`)
    .sort()
    .join(",");
  return hash(JSON.stringify([project.required, project.preferred, ids]));
}

/** Requirement texts per status, for the "what speaks for you" summary. */
export function fitSummary(fit: Pick<Fit, "findings">) {
  return {
    strengths: fit.findings.filter((finding) => finding.status === "confirmed"),
    open: fit.findings.filter((finding) => finding.status !== "confirmed"),
  };
}

/** References in order of how much of the fit they support (required counts double). */
export function supportingReferences(fit: Pick<Fit, "findings">): string[] {
  const weight = new Map<string, number>();
  for (const finding of fit.findings) {
    if (finding.status === "missing") {
      continue;
    }
    for (const id of finding.referenceIds) {
      weight.set(id, (weight.get(id) ?? 0) + WEIGHT[finding.kind] * EARNED[finding.status]);
    }
  }
  return [...weight.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

// ---------------------------------------------------------------------------------------
// Reading the model's proposal. Model output is untrusted.

const clip = (value: unknown, max: number) =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";

/**
 * Turns the model's answer into one finding per requirement. `labels` maps the labels the
 * model saw (E01, E02, …) to reference ids. A requirement the model skipped, or a confirmed
 * or partial finding without a known reference, counts as missing.
 */
export function normaliseFindings(
  raw: unknown,
  requirements: readonly { requirement: string; kind: RequirementKind }[],
  labels: ReadonlyMap<string, string>,
): Finding[] {
  const answers = new Map<number, Record<string, unknown>>();
  const list = (raw as { findings?: unknown } | null)?.findings;
  if (Array.isArray(list)) {
    for (const item of list) {
      if (item && typeof item === "object") {
        const index = Number((item as Record<string, unknown>).requirement);
        if (
          Number.isInteger(index) &&
          index >= 1 &&
          index <= requirements.length &&
          !answers.has(index)
        ) {
          answers.set(index, item as Record<string, unknown>);
        }
      }
    }
  }
  return requirements.map(({ requirement, kind }, position) => {
    const answer = answers.get(position + 1);
    const referenceIds = [
      ...new Set(
        (Array.isArray(answer?.references) ? answer.references : [])
          .map((label) => labels.get(String(label).trim().toUpperCase()))
          .filter((id): id is string => Boolean(id)),
      ),
    ].slice(0, FIT_LIMITS.referencesPerFinding);
    const proposed = fitStatusSchema.safeParse(answer?.status);
    const status: FitStatus =
      proposed.success && (proposed.data === "missing" || referenceIds.length > 0)
        ? proposed.data
        : "missing";
    return {
      requirement,
      kind,
      status,
      referenceIds: status === "missing" ? [] : referenceIds,
      note: clip(answer?.note, FIT_LIMITS.note),
      edited: false,
    };
  });
}

// ---------------------------------------------------------------------------------------
// The tailored CV.

/** Years in half-year steps, as the matrix shows them. */
const cvYears = z.number().min(0.5).max(60).multipleOf(0.5);

/** A line under "Berufserfahrung": a detected role, or one the person added. */
export const cvRoleSchema = z.object({
  name: z.string().trim().min(1).max(80),
  /** null: the years computed from the references (only for a detected role). */
  years: cvYears.nullable().default(null),
});
export type CvRole = z.infer<typeof cvRoleSchema>;

export const cvDraftSchema = z.object({
  summary: z.string().trim().max(FIT_LIMITS.summary).default(""),
  /** Language of headings, dates and units; null follows the interface language. */
  language: z.enum(CV_LANGUAGES).nullable().default(null),
  design: cvDesignSchema.default(DEFAULT_CV_DESIGN),
  /** The photo on this CV; null for none. */
  imageId: identifier.nullable().default(null),
  /** Skills shown in the matrix, in order; null lets assma choose (project-relevant first). */
  skills: z
    .array(z.string().trim().min(1).max(40))
    .max(FIT_LIMITS.cvSkills)
    .nullable()
    .default(null),
  /** Years the person set for a skill, by skill name, instead of the computed ones. */
  skillYears: z
    .record(z.string().trim().min(1).max(40), cvYears)
    .refine((years) => Object.keys(years).length <= 100, "too_many")
    .default({}),
  /** The lines under "Berufserfahrung", in order; null shows the most practised roles. */
  roles: z
    .array(cvRoleSchema)
    .max(FIT_LIMITS.cvRoles)
    .nullable()
    .default(null)
    .transform((roles) => {
      if (!roles) {
        return roles;
      }
      const seen = new Set<string>();
      return roles.filter((role) => {
        const key = role.name.toLowerCase();
        return seen.has(key) ? false : (seen.add(key), true);
      });
    }),
  /** Selected references in CV order. */
  referenceIds: z
    .array(identifier)
    .max(FIT_LIMITS.cvReferences)
    .default([])
    .transform((ids) => [...new Set(ids)]),
});
export type CvDraftInput = z.input<typeof cvDraftSchema>;
export type CvDraft = z.infer<typeof cvDraftSchema>;

export const fitJobSchema = z.object({
  id: z.string(),
  state: z.enum(["queued", "reading", "done", "failed"]),
  position: z.number().int().min(0),
  startedAt: z.string().datetime(),
  error: z.string().nullable(),
});
export type FitJob = z.infer<typeof fitJobSchema>;

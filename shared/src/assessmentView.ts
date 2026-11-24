import { z } from "zod";
import type { Candidate, StoredAssessment } from "./assessment.js";
import { economicFit, type EconomicFit } from "./economic.js";
import { evidence, type CvEvidenceInput, type Evidence } from "./evidence.js";
import { formalFit, type FormalFit } from "./formal.js";
import type { EconomicPreferences } from "./preferences.js";
import type { ProjectConditions } from "./projects.js";
import { technicalFit, type TechnicalFit } from "./technical.js";

/**
 * All four dimensions of a project, computed from what is stored and what the person has
 * now. Each dimension reads only its own inputs, so a change in one never moves another.
 */

export type AssessmentView = {
  technical: TechnicalFit;
  formal: FormalFit;
  evidence: Evidence;
  economic: EconomicFit;
};

export function assessProject(input: {
  assessment: StoredAssessment;
  candidate: Candidate;
  cv: CvEvidenceInput | null;
  conditions: ProjectConditions;
  preferences: EconomicPreferences;
}): AssessmentView {
  return {
    technical: technicalFit(input.assessment, input.candidate),
    formal: formalFit(input.assessment, input.candidate),
    evidence: evidence(input.assessment, input.candidate, input.cv),
    economic: economicFit(input.conditions, input.preferences),
  };
}

/** The compact form for lists, application snapshots and the assistant. */
export const assessmentSummarySchema = z.object({
  technical: z.object({ score: z.number().nullable(), coverage: z.number().nullable() }),
  formal: z.object({
    fulfilled: z.number().int(),
    total: z.number().int(),
    /** Names of unverified mandatory requirements. */
    risks: z.array(z.string()),
    /** Names of mandatory requirements that are not fulfilled. */
    blockers: z.array(z.string()),
  }),
  evidence: z.object({
    available: z.boolean(),
    score: z.number().nullable(),
    coverage: z.number().nullable(),
    gaps: z.number().int(),
    missingProfileData: z.number().int(),
  }),
  economic: z.object({
    score: z.number().nullable(),
    coverage: z.number(),
    exclusions: z.number().int(),
  }),
  assessedAt: z.string(),
});
export type AssessmentSummary = z.infer<typeof assessmentSummarySchema>;

const entryName = (entry: FormalFit["entries"][number]) =>
  entry.items.map((item) => item.requirement.normalised).join(" / ");

export function summariseAssessment(view: AssessmentView, assessedAt: string): AssessmentSummary {
  return {
    technical: { score: view.technical.score, coverage: view.technical.coverage },
    formal: {
      fulfilled: view.formal.mandatory.fulfilled,
      total: view.formal.mandatory.total,
      risks: view.formal.risks.map(entryName),
      blockers: view.formal.blockers.map(entryName),
    },
    evidence: {
      available: view.evidence.available,
      score: view.evidence.score,
      coverage: view.evidence.coverage,
      gaps: view.evidence.gaps,
      missingProfileData: view.evidence.missingProfileData.length,
    },
    economic: {
      score: view.economic.score,
      coverage: view.economic.coverage,
      exclusions: view.economic.exclusions.length,
    },
    assessedAt,
  };
}

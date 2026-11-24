import type {
  Candidate,
  Project,
  ProjectConditions,
  StoredAssessment,
  TechnicalResult,
} from "@assma/shared";
import type { JobProgress } from "../platform/modelJobs.js";
import {
  EXTRACTION_SCHEMA,
  extractionMessages,
  fallbackExtraction,
  listingFingerprint,
  normaliseExtraction,
} from "./extraction.prompt.js";
import { JUDGEMENT_SCHEMA, judgementInput, normaliseJudgement } from "./judgement.prompt.js";
import { structuredAnswer } from "./json.js";

/**
 * One assessment run, without any storage: requirements (reused while the listing is
 * unchanged), then the technical judgement. Corrections of the previous assessment are
 * carried over unchanged. Two model calls at most; a changed listing costs both, a changed
 * profile only the second.
 */

export type AssessmentRun = {
  assessment: StoredAssessment;
  /** Conditions read from the listing in this run, or null when the listing was not re-read. */
  conditions: ProjectConditions | null;
};

const hasData = (candidate: Candidate) =>
  candidate.references.length > 0 ||
  candidate.profile.education.length > 0 ||
  candidate.profile.languages.length > 0 ||
  candidate.profile.certificates.length > 0;

export async function runAssessment(input: {
  project: Pick<Project, "title" | "brief" | "required" | "preferred" | "tech" | "terms">;
  candidate: Candidate;
  previous: StoredAssessment | null;
  signal: AbortSignal;
  progress?: (update: JobProgress) => void;
  now?: Date;
}): Promise<AssessmentRun> {
  const { project, candidate, previous, signal } = input;
  const progress = input.progress ?? (() => undefined);
  const fingerprint = listingFingerprint(project);

  let groups: StoredAssessment["groups"];
  let requirements: StoredAssessment["requirements"];
  let conditions: ProjectConditions | null = null;
  if (previous && previous.fingerprint === fingerprint) {
    ({ groups, requirements } = previous);
  } else {
    progress({ found: 0, part: 1, parts: 2 });
    const raw = await structuredAnswer(
      { messages: extractionMessages(project), schema: EXTRACTION_SCHEMA },
      signal,
    );
    if (raw === null) {
      // An unreadable answer is not the end: the person's own lists still describe the project.
      ({ groups, requirements } = fallbackExtraction(project));
    } else {
      const extraction = normaliseExtraction(raw, project);
      ({ groups, requirements, conditions } = extraction);
    }
  }

  progress({ found: requirements.length, part: 2, parts: 2 });
  let technical: TechnicalResult[] = [];
  let incomplete = false;
  const judgement = judgementInput(requirements, candidate);
  if (judgement.requirements.length > 0 && hasData(candidate)) {
    const raw = await structuredAnswer(
      { messages: judgement.messages, schema: JUDGEMENT_SCHEMA },
      signal,
    );
    if (raw === null) {
      incomplete = true;
    } else {
      technical = normaliseJudgement(raw, judgement);
    }
  }

  return {
    assessment: {
      version: 2,
      fingerprint,
      groups,
      requirements,
      technical,
      corrections: previous?.corrections ?? [],
      incomplete,
      assessedAt: (input.now ?? new Date()).toISOString(),
    },
    conditions,
  };
}

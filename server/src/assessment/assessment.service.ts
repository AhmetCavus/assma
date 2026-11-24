import {
  assessProject,
  citeExists,
  correctionSchema,
  projectConditionsSchema,
  conditionsUnknown,
  type AssessmentView,
  type Candidate,
  type FitJob,
  type Project,
  type StoredAssessment,
} from "@assma/shared";
import { z } from "zod";
import * as experience from "../experience/experience.repository.js";
import type { Account } from "../platform/access.js";
import { AssmaError, notFound } from "../platform/errors.js";
import { modelJobs, type JobProgress, type JobView } from "../platform/modelJobs.js";
import { RateLimiter } from "../platform/rateLimit.js";
import * as preferences from "../preferences/preferences.repository.js";
import * as projects from "../projects/project.repository.js";
import { runAssessment } from "./assessment.run.js";

/**
 * The multi-dimensional assessment of a project. Only a reassessment runs the model; the
 * four dimensions are computed from what is stored whenever they are asked for, so changed
 * preferences, conditions, CVs or confirmed experience are reflected without a model run.
 */

const assessmentsPerAccount = new RateLimiter(60, 60 * 60 * 1000);
const ASSESSMENT_TIMEOUT_MS = 15 * 60 * 1000;
const kindOf = (projectId: string) => `fit:${projectId}`;

async function owned(account: Account, id: string): Promise<Project> {
  const project = await projects.findProject(account.id, id);
  if (!project) {
    throw notFound();
  }
  return project;
}

/** Everything about the person the dimensions read. */
export async function candidateOf(ownerId: string): Promise<Candidate> {
  const [profile, references, skillFacts] = await Promise.all([
    experience.findProfile(ownerId),
    experience.listReferences(ownerId),
    experience.listSkillFacts(ownerId),
  ]);
  return {
    references,
    profile: {
      summary: profile?.summary ?? "",
      headline: profile?.headline ?? "",
      education: profile?.education ?? [],
      languages: profile?.languages ?? [],
      certificates: profile?.certificates ?? [],
    },
    skillFacts,
  };
}

/** The model run, stored on the project even if nobody waits for the result. */
export async function assess(
  ownerId: string,
  projectId: string,
  signal: AbortSignal,
  progress: (update: JobProgress) => void,
): Promise<StoredAssessment> {
  const project = await projects.findProject(ownerId, projectId);
  if (!project) {
    throw new Error("unreadable");
  }
  const run = await runAssessment({
    project,
    candidate: await candidateOf(ownerId),
    previous: project.assessment,
    signal: AbortSignal.any([signal, AbortSignal.timeout(ASSESSMENT_TIMEOUT_MS)]),
    progress,
  });
  // Conditions the person entered or reviewed are never replaced by a suggestion.
  const conditions =
    run.conditions && conditionsUnknown(project.conditions) ? { conditions: run.conditions } : {};
  // The project may have been deleted while the model was reading.
  await projects.updateProject(ownerId, projectId, { assessment: run.assessment, ...conditions });
  return run.assessment;
}

function toFitJob(view: JobView<StoredAssessment>): FitJob {
  return {
    id: view.id,
    state: view.state,
    position: view.position,
    startedAt: view.startedAt,
    error: view.error,
  };
}

export async function startAssessment(account: Account, projectId: string) {
  // A draft has no requirements yet; it is read first.
  if ((await owned(account, projectId)).draft) {
    throw new AssmaError(409, "project_draft");
  }
  assessmentsPerAccount.attempt(account.id);
  return toFitJob(
    modelJobs.start(account.id, kindOf(projectId), (signal, progress) =>
      assess(account.id, projectId, signal, progress),
    ),
  );
}

export async function assessmentJob(account: Account, projectId: string, jobId: string) {
  return toFitJob(modelJobs.get<StoredAssessment>(account.id, kindOf(projectId), jobId));
}

export async function cancelAssessment(account: Account, projectId: string, jobId: string) {
  return modelJobs.cancel(account.id, kindOf(projectId), jobId);
}

/** The four dimensions of a project as they stand now. */
export async function viewOf(
  ownerId: string,
  project: Project & { assessment: StoredAssessment },
): Promise<AssessmentView> {
  const [candidate, stored] = await Promise.all([
    candidateOf(ownerId),
    preferences.findPreferences(ownerId),
  ]);
  return assessProject({
    assessment: project.assessment,
    candidate,
    cv: project.cv
      ? {
          summary: project.cv.summary,
          referenceIds: project.cv.referenceIds,
          skills: project.cv.skills,
        }
      : null,
    conditions: project.conditions,
    preferences: stored.economic,
  });
}

/** The four dimensions as they stand now, or null before the first assessment. */
export async function view(account: Account, projectId: string): Promise<AssessmentView | null> {
  const project = await owned(account, projectId);
  return project.assessment
    ? viewOf(account.id, { ...project, assessment: project.assessment })
    : null;
}

const correctionInputSchema = correctionSchema.omit({ requirementId: true });

/** The person's correction of one requirement; kept across reassessments until reset. */
export async function setCorrection(
  account: Account,
  projectId: string,
  requirementId: string,
  input: unknown,
) {
  const change = correctionInputSchema.parse(input);
  const project = await owned(account, projectId);
  const assessment = project.assessment;
  if (!assessment || !assessment.requirements.some((entry) => entry.id === requirementId)) {
    throw notFound();
  }
  if (change.technical) {
    const candidate = await candidateOf(account.id);
    if (change.technical.cites.some((cite) => !citeExists(cite, candidate))) {
      throw new AssmaError(400, "unknown_reference");
    }
  }
  const corrections = [
    ...assessment.corrections.filter((entry) => entry.requirementId !== requirementId),
    { requirementId, ...change },
  ];
  return save(account, projectId, { ...assessment, corrections });
}

/** Removes one correction, or all of them, so the model's results apply again. */
export async function resetCorrections(
  account: Account,
  projectId: string,
  requirementId: string | null,
) {
  const project = await owned(account, projectId);
  if (!project.assessment) {
    throw notFound();
  }
  const corrections =
    requirementId === null
      ? []
      : project.assessment.corrections.filter((entry) => entry.requirementId !== requirementId);
  return save(account, projectId, { ...project.assessment, corrections });
}

async function save(account: Account, projectId: string, assessment: StoredAssessment) {
  const updated = await projects.updateProject(account.id, projectId, { assessment });
  if (!updated) {
    throw notFound();
  }
  return updated;
}

/** The working conditions as the person reviewed them. Only Economic Fit reads them. */
export async function updateConditions(account: Account, projectId: string, input: unknown) {
  const conditions = projectConditionsSchema.parse(input);
  const updated = await projects.updateProject(account.id, projectId, { conditions });
  if (!updated) {
    throw notFound();
  }
  return updated;
}

export const requirementIdSchema = z.string().regex(/^r[0-9a-f]{8}$/);

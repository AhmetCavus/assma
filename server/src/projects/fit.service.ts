import {
  cvDraftSchema,
  findingChangeSchema,
  fitBasis,
  normaliseFindings,
  referenceLabel,
  requirementsOf,
  scoreFindings,
  sortReferences,
  type Fit,
  type FitJob,
  type Project,
} from "@assma/shared";
import { contextFor } from "../experience/cvImport.prompt.js";
import * as experience from "../experience/experience.repository.js";
import type { Account } from "../platform/access.js";
import { AssmaError, notFound } from "../platform/errors.js";
import { modelJobs, type JobView } from "../platform/modelJobs.js";
import { streamStructured } from "../platform/ollama.js";
import { RateLimiter } from "../platform/rateLimit.js";
import { FIT_SCHEMA, fitMessages } from "./fit.prompt.js";
import * as repository from "./project.repository.js";

const assessmentsPerAccount = new RateLimiter(60, 60 * 60 * 1000);
const ASSESSMENT_TIMEOUT_MS = 10 * 60 * 1000;

/** One job kind per project, so assessing a second project does not cancel the first. */
const kindOf = (projectId: string) => `fit:${projectId}`;

async function owned(account: Account, id: string): Promise<Project> {
  const project = await repository.findProject(account.id, id);
  if (!project) {
    throw notFound();
  }
  return project;
}

/**
 * Asks the model which reference supports which requirement, computes the score and saves
 * the assessment on the project, so it is kept even if nobody waits for the result.
 */
export async function assess(
  ownerId: string,
  projectId: string,
  signal: AbortSignal,
): Promise<Fit> {
  const project = await repository.findProject(ownerId, projectId);
  if (!project) {
    throw new Error("unreadable");
  }
  const references = sortReferences(await experience.listReferences(ownerId));
  const requirements = requirementsOf(project);
  let raw: unknown = { findings: [] };
  if (requirements.length > 0 && references.length > 0) {
    const messages = fitMessages(requirements, references);
    let output = "";
    for await (const delta of streamStructured(
      messages,
      FIT_SCHEMA,
      { numCtx: contextFor(messages.map((message) => message.content).join("\n")) },
      AbortSignal.any([signal, AbortSignal.timeout(ASSESSMENT_TIMEOUT_MS)]),
    )) {
      output += delta;
    }
    try {
      raw = JSON.parse(output);
    } catch {
      throw new Error("unreadable");
    }
  }
  const labels = new Map(
    references.map((reference, index) => [referenceLabel(index), reference.id]),
  );
  const findings = normaliseFindings(raw, requirements, labels);
  const fit: Fit = {
    findings,
    ...scoreFindings(findings),
    basis: fitBasis(project, references),
    assessedAt: new Date().toISOString(),
  };
  // The project may have been deleted while the model was reading.
  await repository.updateProject(ownerId, projectId, { fit });
  return fit;
}

function toFitJob(view: JobView<Fit>): FitJob {
  return {
    id: view.id,
    state: view.state,
    position: view.position,
    startedAt: view.startedAt,
    error: view.error,
  };
}

export async function startAssessment(account: Account, projectId: string) {
  await owned(account, projectId);
  assessmentsPerAccount.attempt(account.id);
  return toFitJob(
    modelJobs.start(account.id, kindOf(projectId), (signal) =>
      assess(account.id, projectId, signal),
    ),
  );
}

export async function assessment(account: Account, projectId: string, jobId: string) {
  return toFitJob(modelJobs.get<Fit>(account.id, kindOf(projectId), jobId));
}

export async function cancelAssessment(account: Account, projectId: string, jobId: string) {
  return modelJobs.cancel(account.id, kindOf(projectId), jobId);
}

/** The person corrects one finding; the score is recomputed from all findings. */
export async function changeFinding(
  account: Account,
  projectId: string,
  index: number,
  input: unknown,
) {
  const change = findingChangeSchema.parse(input);
  const project = await owned(account, projectId);
  const finding = project.fit?.findings[index];
  if (!project.fit || !finding) {
    throw notFound();
  }
  const known = new Set(
    (await experience.listReferences(account.id)).map((reference) => reference.id),
  );
  if (change.referenceIds.some((id) => !known.has(id))) {
    throw new AssmaError(400, "unknown_reference");
  }
  if (change.status !== "missing" && change.referenceIds.length === 0) {
    throw new AssmaError(400, "reference_required");
  }
  const findings = project.fit.findings.map((current, position) =>
    position === index
      ? {
          ...current,
          status: change.status,
          referenceIds: change.status === "missing" ? [] : change.referenceIds,
          edited: true,
        }
      : current,
  );
  const fit: Fit = { ...project.fit, findings, ...scoreFindings(findings) };
  const updated = await repository.updateProject(account.id, projectId, { fit });
  if (!updated) {
    throw notFound();
  }
  return updated;
}

/** Saves the tailored CV: its summary and the selected references in order. */
export async function saveCv(account: Account, projectId: string, input: unknown) {
  const cv = cvDraftSchema.parse(input);
  const known = new Set(
    (await experience.listReferences(account.id)).map((reference) => reference.id),
  );
  if (cv.referenceIds.some((id) => !known.has(id))) {
    throw new AssmaError(400, "unknown_reference");
  }
  if (cv.imageId && !(await experience.imageExists(account.id, cv.imageId))) {
    throw new AssmaError(400, "unknown_image");
  }
  const updated = await repository.updateProject(account.id, projectId, { cv });
  if (!updated) {
    throw notFound();
  }
  return updated;
}

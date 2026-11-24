import {
  cvDraftSchema,
  findingChangeSchema,
  scoreFindings,
  type Fit,
  type Project,
} from "@assma/shared";
import * as experience from "../experience/experience.repository.js";
import type { Account } from "../platform/access.js";
import { AssmaError, notFound } from "../platform/errors.js";
import * as repository from "./project.repository.js";

/**
 * The legacy single-score fit (corrections of its findings, until the page switches to the
 * multi-dimensional assessment) and saving the tailored CV. Assessments run in
 * ../assessment/assessment.service.ts.
 */

async function owned(account: Account, id: string): Promise<Project> {
  const project = await repository.findProject(account.id, id);
  if (!project) {
    throw notFound();
  }
  return project;
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

import {
  cvDraftSchema,
  fitSchema,
  projectConditionsSchema,
  projectSchema,
  readAssessment,
  UNKNOWN_CONDITIONS,
  type Project,
} from "@assma/shared";
import ProjectModel, { type ProjectRecord } from "../models/project.model.js";

type StoredProject = ProjectRecord & { _id: unknown };
type ProjectFields = Omit<
  ProjectRecord,
  | "ownerId"
  | "status"
  | "archived"
  | "draft"
  | "fit"
  | "assessment"
  | "conditions"
  | "cv"
  | "createdAt"
  | "updatedAt"
> & { conditions?: unknown };

function toProject(record: StoredProject): Project {
  const list = (value: unknown) => (Array.isArray(value) ? value.map(String) : []);
  return projectSchema.parse({
    id: String(record._id),
    title: record.title,
    company: record.company ?? "",
    agency: record.agency ?? "",
    contact: record.contact ?? "",
    contactEmail: record.contactEmail ?? "",
    sourceUrl: record.sourceUrl ?? "",
    brief: record.brief ?? "",
    tech: list(record.tech),
    required: list(record.required),
    preferred: list(record.preferred),
    terms: record.terms ?? "",
    status: record.status,
    archived: Boolean(record.archived),
    draft: Boolean(record.draft),
    // Stored data that no longer matches the contract is treated as absent, not as an error.
    fit: fitSchema.safeParse(record.fit).success ? record.fit : null,
    cv: cvDraftSchema.safeParse(record.cv).success ? record.cv : null,
    assessment: readAssessment(record.assessment),
    conditions: projectConditionsSchema.safeParse(record.conditions).success
      ? record.conditions
      : UNKNOWN_CONDITIONS,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  });
}

export async function listProjects(ownerId: string): Promise<Project[]> {
  const records = await ProjectModel.model
    .find({ ownerId })
    .sort({ createdAt: -1 })
    .limit(1000)
    .lean<StoredProject[]>();
  return records.map(toProject);
}

export async function findProject(ownerId: string, id: string): Promise<Project | null> {
  const record = await ProjectModel.model
    .findOne({ _id: id, ownerId })
    .lean<StoredProject | null>();
  return record ? toProject(record) : null;
}

export async function countProjects(ownerId: string): Promise<number> {
  return ProjectModel.model.countDocuments({ ownerId });
}

/** Which of these source links the owner already saved as a project. */
export async function existingSources(ownerId: string, urls: string[]): Promise<string[]> {
  const records = await ProjectModel.model
    .find({ ownerId, sourceUrl: { $in: urls } }, { sourceUrl: 1 })
    .lean<{ sourceUrl: string }[]>();
  return records.map((record) => record.sourceUrl);
}

export async function createProject(
  ownerId: string,
  fields: ProjectFields,
  draft = false,
): Promise<Project> {
  const now = new Date();
  const created = await ProjectModel.model.create({
    ...fields,
    ownerId,
    status: "captured",
    archived: false,
    draft,
    createdAt: now,
    updatedAt: now,
  });
  return toProject(created.toObject() as StoredProject);
}

/** Only the owner's record matches, so another account's id behaves like an unknown one. */
export async function updateProject(
  ownerId: string,
  id: string,
  changes: Partial<Omit<ProjectRecord, "ownerId" | "createdAt">>,
): Promise<Project | null> {
  const record = await ProjectModel.model
    .findOneAndUpdate(
      { _id: id, ownerId },
      { ...changes, updatedAt: new Date() },
      { new: true, runValidators: true },
    )
    .lean<StoredProject | null>();
  return record ? toProject(record) : null;
}

export async function deleteProject(ownerId: string, id: string): Promise<boolean> {
  const result = await ProjectModel.model.deleteOne({ _id: id, ownerId });
  return result.deletedCount > 0;
}

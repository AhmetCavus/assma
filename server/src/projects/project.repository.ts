import { projectSchema, type Project } from "@assma/shared";
import ProjectModel, { type ProjectRecord } from "../models/project.model.js";

type StoredProject = ProjectRecord & { _id: unknown };
type ProjectFields = Omit<
  ProjectRecord,
  "ownerId" | "status" | "archived" | "createdAt" | "updatedAt"
>;

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

export async function createProject(ownerId: string, fields: ProjectFields): Promise<Project> {
  const now = new Date();
  const created = await ProjectModel.model.create({
    ...fields,
    ownerId,
    status: "captured",
    archived: false,
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

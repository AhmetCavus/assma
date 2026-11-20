import {
  experienceProfileSchema,
  experienceReferenceSchema,
  type ExperienceProfile,
  type ExperienceReference,
} from "@assma/shared";
import ProfileModel, { type ExperienceProfileRecord } from "../models/experienceProfile.model.js";
import ReferenceModel, {
  type ExperienceReferenceRecord,
} from "../models/experienceReference.model.js";

type StoredReference = ExperienceReferenceRecord & { _id: unknown };
type ProfileFields = Omit<ExperienceProfileRecord, "ownerId" | "updatedAt">;
type ReferenceFields = Omit<ExperienceReferenceRecord, "ownerId" | "createdAt" | "updatedAt">;

function toProfile(record: ExperienceProfileRecord): ExperienceProfile {
  return experienceProfileSchema.parse({
    name: record.name ?? "",
    headline: record.headline ?? "",
    location: record.location ?? "",
    email: record.email ?? "",
    summary: record.summary ?? "",
    updatedAt: record.updatedAt.toISOString(),
  });
}

function toReference(record: StoredReference): ExperienceReference {
  return experienceReferenceSchema.parse({
    id: String(record._id),
    organization: record.organization,
    role: record.role,
    start: record.start,
    end: record.end ?? null,
    contribution: record.contribution,
    skills: Array.isArray(record.skills) ? record.skills : [],
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  });
}

export async function findProfile(ownerId: string): Promise<ExperienceProfile | null> {
  const record = await ProfileModel.model
    .findOne({ ownerId })
    .lean<ExperienceProfileRecord | null>();
  return record ? toProfile(record) : null;
}

export async function saveProfile(
  ownerId: string,
  fields: ProfileFields,
): Promise<ExperienceProfile> {
  const record = await ProfileModel.model
    .findOneAndUpdate(
      { ownerId },
      { ...fields, ownerId, updatedAt: new Date() },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    )
    .lean<ExperienceProfileRecord>();
  return toProfile(record);
}

export async function listReferences(ownerId: string): Promise<ExperienceReference[]> {
  const records = await ReferenceModel.model.find({ ownerId }).limit(500).lean<StoredReference[]>();
  return records.map(toReference);
}

export async function countReferences(ownerId: string): Promise<number> {
  return ReferenceModel.model.countDocuments({ ownerId });
}

export async function createReference(
  ownerId: string,
  fields: ReferenceFields,
): Promise<ExperienceReference> {
  const now = new Date();
  const created = await ReferenceModel.model.create({
    ...fields,
    ownerId,
    createdAt: now,
    updatedAt: now,
  });
  return toReference(created.toObject() as StoredReference);
}

/** Only the owner's record matches, so another account's id behaves like an unknown one. */
export async function updateReference(
  ownerId: string,
  id: string,
  fields: ReferenceFields,
): Promise<ExperienceReference | null> {
  const record = await ReferenceModel.model
    .findOneAndUpdate(
      { _id: id, ownerId },
      { ...fields, updatedAt: new Date() },
      { new: true, runValidators: true },
    )
    .lean<StoredReference | null>();
  return record ? toReference(record) : null;
}

export async function deleteReference(ownerId: string, id: string): Promise<boolean> {
  const result = await ReferenceModel.model.deleteOne({ _id: id, ownerId });
  return result.deletedCount > 0;
}

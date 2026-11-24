import {
  experienceProfileSchema,
  experienceReferenceSchema,
  profileImageSchema,
  skillFactSchema,
  skillUsageSchema,
  type SkillFact,
  type ExperienceProfile,
  type ProfileImage,
  type ExperienceReference,
} from "@assma/shared";
import ProfileModel, { type ExperienceProfileRecord } from "../models/experienceProfile.model.js";
import SkillFactsModel, { type SkillFactsRecord } from "../models/skillFacts.model.js";
import { bytesOf } from "../platform/bytes.js";
import ImageModel, { type ProfileImageRecord } from "../models/profileImage.model.js";
import ReferenceModel, {
  type ExperienceReferenceRecord,
} from "../models/experienceReference.model.js";

type StoredReference = ExperienceReferenceRecord & { _id: unknown };
type ProfileFields = Omit<ExperienceProfileRecord, "ownerId" | "updatedAt">;
type ReferenceFields = Omit<
  ExperienceReferenceRecord,
  "ownerId" | "createdAt" | "updatedAt" | "skillUsage"
> & { skillUsage?: unknown[] };

/** Stored entries that no longer match the contract are dropped, not reported as errors. */
function validEntries<T>(
  value: unknown,
  schema: { safeParse(input: unknown): { success: boolean; data?: T } },
): T[] {
  return (Array.isArray(value) ? value : []).flatMap((entry) => {
    const parsed = schema.safeParse(entry);
    return parsed.success ? [parsed.data as T] : [];
  });
}

function toProfile(record: ExperienceProfileRecord): ExperienceProfile {
  return experienceProfileSchema.parse({
    name: record.name ?? "",
    headline: record.headline ?? "",
    location: record.location ?? "",
    email: record.email ?? "",
    phone: record.phone ?? "",
    address: record.address ?? "",
    website: record.website ?? "",
    summary: record.summary ?? "",
    certificates: Array.isArray(record.certificates) ? record.certificates : [],
    languages: Array.isArray(record.languages) ? record.languages : [],
    education: Array.isArray(record.education) ? record.education : [],
    hobbies: Array.isArray(record.hobbies) ? record.hobbies : [],
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
    skillUsage: validEntries(record.skillUsage, skillUsageSchema),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  });
}

export async function findReference(
  ownerId: string,
  id: string,
): Promise<ExperienceReference | null> {
  const record = await ReferenceModel.model
    .findOne({ _id: id, ownerId })
    .lean<StoredReference | null>();
  return record ? toReference(record) : null;
}

export async function listSkillFacts(ownerId: string): Promise<SkillFact[]> {
  const record = await SkillFactsModel.model.findOne({ ownerId }).lean<SkillFactsRecord | null>();
  return validEntries(record?.facts, skillFactSchema);
}

export async function saveSkillFacts(ownerId: string, facts: SkillFact[]): Promise<SkillFact[]> {
  const record = await SkillFactsModel.model
    .findOneAndUpdate(
      { ownerId },
      { ownerId, facts, updatedAt: new Date() },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    )
    .lean<SkillFactsRecord>();
  return validEntries(record.facts, skillFactSchema);
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

export async function createReferences(ownerId: string, list: ReferenceFields[]): Promise<void> {
  if (list.length === 0) {
    return;
  }
  const now = new Date();
  await ReferenceModel.model.insertMany(
    list.map((fields) => ({ ...fields, ownerId, createdAt: now, updatedAt: now })),
  );
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

// Profile photos -------------------------------------------------------------------------

type StoredImage = ProfileImageRecord & { _id: unknown };

function toImage(record: StoredImage): ProfileImage {
  return profileImageSchema.parse({
    id: String(record._id),
    dataUrl: `data:image/jpeg;base64,${bytesOf(record.data).toString("base64")}`,
    createdAt: record.createdAt.toISOString(),
  });
}

export async function listImages(ownerId: string): Promise<ProfileImage[]> {
  const records = await ImageModel.model
    .find({ ownerId })
    .sort({ createdAt: 1 })
    .limit(50)
    .lean<StoredImage[]>();
  return records.map(toImage);
}

export async function countImages(ownerId: string): Promise<number> {
  return ImageModel.model.countDocuments({ ownerId });
}

export async function imageExists(ownerId: string, id: string): Promise<boolean> {
  return Boolean(await ImageModel.model.exists({ _id: id, ownerId }));
}

export async function createImage(ownerId: string, data: Buffer): Promise<ProfileImage> {
  const created = await ImageModel.model.create({ ownerId, data, createdAt: new Date() });
  return toImage(created.toObject() as StoredImage);
}

export async function deleteImage(ownerId: string, id: string): Promise<boolean> {
  const result = await ImageModel.model.deleteOne({ _id: id, ownerId });
  return result.deletedCount > 0;
}

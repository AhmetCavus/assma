import { cvDraftSchema, type CvDraft, type SavedCv } from "@assma/shared";
import SavedCvModel, { type SavedCvRecord } from "../models/savedCv.model.js";

type Stored = SavedCvRecord & { _id: unknown };

function toSavedCv(record: Stored): SavedCv {
  return {
    id: String(record._id),
    name: record.name,
    // A configuration that no longer matches the contract opens as the defaults.
    cv: cvDraftSchema.safeParse(record.cv).data ?? cvDraftSchema.parse({}),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export async function listSavedCvs(ownerId: string): Promise<SavedCv[]> {
  const records = await SavedCvModel.model.find({ ownerId }).sort({ name: 1 }).lean<Stored[]>();
  return records.map(toSavedCv);
}

export async function countSavedCvs(ownerId: string): Promise<number> {
  return SavedCvModel.model.countDocuments({ ownerId });
}

export async function createSavedCv(ownerId: string, name: string, cv: CvDraft): Promise<SavedCv> {
  const now = new Date();
  const created = await SavedCvModel.model.create({
    ownerId,
    name,
    cv,
    createdAt: now,
    updatedAt: now,
  });
  return toSavedCv(created.toObject() as Stored);
}

/** Only the owner's record matches, so another account's id behaves like an unknown one. */
export async function updateSavedCv(
  ownerId: string,
  id: string,
  name: string,
  cv: CvDraft,
): Promise<SavedCv | null> {
  const record = await SavedCvModel.model
    .findOneAndUpdate(
      { _id: id, ownerId },
      { name, cv, updatedAt: new Date() },
      { new: true, runValidators: true },
    )
    .lean<Stored | null>();
  return record ? toSavedCv(record) : null;
}

export async function deleteSavedCv(ownerId: string, id: string): Promise<boolean> {
  const result = await SavedCvModel.model.deleteOne({ _id: id, ownerId });
  return result.deletedCount > 0;
}

import {
  applicationEventSchema,
  applicationSchema,
  type Application,
  type ApplicationEvent,
} from "@assma/shared";
import ApplicationModel, { type ApplicationRecord } from "../models/application.model.js";
import FileModel, { type ApplicationFileRecord } from "../models/applicationFile.model.js";
import { bytesOf } from "../platform/bytes.js";

type StoredApplication = ApplicationRecord & { _id: unknown };
type StoredFile = ApplicationFileRecord & { _id: unknown };

export type ApplicationFields = Omit<
  ApplicationRecord,
  "ownerId" | "createdAt" | "updatedAt" | "events" | "followUpAt" | "followUpNote"
>;

/** Events that no longer match the contract are left out rather than failing the record. */
function eventsOf(value: unknown): ApplicationEvent[] {
  return Array.isArray(value)
    ? value.flatMap((event) => {
        const parsed = applicationEventSchema.safeParse(event);
        return parsed.success ? [parsed.data] : [];
      })
    : [];
}

function toApplication(record: StoredApplication): Application {
  return applicationSchema.parse({
    id: String(record._id),
    projectId: record.projectId,
    channel: record.channel,
    submittedAt: record.submittedAt.toISOString(),
    email: record.email ?? null,
    portal: record.portal ?? null,
    file: record.file ?? null,
    snapshot: record.snapshot,
    followUpAt: record.followUpAt ?? null,
    followUpNote: record.followUpNote ?? "",
    events: eventsOf(record.events),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  });
}

export async function listApplications(ownerId: string): Promise<Application[]> {
  const records = await ApplicationModel.model
    .find({ ownerId })
    .sort({ submittedAt: -1 })
    .limit(2000)
    .lean<StoredApplication[]>();
  return records.flatMap((record) => {
    // A record whose snapshot no longer parses is skipped in lists instead of breaking them.
    try {
      return [toApplication(record)];
    } catch {
      return [];
    }
  });
}

export async function findApplication(ownerId: string, id: string): Promise<Application | null> {
  const record = await ApplicationModel.model
    .findOne({ _id: id, ownerId })
    .lean<StoredApplication | null>();
  return record ? toApplication(record) : null;
}

export async function countApplications(ownerId: string): Promise<number> {
  return ApplicationModel.model.countDocuments({ ownerId });
}

export async function createApplication(
  ownerId: string,
  fields: ApplicationFields,
  file: { name: string; data: Buffer } | null,
): Promise<Application> {
  const now = new Date();
  const created = await ApplicationModel.model.create({
    ...fields,
    ownerId,
    file: file ? { name: file.name, size: file.data.length } : null,
    followUpAt: null,
    followUpNote: "",
    events: [],
    createdAt: now,
    updatedAt: now,
  });
  const application = toApplication(created.toObject() as StoredApplication);
  if (file) {
    try {
      await FileModel.model.create({
        ownerId,
        applicationId: application.id,
        name: file.name,
        data: file.data,
        createdAt: now,
      });
    } catch (error) {
      // Without its file the record would claim an attachment it cannot return.
      await ApplicationModel.model.deleteOne({ _id: application.id, ownerId });
      throw error;
    }
  }
  return application;
}

export async function updateApplication(
  ownerId: string,
  id: string,
  changes: Partial<Pick<ApplicationRecord, "followUpAt" | "followUpNote">>,
  event: ApplicationEvent | null,
): Promise<Application | null> {
  const update: Record<string, unknown> = { $set: { ...changes, updatedAt: new Date() } };
  if (event) {
    update.$push = { events: event };
  }
  const record = await ApplicationModel.model
    .findOneAndUpdate({ _id: id, ownerId }, update, { new: true, runValidators: true })
    .lean<StoredApplication | null>();
  return record ? toApplication(record) : null;
}

export async function removeEvent(
  ownerId: string,
  id: string,
  eventId: string,
): Promise<Application | null> {
  const record = await ApplicationModel.model
    .findOneAndUpdate(
      { _id: id, ownerId },
      { $pull: { events: { id: eventId } }, $set: { updatedAt: new Date() } },
      { new: true },
    )
    .lean<StoredApplication | null>();
  return record ? toApplication(record) : null;
}

export async function findFile(
  ownerId: string,
  applicationId: string,
): Promise<{ name: string; data: Buffer } | null> {
  const record = await FileModel.model
    .findOne({ ownerId, applicationId })
    .lean<StoredFile | null>();
  return record ? { name: record.name, data: bytesOf(record.data) } : null;
}

export async function deleteApplication(ownerId: string, id: string): Promise<boolean> {
  const result = await ApplicationModel.model.deleteOne({ _id: id, ownerId });
  await FileModel.model.deleteMany({ ownerId, applicationId: id });
  return result.deletedCount > 0;
}

/** Removes every application of a project together with its files. */
export async function deleteForProject(ownerId: string, projectId: string): Promise<void> {
  const records = await ApplicationModel.model
    .find({ ownerId, projectId })
    .select({ _id: 1 })
    .lean<{ _id: unknown }[]>();
  const ids = records.map((record) => String(record._id));
  await ApplicationModel.model.deleteMany({ ownerId, projectId });
  if (ids.length > 0) {
    await FileModel.model.deleteMany({ ownerId, applicationId: { $in: ids } });
  }
}

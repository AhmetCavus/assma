import { createCollection, Provider } from "yappio";
import { APPLICATION_CHANNELS } from "@assma/shared";

/** A recorded application with its frozen snapshot, notes, replies and follow-up. */
export type ApplicationRecord = {
  ownerId: string;
  projectId: string;
  channel: string;
  submittedAt: Date;
  email: unknown;
  portal: unknown;
  file: unknown;
  snapshot: unknown;
  followUpAt: string | null;
  followUpNote: string;
  events: unknown;
  createdAt: Date;
  updatedAt: Date;
};

export default createCollection<ApplicationRecord>("AssmaApplication").withSchema({
  ownerId: { ...Provider.String, required: true, index: true },
  projectId: { ...Provider.String, required: true, index: true },
  channel: { ...Provider.String, enum: [...APPLICATION_CHANNELS], required: true },
  submittedAt: { ...Provider.Date, required: true },
  email: { ...Provider.Mixed, default: null },
  portal: { ...Provider.Mixed, default: null },
  file: { ...Provider.Mixed, default: null },
  snapshot: { ...Provider.Mixed, required: true },
  followUpAt: { ...Provider.String, default: null },
  followUpNote: { ...Provider.String, default: "" },
  events: { ...Provider.Mixed, default: [] },
  createdAt: { ...Provider.Date, required: true },
  updatedAt: { ...Provider.Date, required: true },
});

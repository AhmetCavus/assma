import { createCollection, Provider } from "yappio";
import { PROJECT_STATUSES } from "@assma/shared";

/** A captured project listing and where the freelancer stands with it. */
export type ProjectRecord = {
  ownerId: string;
  title: string;
  company: string;
  agency: string;
  contact: string;
  contactEmail: string;
  sourceUrl: string;
  brief: string;
  tech: string[];
  required: string[];
  preferred: string[];
  terms: string;
  status: string;
  archived: boolean;
  draft: boolean;
  fit: unknown;
  /** The multi-dimensional assessment (version 2); the legacy `fit` stays for history. */
  assessment: unknown;
  /** Structured working conditions; missing on older records. */
  conditions: unknown;
  cv: unknown;
  createdAt: Date;
  updatedAt: Date;
};

export default createCollection<ProjectRecord>("AssmaProject").withSchema({
  ownerId: { ...Provider.String, required: true, index: true },
  title: { ...Provider.String, required: true },
  company: { ...Provider.String, default: "" },
  agency: { ...Provider.String, default: "" },
  contact: { ...Provider.String, default: "" },
  contactEmail: { ...Provider.String, default: "" },
  sourceUrl: { ...Provider.String, default: "" },
  brief: { ...Provider.String, default: "" },
  tech: Provider.Mixed,
  required: Provider.Mixed,
  preferred: Provider.Mixed,
  terms: { ...Provider.String, default: "" },
  status: { ...Provider.String, enum: [...PROJECT_STATUSES], default: "captured" },
  archived: { ...Provider.Boolean, default: false },
  draft: { ...Provider.Boolean, default: false },
  fit: { ...Provider.Mixed, default: null },
  assessment: { ...Provider.Mixed, default: null },
  conditions: { ...Provider.Mixed, default: null },
  cv: { ...Provider.Mixed, default: null },
  createdAt: { ...Provider.Date, required: true },
  updatedAt: { ...Provider.Date, required: true },
});

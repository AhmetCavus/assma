import { createCollection, Provider } from "yappio";

/** A project the freelancer worked on, with their own contribution and technologies. */
export type ExperienceReferenceRecord = {
  ownerId: string;
  organization: string;
  role: string;
  /** "YYYY-MM" */
  start: string;
  /** "YYYY-MM", or null while ongoing. */
  end: string | null;
  contribution: string;
  skills: string[];
  /** How each listed skill was used; see the shared contract. Missing on older records. */
  skillUsage: unknown[];
  createdAt: Date;
  updatedAt: Date;
};

export default createCollection<ExperienceReferenceRecord>("AssmaExperienceReference").withSchema({
  ownerId: { ...Provider.String, required: true, index: true },
  organization: { ...Provider.String, required: true },
  role: { ...Provider.String, required: true },
  start: { ...Provider.String, required: true },
  end: { ...Provider.String, default: null },
  contribution: { ...Provider.String, required: true },
  skills: Provider.Mixed,
  skillUsage: { ...Provider.Mixed, default: [] },
  createdAt: { ...Provider.Date, required: true },
  updatedAt: { ...Provider.Date, required: true },
});

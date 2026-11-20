import { createCollection, Provider } from "yappio";

/** One set of personal details per account; the CV header and later the assistant use it. */
export type ExperienceProfileRecord = {
  ownerId: string;
  name: string;
  headline: string;
  location: string;
  email: string;
  summary: string;
  updatedAt: Date;
};

export default createCollection<ExperienceProfileRecord>("AssmaExperienceProfile").withSchema({
  ownerId: { ...Provider.String, required: true, unique: true },
  name: { ...Provider.String, default: "" },
  headline: { ...Provider.String, default: "" },
  location: { ...Provider.String, default: "" },
  email: { ...Provider.String, default: "" },
  summary: { ...Provider.String, default: "" },
  updatedAt: { ...Provider.Date, required: true },
});

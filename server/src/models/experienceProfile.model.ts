import { createCollection, Provider } from "yappio";
import type { Certificate, Education, Language } from "@assma/shared";

/** One set of personal details per account; the CV header and sidebar use it. */
export type ExperienceProfileRecord = {
  ownerId: string;
  name: string;
  headline: string;
  location: string;
  email: string;
  phone: string;
  address: string;
  website: string;
  summary: string;
  certificates: Certificate[];
  languages: Language[];
  education: Education[];
  hobbies: string[];
  updatedAt: Date;
};

export default createCollection<ExperienceProfileRecord>("AssmaExperienceProfile").withSchema({
  ownerId: { ...Provider.String, required: true, unique: true },
  name: { ...Provider.String, default: "" },
  headline: { ...Provider.String, default: "" },
  location: { ...Provider.String, default: "" },
  email: { ...Provider.String, default: "" },
  phone: { ...Provider.String, default: "" },
  address: { ...Provider.String, default: "" },
  website: { ...Provider.String, default: "" },
  summary: { ...Provider.String, default: "" },
  certificates: Provider.Mixed,
  languages: Provider.Mixed,
  education: Provider.Mixed,
  hobbies: Provider.Mixed,
  updatedAt: { ...Provider.Date, required: true },
});

import { createCollection, Provider } from "yappio";

/** The person's economic preferences; separate from their experience. One per account. */
export type PreferencesRecord = {
  ownerId: string;
  economic: unknown;
  updatedAt: Date;
};

export default createCollection<PreferencesRecord>("AssmaPreferences").withSchema({
  ownerId: { ...Provider.String, required: true, unique: true },
  economic: { ...Provider.Mixed, default: null },
  updatedAt: { ...Provider.Date, required: true },
});

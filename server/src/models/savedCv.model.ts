import { createCollection, Provider } from "yappio";

/** A named CV configuration of an account, reusable in every project. */
export type SavedCvRecord = {
  ownerId: string;
  name: string;
  cv: unknown;
  createdAt: Date;
  updatedAt: Date;
};

export default createCollection<SavedCvRecord>("AssmaSavedCv").withSchema({
  ownerId: { ...Provider.String, required: true, index: true },
  name: { ...Provider.String, required: true },
  cv: { ...Provider.Mixed, default: null },
  createdAt: { ...Provider.Date, required: true },
  updatedAt: { ...Provider.Date, required: true },
});

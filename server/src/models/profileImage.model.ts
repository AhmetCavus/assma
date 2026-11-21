import { createCollection, Provider } from "yappio";

/** A profile photo: a square JPEG prepared in the browser, kept private to its owner. */
export type ProfileImageRecord = {
  ownerId: string;
  data: Buffer;
  createdAt: Date;
};

export default createCollection<ProfileImageRecord>("AssmaProfileImage").withSchema({
  ownerId: { ...Provider.String, required: true, index: true },
  data: { ...Provider.Buffer, required: true },
  createdAt: { ...Provider.Date, required: true },
});

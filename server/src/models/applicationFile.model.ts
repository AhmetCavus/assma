import { createCollection, Provider } from "yappio";

/** The exact PDF attached to an email or uploaded to a portal, kept apart from the record. */
export type ApplicationFileRecord = {
  ownerId: string;
  applicationId: string;
  name: string;
  data: Buffer;
  createdAt: Date;
};

export default createCollection<ApplicationFileRecord>("AssmaApplicationFile").withSchema({
  ownerId: { ...Provider.String, required: true, index: true },
  applicationId: { ...Provider.String, required: true, index: true },
  name: { ...Provider.String, required: true },
  data: { ...Provider.Buffer, required: true },
  createdAt: { ...Provider.Date, required: true },
});

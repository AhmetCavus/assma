import { createCollection, Provider } from "yappio";

/** Session state per account, kept outside Yappio's profile. */
export type AccountSecurityRecord = {
  ownerId: string;
  /** Login tokens issued before this moment are no longer accepted. */
  sessionsValidFrom: Date | null;
  updatedAt: Date;
};

export default createCollection<AccountSecurityRecord>("AssmaAccountSecurity").withSchema({
  ownerId: { ...Provider.String, required: true, unique: true },
  sessionsValidFrom: { ...Provider.Date, default: null },
  updatedAt: { ...Provider.Date, required: true },
});

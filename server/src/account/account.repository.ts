import AccountSecurityModel, {
  type AccountSecurityRecord,
} from "../models/accountSecurity.model.js";
import { Profiles, type ProfileRecord } from "../platform/yappio.js";

export type Security = AccountSecurityRecord;

export async function findSecurity(ownerId: string): Promise<Security | null> {
  return AccountSecurityModel.model.findOne({ ownerId }).lean<Security | null>();
}

export async function findProfile(id: string): Promise<ProfileRecord | null> {
  return Profiles.model.findOne({ _id: id }).lean<ProfileRecord | null>();
}

/** Yappio stores the address as it was typed at sign-up; fall back to the lower-case form. */
export async function findProfileByEmail(email: string): Promise<ProfileRecord | null> {
  const exact = await Profiles.model.findOne({ email }).lean<ProfileRecord | null>();
  if (exact || email === email.toLowerCase()) {
    return exact;
  }
  return Profiles.model.findOne({ email: email.toLowerCase() }).lean<ProfileRecord | null>();
}

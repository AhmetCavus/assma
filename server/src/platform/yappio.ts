import { createRequire } from "node:module";
import path from "node:path";
import type { Model } from "mongoose";

const require = createRequire(import.meta.url);
const core = path.join(path.dirname(require.resolve("yappio")), "src/core");

// Yappio 1.3.1 does not export these services; this file is the only place that reaches
// into the pinned package, so an upgrade has one adapter to check.
function load<T>(file: string): T {
  return (require(path.join(core, file)) as { default: T }).default;
}

export type ProfileRecord = {
  _id: { toString(): string; getTimestamp(): Date };
  username: string;
  email: string;
  password: string;
  role?: string;
};

export const tokens = load<{
  verify(token: string): unknown;
  /** Signs a 24-hour login token; extra claims in the payload are kept. */
  signForAuthHeader(payload: Record<string, unknown>): string;
}>("services/token.service.js");

export const passwords = load<{
  hashPassword(password: string): Promise<string>;
  comparePassword(password: string, hash: string): Promise<boolean>;
}>("services/encryption.service.js");

export const Profiles = load<{ model: Model<ProfileRecord> }>("models/profile.model.js");

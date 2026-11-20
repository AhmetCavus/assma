import { loginRequestSchema, roleSchema, type AccountInfo, type LoginResult } from "@assma/shared";
import type { Account } from "../platform/access.js";
import { AssmaError, notFound } from "../platform/errors.js";
import { RateLimiter } from "../platform/rateLimit.js";
import { passwords, tokens, type ProfileRecord } from "../platform/yappio.js";
import * as repository from "./account.repository.js";

const QUARTER_HOUR = 15 * 60 * 1000;
const loginByAddress = new RateLimiter(40, QUARTER_HOUR);
const loginByAccount = new RateLimiter(10, QUARTER_HOUR);

function issueToken(profile: ProfileRecord): string {
  return tokens.signForAuthHeader({
    _id: profile._id.toString(),
    username: profile.username,
    email: profile.email,
    role: roleSchema.parse(profile.role ?? "user"),
  });
}

let timingPad: Promise<string> | undefined;

/** Compares even when the account is unknown, so response time does not reveal who exists. */
async function passwordMatches(profile: ProfileRecord | null, password: string): Promise<boolean> {
  timingPad ??= passwords.hashPassword(`timing-pad-${Math.random()}`);
  const matches = await passwords.comparePassword(password, profile?.password || (await timingPad));
  return Boolean(profile?.password) && matches;
}

export async function login(input: unknown, address: string): Promise<LoginResult> {
  const { email, password } = loginRequestSchema.parse(input);
  const accountKey = email.toLowerCase();
  loginByAddress.attempt(address);
  loginByAccount.attempt(accountKey);
  const profile = await repository.findProfileByEmail(email);
  if (!(await passwordMatches(profile, password)) || !profile) {
    throw new AssmaError(401, "invalid_credentials");
  }
  loginByAccount.clear(accountKey);
  return { token: issueToken(profile) };
}

export async function accountInfo(account: Account): Promise<AccountInfo> {
  const profile = await repository.findProfile(account.id);
  if (!profile) {
    throw notFound();
  }
  return { id: account.id, name: profile.username, email: profile.email, role: account.role };
}

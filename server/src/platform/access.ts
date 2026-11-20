import type { Request, RequestHandler, Response } from "express";
import { retrieveProfileFromToken } from "yappio";
import { roleSchema, type Role } from "@assma/shared";
import { findSecurity } from "../account/account.repository.js";
import { issuedBeforeCutoff, roleAllowed, sessionClaimsSchema } from "./session.js";
import { tokens } from "./yappio.js";

export type Account = { id: string; role: Role; name: string };

function bearer(request: Request): string {
  return request.headers.authorization?.replace(/^Bearer\s+/i, "").trim() ?? "";
}

async function resolveAccount(request: Request): Promise<Account> {
  const claims = sessionClaimsSchema.parse(tokens.verify(bearer(request)));
  const [profile, security] = await Promise.all([
    retrieveProfileFromToken(request),
    findSecurity(claims._id),
  ]);
  if (!profile || String(profile._id) !== claims._id) {
    throw new Error("access_denied");
  }
  if (issuedBeforeCutoff(claims, security?.sessionsValidFrom)) {
    throw new Error("access_denied");
  }
  // The stored role decides, so a demoted account loses access with its current token.
  const role = roleSchema.parse(profile.role);
  return { id: claims._id, role, name: String(profile.username ?? "").slice(0, 60) };
}

/** The single gate for assma's routes. `adminOnly` admits admin and root. */
export function requireAccount(adminOnly = false): RequestHandler {
  return (request, response, next) => {
    void resolveAccount(request)
      .then((account) => {
        if (!roleAllowed(account.role, adminOnly)) {
          throw new Error("access_denied");
        }
        response.locals.account = account;
        next();
      })
      .catch(() => {
        response.status(401).json({ success: false, error: "access_denied" });
      });
  };
}

export function accountOf(response: Response): Account {
  const account = response.locals.account as Account | undefined;
  if (!account) {
    throw new Error("Missing account; mount requireAccount first.");
  }
  return account;
}

import { z } from "zod";
import { roleSchema } from "@assma/shared";

// Only full login tokens qualify. OTP-stage tokens ({ uid, otp }) and device API tokens are rejected.
export const sessionClaimsSchema = z.object({
  apiMode: z.literal(true),
  _id: z.string().min(1),
  role: roleSchema,
  otp: z.undefined(),
  uid: z.undefined(),
  iat: z.number(),
});
export type SessionClaims = z.infer<typeof sessionClaimsSchema>;

/** A password change or role change signs out every token issued before it. */
export function issuedBeforeCutoff(claims: SessionClaims, validFrom: Date | null | undefined) {
  return Boolean(validFrom && claims.iat * 1000 < validFrom.getTime());
}

/** Admin-only routes accept admin and root, never user. */
export function roleAllowed(role: SessionClaims["role"], adminOnly: boolean): boolean {
  return !adminOnly || role === "admin" || role === "root";
}

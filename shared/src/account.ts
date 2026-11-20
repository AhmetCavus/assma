import { z } from "zod";

/** Contracts for signing in, the signed-in account and the admin overview. */

export const identifier = z.string().regex(/^[a-f0-9]{24}$/i, "invalid_id");

export const ROLES = ["user", "admin", "root"] as const;
export const roleSchema = z.enum(ROLES);
export type Role = z.infer<typeof roleSchema>;

/** Administrators and root may open the admin panel; users may not. */
export function isAdministrator(role: unknown): boolean {
  return role === "admin" || role === "root";
}

export const PASSWORD_RULE = {
  minLength: 8,
  maxLength: 72,
  minSpecialCharacters: 2,
} as const;

export function passwordProblems(password: string): ("length" | "special")[] {
  const problems: ("length" | "special")[] = [];
  if (password.length < PASSWORD_RULE.minLength || password.length > PASSWORD_RULE.maxLength) {
    problems.push("length");
  }
  if ((password.match(/[^a-zA-Z0-9]/g) ?? []).length < PASSWORD_RULE.minSpecialCharacters) {
    problems.push("special");
  }
  return problems;
}

const email = z.string().trim().min(1).max(254);
const password = z.string().min(1).max(PASSWORD_RULE.maxLength);

export const loginRequestSchema = z.object({ email, password });
export type LoginRequest = z.input<typeof loginRequestSchema>;

export const loginResultSchema = z.object({ token: z.string().min(1) });
export type LoginResult = z.infer<typeof loginResultSchema>;

export const accountSchema = z.object({
  id: identifier,
  name: z.string(),
  email: z.string(),
  role: roleSchema,
});
export type AccountInfo = z.infer<typeof accountSchema>;

export const adminOverviewSchema = z.object({
  users: z.number().int().min(0),
  admins: z.number().int().min(0),
  newUsersThisWeek: z.number().int().min(0),
  system: z.object({
    version: z.string(),
    database: z.string(),
  }),
});
export type AdminOverview = z.infer<typeof adminOverviewSchema>;

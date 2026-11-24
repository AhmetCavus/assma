import { z } from "zod";
import { identifier } from "./account.js";
import { cvDraftSchema } from "./fit.js";

/**
 * Named CV configurations of an account: design, language, photo, summary, skills, roles
 * and references as set in the CV generator, to reuse in any project.
 */

export const SAVED_CV_LIMITS = {
  name: 60,
  perAccount: 30,
};

export const savedCvInputSchema = z.object({
  name: z.string().trim().min(1).max(SAVED_CV_LIMITS.name),
  cv: cvDraftSchema,
});
export type SavedCvInput = z.input<typeof savedCvInputSchema>;

export const savedCvSchema = z.object({
  id: identifier,
  name: z.string(),
  cv: cvDraftSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type SavedCv = z.infer<typeof savedCvSchema>;

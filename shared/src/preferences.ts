import { z } from "zod";
import { CONTRACT_TYPES, TRAVEL_LEVELS } from "./projects.js";

/**
 * The freelancer's economic preferences: what makes a project attractive to them and what
 * rules it out. Kept apart from their professional experience: different data, saved and
 * changed separately, and only ever read by Economic Fit.
 */

export const ECONOMIC_CRITERIA = [
  "compensation",
  "remote",
  "contract",
  "duration",
  "workload",
  "travel",
] as const;
export type EconomicCriterion = (typeof ECONOMIC_CRITERIA)[number];

export const DEFAULT_WEIGHTS: Record<EconomicCriterion, number> = {
  compensation: 30,
  remote: 25,
  contract: 20,
  duration: 10,
  workload: 10,
  travel: 5,
};

const amount = z.number().min(0).max(10_000_000).nullable().default(null);
const percent = z.number().int().min(0).max(100).nullable().default(null);
const monthCount = z.number().int().min(1).max(120).nullable().default(null);
const hours = z.number().min(1).max(80).nullable().default(null);
const currency = z
  .string()
  .trim()
  .regex(/^[A-Z]{3}$/, "invalid_currency")
  .default("EUR");

export const economicPreferencesSchema = z.object({
  weights: z
    .object(
      Object.fromEntries(
        ECONOMIC_CRITERIA.map((criterion) => [
          criterion,
          z.number().min(0).max(100).default(DEFAULT_WEIGHTS[criterion]),
        ]),
      ) as Record<EconomicCriterion, z.ZodDefault<z.ZodNumber>>,
    )
    .default({}),
  /** Freelance rates, per hour or per day. */
  freelance: z
    .object({
      target: amount,
      minimum: amount,
      unit: z.enum(["hour", "day"]).default("hour"),
      currency,
    })
    .refine(
      (range) => range.target === null || range.minimum === null || range.minimum <= range.target,
      {
        message: "minimum_above_target",
        path: ["minimum"],
      },
    )
    .default({}),
  /** Annual gross salary for employment, at the person's reference weekly hours. */
  employment: z
    .object({
      target: amount,
      minimum: amount,
      currency,
      referenceHours: z.number().min(1).max(80).default(40),
    })
    .refine(
      (range) => range.target === null || range.minimum === null || range.minimum <= range.target,
      {
        message: "minimum_above_target",
        path: ["minimum"],
      },
    )
    .default({}),
  /** Remote share: at or above the target fully, down to the minimum partly. */
  remote: z
    .object({ target: percent, minimum: percent })
    .refine(
      (range) => range.target === null || range.minimum === null || range.minimum <= range.target,
      { message: "minimum_above_target", path: ["minimum"] },
    )
    .default({}),
  contracts: z
    .object({
      preferred: z.array(z.enum(CONTRACT_TYPES)).default([]),
      acceptable: z.array(z.enum(CONTRACT_TYPES)).default([]),
    })
    .default({}),
  /** Project length in months: at least the minimum, ideally from the target up to the maximum. */
  duration: z
    .object({ minimum: monthCount, target: monthCount, maximum: monthCount })
    .refine(
      (range) =>
        [range.minimum, range.target, range.maximum]
          .filter((value): value is number => value !== null)
          .every((value, index, values) => index === 0 || values[index - 1]! <= value),
      { message: "range_order", path: ["maximum"] },
    )
    .default({}),
  /** Weekly hours: up to the target fully, up to the maximum partly. */
  workload: z
    .object({ target: hours, maximum: hours })
    .refine(
      (range) => range.target === null || range.maximum === null || range.target <= range.maximum,
      {
        message: "range_order",
        path: ["maximum"],
      },
    )
    .default({}),
  travel: z
    .object({
      target: z.enum(TRAVEL_LEVELS).nullable().default(null),
      maximum: z.enum(TRAVEL_LEVELS).nullable().default(null),
    })
    .default({}),
  /** Hard exclusions, reported separately and never folded into the score. */
  exclusions: z
    .object({
      /** Freelance rate in the freelance unit. */
      minimumRate: amount,
      /** Annual salary at the reference hours. */
      minimumSalary: amount,
      minimumRemote: percent,
      contracts: z.array(z.enum(CONTRACT_TYPES)).default([]),
    })
    .default({}),
});
export type EconomicPreferences = z.infer<typeof economicPreferencesSchema>;
export type EconomicPreferencesInput = z.input<typeof economicPreferencesSchema>;

/** Until the person saves anything: the initial weights and no targets. */
export const DEFAULT_ECONOMIC_PREFERENCES: EconomicPreferences = economicPreferencesSchema.parse(
  {},
);

export const storedPreferencesSchema = z.object({
  economic: economicPreferencesSchema,
  /** Null until saved for the first time. */
  updatedAt: z.string().datetime().nullable(),
});
export type StoredPreferences = z.infer<typeof storedPreferencesSchema>;

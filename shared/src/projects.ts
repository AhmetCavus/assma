import { z } from "zod";
import { identifier } from "./account.js";
import { uniqueSkills } from "./experience.js";
import { cvDraftSchema, fitSchema } from "./fit.js";

/**
 * Contracts for the project register: listings the freelancer captured, from a link, pasted
 * text or manual entry, with their status through the acquisition.
 */

export const PROJECT_LIMITS = {
  title: 160,
  company: 120,
  agency: 120,
  contact: 120,
  contactEmail: 254,
  sourceUrl: 2000,
  brief: 30_000,
  minBrief: 40,
  item: 200,
  tech: 30,
  requirements: 30,
  terms: 300,
  projects: 500,
} as const;

/** In acquisition order. "applied" will later be set when an application is recorded. */
export const PROJECT_STATUSES = ["captured", "applied", "review", "interview", "closed"] as const;
export const projectStatusSchema = z.enum(PROJECT_STATUSES);
export type ProjectStatus = z.infer<typeof projectStatusSchema>;

const text = (max: number) => z.string().trim().max(max);

/** Trims, drops empty and repeated entries (ignoring case) and bounds a list. */
export function cleanList(items: readonly string[], maxItems: number, maxLength: number): string[] {
  return uniqueSkills(items.map((item) => item.slice(0, maxLength))).slice(0, maxItems);
}

/** One entry per line, for requirements that may themselves contain commas. */
export function parseLines(value: string): string[] {
  return value.split("\n").map((line) => line.replace(/^\s*[-•*·]\s*/, ""));
}

const list = (maxItems: number) =>
  z
    .array(z.string().max(PROJECT_LIMITS.item * 2))
    .max(maxItems * 2)
    .default([])
    .transform((items) => cleanList(items, maxItems, PROJECT_LIMITS.item));

const sourceUrl = z.union([
  z.literal(""),
  z
    .string()
    .trim()
    .max(PROJECT_LIMITS.sourceUrl)
    .url("invalid_url")
    .refine((value) => /^https?:\/\//i.test(value), "invalid_url"),
]);

export const projectInputSchema = z.object({
  title: text(PROJECT_LIMITS.title).min(1, "required"),
  company: text(PROJECT_LIMITS.company).default(""),
  agency: text(PROJECT_LIMITS.agency).default(""),
  contact: text(PROJECT_LIMITS.contact).default(""),
  contactEmail: z
    .union([z.literal(""), z.string().trim().email("invalid_email").max(254)])
    .default(""),
  sourceUrl: sourceUrl.default(""),
  /** The listing as captured, kept unchanged as the source. */
  brief: z.string().max(PROJECT_LIMITS.brief).default(""),
  tech: list(PROJECT_LIMITS.tech),
  required: list(PROJECT_LIMITS.requirements),
  preferred: list(PROJECT_LIMITS.requirements),
  /** Location, remote share, duration and similar working terms. */
  terms: text(PROJECT_LIMITS.terms).default(""),
});
export type ProjectInput = z.input<typeof projectInputSchema>;

export const projectChangeSchema = z
  .object({ status: projectStatusSchema, archived: z.boolean() })
  .partial()
  .refine((change) => change.status !== undefined || change.archived !== undefined, "empty");
export type ProjectChange = z.input<typeof projectChangeSchema>;

export const projectSchema = z.object({
  id: identifier,
  title: z.string(),
  company: z.string(),
  agency: z.string(),
  contact: z.string(),
  contactEmail: z.string(),
  sourceUrl: z.string(),
  brief: z.string(),
  tech: z.array(z.string()),
  required: z.array(z.string()),
  preferred: z.array(z.string()),
  terms: z.string(),
  status: projectStatusSchema,
  archived: z.boolean(),
  /** The latest experience assessment, or null before the first one. */
  fit: fitSchema.nullable(),
  /** The tailored CV draft, or null until the person saves one. */
  cv: cvDraftSchema.nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Project = z.infer<typeof projectSchema>;

/** Newest first. */
export function sortProjects<T extends Pick<Project, "createdAt">>(projects: readonly T[]): T[] {
  return [...projects].sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
  );
}

/** Search over title, end client and agency, ignoring case and accents. */
export function matchesSearch(
  project: Pick<Project, "title" | "company" | "agency">,
  query: string,
): boolean {
  const fold = (value: string) =>
    value
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase();
  const needle = fold(query.trim());
  return (
    !needle ||
    [project.title, project.company, project.agency].some((field) => fold(field).includes(needle))
  );
}

// ---------------------------------------------------------------------------------------
// Capturing from a link or text.

export const listingFetchRequestSchema = z.object({
  url: sourceUrl.refine(Boolean, "invalid_url"),
});
export type ListingFetchRequest = z.input<typeof listingFetchRequestSchema>;

export const listingFetchResultSchema = z.object({
  /** The address after redirects. */
  url: z.string(),
  text: z.string(),
});
export type ListingFetchResult = z.infer<typeof listingFetchResultSchema>;

export const listingSuggestRequestSchema = z.object({
  text: z
    .string()
    .transform((value) => value.replace(/\r\n?/g, "\n").trim())
    .pipe(
      z.string().min(PROJECT_LIMITS.minBrief, "too_short").max(PROJECT_LIMITS.brief, "too_long"),
    ),
});
export type ListingSuggestRequest = z.input<typeof listingSuggestRequestSchema>;

/** Field suggestions from a listing, already within the project limits. */
export const listingSuggestionsSchema = z.object({
  title: z.string(),
  company: z.string(),
  agency: z.string(),
  contact: z.string(),
  contactEmail: z.string(),
  tech: z.array(z.string()),
  required: z.array(z.string()),
  preferred: z.array(z.string()),
  terms: z.string(),
});
export type ListingSuggestions = z.infer<typeof listingSuggestionsSchema>;

export const listingJobSchema = z.object({
  id: z.string(),
  state: z.enum(["queued", "reading", "done", "failed"]),
  position: z.number().int().min(0),
  startedAt: z.string().datetime(),
  suggestions: listingSuggestionsSchema.nullable(),
  error: z.string().nullable(),
});
export type ListingJob = z.infer<typeof listingJobSchema>;

const clip = (value: unknown, max: number) =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";

const strings = (value: unknown) =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

/** Turns the model's JSON into suggestions within the project limits. Model output is untrusted. */
export function normaliseListing(raw: unknown): ListingSuggestions {
  const data = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const email = clip(data.contactEmail, PROJECT_LIMITS.contactEmail);
  return {
    title: clip(data.title, PROJECT_LIMITS.title),
    company: clip(data.company, PROJECT_LIMITS.company),
    agency: clip(data.agency, PROJECT_LIMITS.agency),
    contact: clip(data.contact, PROJECT_LIMITS.contact),
    contactEmail: z.string().email().safeParse(email).success ? email : "",
    tech: cleanList(strings(data.tech), PROJECT_LIMITS.tech, PROJECT_LIMITS.item),
    required: cleanList(strings(data.required), PROJECT_LIMITS.requirements, PROJECT_LIMITS.item),
    preferred: cleanList(strings(data.preferred), PROJECT_LIMITS.requirements, PROJECT_LIMITS.item),
    terms: clip(data.terms, PROJECT_LIMITS.terms),
  };
}

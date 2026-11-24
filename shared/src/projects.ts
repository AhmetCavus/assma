import { z } from "zod";
import { identifier } from "./account.js";
import { uniqueSkills } from "./experience.js";
import { cvDraftSchema, fitSchema } from "./fit.js";
import { storedAssessmentSchema } from "./assessment.js";

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
  /** Links saved at once with "quick add". */
  quickLinks: 20,
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
  /** Left out, the stored conditions are kept. */
  conditions: z.lazy(() => projectConditionsSchema).optional(),
});
export type ProjectInput = z.input<typeof projectInputSchema>;

// ---------------------------------------------------------------------------------------
// Working conditions, structured for Economic Fit. Null means the listing does not say.

export const CONTRACT_TYPES = ["freelance", "employment", "temporary"] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number];

export const COMPENSATION_UNITS = ["hour", "day", "month", "year"] as const;
export type CompensationUnit = (typeof COMPENSATION_UNITS)[number];

/** Ordered from none to most. */
export const TRAVEL_LEVELS = ["none", "occasional", "frequent"] as const;
export type TravelLevel = (typeof TRAVEL_LEVELS)[number];

export const projectConditionsSchema = z.object({
  compensation: z
    .object({
      amount: z.number().positive().max(10_000_000),
      unit: z.enum(COMPENSATION_UNITS),
      currency: z
        .string()
        .trim()
        .regex(/^[A-Z]{3}$/, "invalid_currency")
        .default("EUR"),
    })
    .nullable()
    .default(null),
  contract: z.enum(CONTRACT_TYPES).nullable().default(null),
  /** Share of remote work in percent. */
  remote: z.number().int().min(0).max(100).nullable().default(null),
  months: z.number().int().min(1).max(120).nullable().default(null),
  hoursPerWeek: z.number().min(1).max(80).nullable().default(null),
  /** "YYYY-MM-DD", or null when not stated or "asap". */
  start: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "invalid_date")
    .nullable()
    .default(null),
  onsite: z.string().trim().max(PROJECT_LIMITS.terms).default(""),
  travel: z.enum(TRAVEL_LEVELS).nullable().default(null),
});
export type ProjectConditions = z.infer<typeof projectConditionsSchema>;
export type ProjectConditionsInput = z.input<typeof projectConditionsSchema>;

export const UNKNOWN_CONDITIONS: ProjectConditions = projectConditionsSchema.parse({});

/** Whether nothing about the conditions is known yet. */
export function conditionsUnknown(conditions: ProjectConditions): boolean {
  return JSON.stringify(conditions) === JSON.stringify(UNKNOWN_CONDITIONS);
}

/**
 * Reads conditions the model suggested. It writes 0, -1 or "" for "not stated"; anything
 * implausible is treated as not stated too, so nothing unknown is ever made up.
 */
export function normaliseConditions(raw: unknown): ProjectConditions {
  const data = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const field = <T>(schema: z.ZodType<T>, value: unknown, fallback: T): T => {
    const parsed = schema.safeParse(value);
    return parsed.success ? parsed.data : fallback;
  };
  const positive = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
  const amount = positive(data.amount);
  const unit = field(z.enum(COMPENSATION_UNITS).nullable(), data.unit, null);
  const currency = typeof data.currency === "string" ? data.currency.trim().toUpperCase() : "";
  const remote =
    typeof data.remote === "number" && data.remote >= 0 && data.remote <= 100
      ? Math.round(data.remote)
      : null;
  const months = positive(data.months);
  const hours = positive(data.hoursPerWeek ?? data.hours);
  return {
    compensation:
      amount !== null && amount <= 10_000_000 && unit
        ? { amount, unit, currency: /^[A-Z]{3}$/.test(currency) ? currency : "EUR" }
        : null,
    contract: field(z.enum(CONTRACT_TYPES).nullable(), data.contract, null),
    remote,
    months: months !== null && months <= 120 ? Math.round(months) : null,
    hoursPerWeek: hours !== null && hours <= 80 ? hours : null,
    start: field(
      z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .refine((value) => !Number.isNaN(Date.parse(value))),
      data.start,
      null as string | null,
    ),
    onsite:
      typeof data.onsite === "string"
        ? data.onsite.replace(/\s+/g, " ").trim().slice(0, PROJECT_LIMITS.terms)
        : "",
    travel: field(z.enum(TRAVEL_LEVELS).nullable(), data.travel, null),
  };
}

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
  /** Structured working conditions; every field unknown until suggested or entered. */
  conditions: projectConditionsSchema.default({}),
  /** The multi-dimensional assessment, or null before the first one. */
  assessment: storedAssessmentSchema.default(null),
  status: projectStatusSchema,
  archived: z.boolean(),
  /** Saved with only its link via "quick add"; read and filled in later. */
  draft: z.boolean(),
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
// Quick add: links or listing text saved as drafts, read later.

/** The web links in pasted text, in order, without repeats or trailing punctuation. */
export function linksIn(text: string): string[] {
  const found = text.match(/https?:\/\/[^\s<>"'`]+/gi) ?? [];
  const links = found.map((link) => link.replace(/[).,;:!?\]}>»“”’]+$/u, ""));
  return [...new Set(links)];
}

/** A readable stand-in title until the listing is read: the site and the last path part. */
export function draftTitle(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./i, "");
    const last = parsed.pathname.split("/").filter(Boolean).pop() ?? "";
    let slug = last;
    try {
      slug = decodeURIComponent(last);
    } catch {
      // Keep the raw segment.
    }
    slug = slug
      .replace(/\.(html?|php|aspx?)$/i, "")
      .replace(/[-_+]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    // Bare ids say nothing; the site alone is clearer.
    const words = /[a-z]{3,}/i.test(slug) ? slug : "";
    return (words ? `${host} · ${words}` : host).slice(0, PROJECT_LIMITS.title);
  } catch {
    return url.slice(0, PROJECT_LIMITS.title);
  }
}

/** A stand-in title for pasted text: its first line, shortened. */
export function textDraftTitle(text: string): string {
  const line =
    text
      .split("\n")
      .map((part) =>
        part
          .replace(/https?:\/\/\S+/gi, "")
          .replace(/\s+/g, " ")
          .trim(),
      )
      .find((part) => /\p{L}{2,}/u.test(part)) ?? "";
  const max = 80;
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}

/**
 * What quick add makes of the input. Mostly links: each one becomes a draft that is loaded
 * later. Anything with real text around it is a listing: one draft whose text is read
 * directly, keeping its first link as the source.
 */
export type QuickInput =
  | { kind: "links"; urls: string[] }
  | { kind: "text"; text: string; url: string }
  | { kind: "empty" };

export function quickInputOf(input: string): QuickInput {
  const text = input.replace(/\r\n?/g, "\n").trim();
  const urls = linksIn(text);
  const rest = text
    .replace(/https?:\/\/[^\s<>"'`]+/gi, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  if (rest.length >= PROJECT_LIMITS.minBrief) {
    return { kind: "text", text, url: urls[0] ?? "" };
  }
  return urls.length > 0 ? { kind: "links", urls } : { kind: "empty" };
}

const briefText = z
  .string()
  .transform((value) => value.replace(/\r\n?/g, "\n").trim())
  .pipe(z.string().min(PROJECT_LIMITS.minBrief, "too_short").max(PROJECT_LIMITS.brief, "too_long"));

export const projectDraftRequestSchema = z.union([
  z.object({
    urls: z
      .array(sourceUrl.refine(Boolean, "invalid_url"))
      .min(1, "required")
      .max(PROJECT_LIMITS.quickLinks, "too_many_links")
      .transform((urls) => [...new Set(urls)]),
  }),
  z.object({
    /** A pasted listing, read later without loading anything. */
    text: briefText,
    /** Where it came from, when the text names it. */
    url: sourceUrl.default(""),
  }),
]);
export type ProjectDraftRequest = z.input<typeof projectDraftRequestSchema>;

export const projectDraftResultSchema = z.object({
  created: z.array(projectSchema),
  /** Links already saved as a project, so nothing is added twice. */
  existing: z.array(z.string()),
});
export type ProjectDraftResult = z.infer<typeof projectDraftResultSchema>;

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

export const listingSuggestRequestSchema = z.object({ text: briefText });
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
  conditions: projectConditionsSchema,
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
    conditions: normaliseConditions(data.conditions),
  };
}

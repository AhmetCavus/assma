import { z } from "zod";
import {
  EXPERIENCE_LIMITS,
  profileInputSchema,
  referenceInputSchema,
  uniqueSkills,
  yearMonthSchema,
  type ExperienceReference,
  type ReferenceInput,
  type YearMonth,
} from "./experience.js";

/**
 * Contracts for importing a CV. The browser extracts the text; the API asks the local model
 * for suggestions in a background job; the person reviews them and applies a selection.
 */

export const CV_IMPORT_LIMITS = {
  /** Long CVs are read in parts, so the limit is about time, not the model's context. */
  text: 100_000,
  /** One part stays well inside the model context: about 3,000–3,500 tokens. */
  partChars: 12_000,
  /** Repeated at the start of the next part, so a position cut at a boundary is seen whole. */
  overlapChars: 800,
  minText: 80,
  fileBytes: 10 * 1024 * 1024,
} as const;

export const cvImportRequestSchema = z.object({
  text: z
    .string()
    .transform((value) =>
      value
        .replace(/\r\n?/g, "\n")
        .replace(/[ \t]+\n/g, "\n")
        .trim(),
    )
    .pipe(
      z.string().min(CV_IMPORT_LIMITS.minText, "too_short").max(CV_IMPORT_LIMITS.text, "too_long"),
    ),
});
export type CvImportRequest = z.input<typeof cvImportRequestSchema>;

/** A reference as the model read it. Dates may be missing; the review completes them. */
export const referenceSuggestionSchema = z.object({
  organization: z.string(),
  role: z.string(),
  start: yearMonthSchema.nullable(),
  end: yearMonthSchema.nullable(),
  ongoing: z.boolean(),
  contribution: z.string(),
  skills: z.array(z.string()),
});
export type ReferenceSuggestion = z.infer<typeof referenceSuggestionSchema>;

export const cvSuggestionsSchema = z.object({
  profile: profileInputSchema.required(),
  references: z.array(referenceSuggestionSchema),
});
export type CvSuggestions = z.infer<typeof cvSuggestionsSchema>;

export const CV_IMPORT_STATES = ["queued", "reading", "done", "failed"] as const;

export const cvImportJobSchema = z.object({
  id: z.string(),
  state: z.enum(CV_IMPORT_STATES),
  /** Jobs ahead of this one while queued. */
  position: z.number().int().min(0),
  /** References recognised so far while reading. */
  found: z.number().int().min(0),
  /** The part being read (1-based) and how many parts the CV was split into. */
  part: z.number().int().min(0),
  parts: z.number().int().min(1),
  startedAt: z.string().datetime(),
  suggestions: cvSuggestionsSchema.nullable(),
  error: z.string().nullable(),
});
export type CvImportJob = z.infer<typeof cvImportJobSchema>;

export const cvImportStatusSchema = z.object({
  available: z.boolean(),
  model: z.string(),
});
export type CvImportStatus = z.infer<typeof cvImportStatusSchema>;

export const cvImportApplySchema = z.object({
  /** Only fields that are still empty in the saved profile are filled. */
  profile: profileInputSchema.nullable().default(null),
  references: z.array(referenceInputSchema).max(EXPERIENCE_LIMITS.references).default([]),
});
export type CvImportApply = z.input<typeof cvImportApplySchema>;

export const cvImportAppliedSchema = z.object({
  references: z.number().int().min(0),
  profileFields: z.array(z.string()),
});
export type CvImportApplied = z.infer<typeof cvImportAppliedSchema>;

// ---------------------------------------------------------------------------------------
// Normalising what the model returns. Everything here treats model output as untrusted.

const ONGOING =
  /^(present|current|now|today|ongoing|heute|aktuell|laufend|derzeit|jetzt|bis heute|seit)$/i;

/** Reads "2023-04", "04/2023", "4.2023", "April 2023" or "2023" as a month; null if unreadable. */
export function readMonth(value: string, edge: "start" | "end"): YearMonth | null {
  const text = value.trim().toLowerCase();
  const year = (digits: string) =>
    Number(digits) >= 1950 && Number(digits) <= 2099 ? digits : null;
  const pad = (month: number) => String(month).padStart(2, "0");
  let match = /^(\d{4})[-/.](\d{1,2})$/.exec(text);
  if (match && year(match[1]!) && Number(match[2]) >= 1 && Number(match[2]) <= 12) {
    return yearMonthSchema.parse(`${match[1]}-${pad(Number(match[2]))}`);
  }
  match = /^(\d{1,2})\s*[-/.]\s*(\d{4})$/.exec(text);
  if (match && year(match[2]!) && Number(match[1]) >= 1 && Number(match[1]) <= 12) {
    return yearMonthSchema.parse(`${match[2]}-${pad(Number(match[1]))}`);
  }
  match = /^([a-zäé]+)\.?\s+(\d{4})$/.exec(text);
  if (match && year(match[2]!)) {
    const month = MONTH_NAMES.findIndex((names) =>
      names.some((name) => match![1]!.startsWith(name)),
    );
    if (month >= 0) {
      return yearMonthSchema.parse(`${match[2]}-${pad(month + 1)}`);
    }
  }
  match = /^(\d{4})$/.exec(text);
  if (match && year(match[1]!)) {
    return yearMonthSchema.parse(`${match[1]}-${edge === "start" ? "01" : "12"}`);
  }
  return null;
}

const MONTH_NAMES = [
  ["jan"],
  ["feb"],
  ["mar", "mär", "maer"],
  ["apr"],
  ["may", "mai"],
  ["jun"],
  ["jul"],
  ["aug"],
  ["sep"],
  ["oct", "okt"],
  ["nov"],
  ["dec", "dez"],
];

const clip = (value: unknown, max: number) =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";

const rawReference = z
  .object({
    organization: z.unknown(),
    role: z.unknown(),
    start: z.unknown(),
    end: z.unknown(),
    contribution: z.unknown(),
    skills: z.unknown(),
  })
  .partial();

const rawSuggestions = z
  .object({
    profile: z
      .object({
        name: z.unknown(),
        headline: z.unknown(),
        location: z.unknown(),
        email: z.unknown(),
        summary: z.unknown(),
      })
      .partial()
      .default({}),
    references: z.array(z.unknown()).default([]),
  })
  .partial();

/** Turns the model's JSON into suggestions within assma's limits, dropping what is unusable. */
export function normaliseSuggestions(raw: unknown): CvSuggestions {
  const parsed = rawSuggestions.safeParse(raw);
  const data = parsed.success ? parsed.data : {};
  const profile = data.profile ?? {};
  const email = clip(profile.email, EXPERIENCE_LIMITS.email);
  const references: ReferenceSuggestion[] = [];
  for (const item of data.references ?? []) {
    const reference = rawReference.safeParse(item);
    if (!reference.success) {
      continue;
    }
    const value = reference.data;
    const organization = clip(value.organization, EXPERIENCE_LIMITS.organization);
    const role = clip(value.role, EXPERIENCE_LIMITS.role);
    if (!organization && !role) {
      continue;
    }
    const startText = clip(value.start, 40);
    const endText = clip(value.end, 40);
    const ongoing = ONGOING.test(endText);
    const skills = Array.isArray(value.skills)
      ? uniqueSkills(
          value.skills
            .filter((skill): skill is string => typeof skill === "string")
            .map((skill) => clip(skill, EXPERIENCE_LIMITS.skill)),
        ).slice(0, EXPERIENCE_LIMITS.skillsPerReference)
      : [];
    references.push({
      organization,
      role,
      start: readMonth(startText, "start"),
      end: ongoing ? null : readMonth(endText, "end"),
      ongoing,
      contribution:
        typeof value.contribution === "string"
          ? value.contribution.trim().slice(0, EXPERIENCE_LIMITS.contribution)
          : "",
      skills,
    });
    if (references.length >= EXPERIENCE_LIMITS.references) {
      break;
    }
  }
  return {
    profile: {
      name: clip(profile.name, EXPERIENCE_LIMITS.name),
      headline: clip(profile.headline, EXPERIENCE_LIMITS.headline),
      location: clip(profile.location, EXPERIENCE_LIMITS.location),
      email: profileInputSchema.shape.email.safeParse(email).success ? email : "",
      summary: clip(profile.summary, EXPERIENCE_LIMITS.summary),
    },
    references,
  };
}

/** The reference a suggestion would create, ready for `referenceInputSchema`. */
export function suggestionInput(suggestion: ReferenceSuggestion): ReferenceInput {
  return {
    organization: suggestion.organization,
    role: suggestion.role,
    start: suggestion.start ?? "",
    end: suggestion.ongoing ? null : (suggestion.end ?? ""),
    contribution: suggestion.contribution,
    skills: suggestion.skills,
  };
}

/** A suggestion matching an existing reference: same organization (ignoring case) and start. */
export function isKnownReference(
  suggestion: Pick<ReferenceSuggestion, "organization" | "start">,
  existing: readonly Pick<ExperienceReference, "organization" | "start">[],
): boolean {
  const key = (organization: string) => organization.trim().toLowerCase().replace(/\s+/g, " ");
  return existing.some(
    (reference) =>
      key(reference.organization) === key(suggestion.organization) &&
      (suggestion.start === null || reference.start === suggestion.start),
  );
}

// ---------------------------------------------------------------------------------------
// Long CVs: split into parts, read part by part, then merge.

/**
 * Splits a CV into parts of at most `max` characters, preferring blank lines, then line
 * breaks, then spaces as boundaries. Each later part starts with the last `overlap`
 * characters of the previous one (from a line start where possible).
 */
export function splitCvText(
  text: string,
  max: number = CV_IMPORT_LIMITS.partChars,
  overlap: number = CV_IMPORT_LIMITS.overlapChars,
): string[] {
  if (text.length <= max) {
    return [text];
  }
  const parts: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(text.length, start + max);
    if (end < text.length) {
      const window = text.slice(start + Math.floor(max / 2), end);
      const cut = [
        window.lastIndexOf("\n\n"),
        window.lastIndexOf("\n"),
        window.lastIndexOf(" "),
      ].find((index) => index >= 0);
      if (cut !== undefined) {
        end = start + Math.floor(max / 2) + cut + 1;
      }
    }
    parts.push(text.slice(start, end).trim());
    if (end >= text.length) {
      break;
    }
    let next = Math.max(end - overlap, start + 1);
    const lineStart = text.indexOf("\n", next);
    if (lineStart >= 0 && lineStart < end) {
      next = lineStart + 1;
    }
    start = next;
  }
  return parts.filter(Boolean);
}

const organizationKey = (value: string) =>
  value
    .toLowerCase()
    .replace(/\b(gmbh|ag|se|kg|ltd|inc|llc|co)\b\.?/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

function sameReference(a: ReferenceSuggestion, b: ReferenceSuggestion): boolean {
  if (organizationKey(a.organization) !== organizationKey(b.organization)) {
    return false;
  }
  if (a.start && b.start) {
    return a.start === b.start;
  }
  return a.role.trim().toLowerCase() === b.role.trim().toLowerCase();
}

/** Merges the suggestions of several parts; a position seen twice keeps the fuller details. */
export function mergeSuggestions(list: readonly CvSuggestions[]): CvSuggestions {
  const profile = { name: "", headline: "", location: "", email: "", summary: "" };
  const references: ReferenceSuggestion[] = [];
  for (const suggestions of list) {
    for (const field of Object.keys(profile) as (keyof typeof profile)[]) {
      profile[field] ||= suggestions.profile[field];
    }
    for (const reference of suggestions.references) {
      const index = references.findIndex((existing) => sameReference(existing, reference));
      if (index < 0) {
        if (references.length < EXPERIENCE_LIMITS.references) {
          references.push(reference);
        }
        continue;
      }
      const existing = references[index]!;
      references[index] = {
        organization: existing.organization || reference.organization,
        role: existing.role || reference.role,
        start: existing.start ?? reference.start,
        end: existing.end ?? reference.end,
        ongoing: existing.ongoing || reference.ongoing,
        contribution:
          reference.contribution.length > existing.contribution.length
            ? reference.contribution
            : existing.contribution,
        skills: uniqueSkills([...existing.skills, ...reference.skills]).slice(
          0,
          EXPERIENCE_LIMITS.skillsPerReference,
        ),
      };
    }
  }
  return { profile, references };
}

/**
 * Rough duration range on the shared CPU, in seconds. Measured: about 55 tokens/s reading
 * (about four characters per token) and 10–12 seconds of writing per position. The range
 * covers one position per 2,500 characters (long descriptions) to one per 900 (short ones).
 */
export function estimateCvSeconds(characters: number): { min: number; max: number } {
  const parts = Math.max(1, Math.ceil(characters / CV_IMPORT_LIMITS.partChars));
  const fixed = characters / 4 / 55 + parts * 15;
  return {
    min: Math.round(fixed + (characters / 2500) * 11),
    max: Math.round(fixed + (characters / 900) * 11),
  };
}

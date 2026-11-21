import { z } from "zod";
import {
  EXPERIENCE_LIMITS,
  profileInputSchema,
  referenceInputSchema,
  uniqueSkills,
  yearMonthSchema,
  type Certificate,
  type Education,
  type Language,
  type LanguageLevel,
  LANGUAGE_LEVELS,
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
        phone: z.unknown(),
        address: z.unknown(),
        website: z.unknown(),
        summary: z.unknown(),
        certificates: z.unknown(),
        languages: z.unknown(),
        education: z.unknown(),
        hobbies: z.unknown(),
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
      phone: valid(profileInputSchema.shape.phone, clip(profile.phone, EXPERIENCE_LIMITS.phone)),
      address: clip(profile.address, EXPERIENCE_LIMITS.address),
      website: valid(
        profileInputSchema.shape.website,
        clip(profile.website, EXPERIENCE_LIMITS.website),
      ),
      summary: clip(profile.summary, EXPERIENCE_LIMITS.summary),
      certificates: readCertificates(profile.certificates),
      languages: readLanguages(profile.languages),
      education: readEducation(profile.education),
      hobbies: Array.isArray(profile.hobbies)
        ? uniqueSkills(
            profile.hobbies
              .filter((hobby): hobby is string => typeof hobby === "string")
              .map((hobby) => clip(hobby, EXPERIENCE_LIMITS.hobby)),
          ).slice(0, EXPERIENCE_LIMITS.hobbies)
        : [],
    },
    references,
  };
}

/** The value if the schema accepts it as it is, otherwise "". */
function valid(schema: z.ZodTypeAny, value: string): string {
  const result = schema.safeParse(value);
  return result.success && typeof result.data === "string" ? result.data : "";
}

/** Maps how CVs write language levels onto CEFR; a level in the text wins. */
export function readLanguageLevel(value: string): LanguageLevel {
  const text = value.toLowerCase();
  const cefr = /\b([abc][12])\b/.exec(text)?.[1]?.toUpperCase();
  if (cefr && (LANGUAGE_LEVELS as readonly string[]).includes(cefr)) {
    return cefr as LanguageLevel;
  }
  if (/mutter|native|erstsprache|first language|bilingual|zweisprachig/.test(text)) {
    return "native";
  }
  if (
    /verhandlungssicher|business|fluent|fließend|fliessend|sehr gut|excellent|proficient/.test(text)
  ) {
    return "C1";
  }
  if (/\bgut\b|good|intermediate|konversation/.test(text)) {
    return "B1";
  }
  if (/grund|basic|elementar|elementary|beginner|anfänger/.test(text)) {
    return "A2";
  }
  return "B2";
}

function readLanguages(value: unknown): Language[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const languages: Language[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const record = (typeof item === "string" ? { name: item } : item) as Record<
      string,
      unknown
    > | null;
    let name = clip(record?.name, EXPERIENCE_LIMITS.language);
    let levelText = clip(record?.level, 60);
    // "Englisch (C1)" in one string.
    const inline = /^(.+?)\s*[(:–-]\s*([^)]+)\)?$/.exec(name);
    if (inline && !levelText) {
      name = inline[1]!.trim();
      levelText = inline[2]!.trim();
    }
    const key = name.toLowerCase();
    if (!name || seen.has(key)) {
      continue;
    }
    seen.add(key);
    languages.push({ name, level: readLanguageLevel(levelText) });
    if (languages.length >= EXPERIENCE_LIMITS.languages) {
      break;
    }
  }
  return languages;
}

function readEducation(value: unknown): Education[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const entries: Education[] = [];
  const seen = new Set<string>();
  const yearOf = (raw: unknown) => /(19[5-9]\d|20\d\d)/.exec(clip(raw, 40))?.[1] ?? "";
  for (const item of value) {
    const record = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const degree = clip(record.degree, EXPERIENCE_LIMITS.degree);
    const institution = clip(record.institution, EXPERIENCE_LIMITS.institution);
    const key = `${degree}|${institution}`.toLowerCase();
    if (!degree || seen.has(key)) {
      continue;
    }
    seen.add(key);
    let start = yearOf(record.start);
    let end = yearOf(record.end);
    if (start && end && end < start) {
      [start, end] = [end, start];
    }
    entries.push({
      degree,
      institution,
      start,
      end,
      note: clip(record.note, EXPERIENCE_LIMITS.educationNote),
    });
    if (entries.length >= EXPERIENCE_LIMITS.education) {
      break;
    }
  }
  return entries;
}

function readCertificates(value: unknown): Certificate[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const certificates: Certificate[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const record = (typeof item === "string" ? { name: item } : item) as Record<
      string,
      unknown
    > | null;
    const name = clip(record?.name, EXPERIENCE_LIMITS.certificate);
    const key = name.toLowerCase();
    if (!name || seen.has(key)) {
      continue;
    }
    seen.add(key);
    const year = clip(record?.year, 4);
    certificates.push({
      name,
      issuer: clip(record?.issuer, EXPERIENCE_LIMITS.certificate),
      year: /^(19[5-9]\d|20\d\d)$/.test(year) ? year : "",
    });
    if (certificates.length >= EXPERIENCE_LIMITS.certificates) {
      break;
    }
  }
  return certificates;
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
const TEXT_FIELDS = [
  "name",
  "headline",
  "location",
  "email",
  "phone",
  "address",
  "website",
  "summary",
] as const;

export function mergeSuggestions(list: readonly CvSuggestions[]): CvSuggestions {
  const profile: CvSuggestions["profile"] = {
    name: "",
    headline: "",
    location: "",
    email: "",
    phone: "",
    address: "",
    website: "",
    summary: "",
    certificates: [],
    languages: [],
    education: [],
    hobbies: [],
  };
  for (const suggestions of list) {
    for (const field of TEXT_FIELDS) {
      profile[field] ||= suggestions.profile[field];
    }
    profile.certificates = readCertificates([
      ...profile.certificates,
      ...suggestions.profile.certificates,
    ]);
    profile.languages = readLanguages([...profile.languages, ...suggestions.profile.languages]);
    profile.education = readEducation([...profile.education, ...suggestions.profile.education]);
    profile.hobbies = uniqueSkills([...profile.hobbies, ...suggestions.profile.hobbies]).slice(
      0,
      EXPERIENCE_LIMITS.hobbies,
    );
  }
  const references: ReferenceSuggestion[] = [];
  for (const suggestions of list) {
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

const isEmpty = (value: unknown) =>
  value === undefined ||
  value === null ||
  value === "" ||
  (Array.isArray(value) && value.length === 0);

/**
 * The profile fields an import would fill: those the CV states and the saved profile still
 * leaves empty. With no saved profile, everything the CV states.
 */
export function profileFill(
  saved: Partial<Record<keyof CvSuggestions["profile"], unknown>> | null,
  incoming: CvSuggestions["profile"],
): Partial<CvSuggestions["profile"]> {
  return Object.fromEntries(
    Object.entries(incoming).filter(
      ([field, value]) =>
        !isEmpty(value) && (saved === null || isEmpty(saved[field as keyof typeof incoming])),
    ),
  ) as Partial<CvSuggestions["profile"]>;
}

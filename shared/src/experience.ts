import { z } from "zod";
import { identifier } from "./account.js";

/**
 * Contracts for the Experience page: the freelancer's personal details and the project
 * references assma later matches against listings and selects for a CV.
 */

export const EXPERIENCE_LIMITS = {
  name: 80,
  headline: 80,
  location: 80,
  email: 254,
  summary: 800,
  phone: 40,
  address: 200,
  website: 200,
  certificate: 120,
  certificates: 30,
  hobby: 60,
  hobbies: 20,
  images: 6,
  language: 60,
  languages: 12,
  degree: 120,
  institution: 120,
  educationNote: 200,
  education: 12,
  /** A square JPEG, resized in the browser; base64 makes it about a third larger. */
  imageBytes: 600 * 1024,
  organization: 120,
  role: 120,
  contribution: 1500,
  skill: 40,
  skillsPerReference: 20,
  references: 100,
} as const;

const text = (max: number) => z.string().trim().max(max);
const required = (max: number) => text(max).min(1, "required");

/** A calendar month, "YYYY-MM". References need no finer dates. */
export const yearMonthSchema = z
  .string()
  .regex(/^(19[5-9]\d|20\d\d)-(0[1-9]|1[0-2])$/, "invalid_month");
export type YearMonth = z.infer<typeof yearMonthSchema>;

export const certificateSchema = z.object({
  name: required(EXPERIENCE_LIMITS.certificate),
  issuer: text(EXPERIENCE_LIMITS.certificate).default(""),
  /** Year obtained, or "" when unknown. */
  year: z
    .union([z.literal(""), z.string().regex(/^(19[5-9]\d|20\d\d)$/, "invalid_year")])
    .default(""),
});
export type Certificate = z.infer<typeof certificateSchema>;

/** From native speaker down to beginner, in CV order. */
export const LANGUAGE_LEVELS = ["native", "C2", "C1", "B2", "B1", "A2", "A1"] as const;
export const languageLevelSchema = z.enum(LANGUAGE_LEVELS);
export type LanguageLevel = z.infer<typeof languageLevelSchema>;

export const languageSchema = z.object({
  name: required(EXPERIENCE_LIMITS.language),
  level: languageLevelSchema.default("B2"),
});
export type Language = z.infer<typeof languageSchema>;

const year = z.union([z.literal(""), z.string().regex(/^(19[5-9]\d|20\d\d)$/, "invalid_year")]);

export const educationSchema = z
  .object({
    degree: required(EXPERIENCE_LIMITS.degree),
    institution: text(EXPERIENCE_LIMITS.institution).default(""),
    start: year.default(""),
    /** "" while ongoing or unknown. */
    end: year.default(""),
    note: text(EXPERIENCE_LIMITS.educationNote).default(""),
  })
  .refine((entry) => !entry.start || !entry.end || entry.end >= entry.start, {
    message: "end_before_start",
    path: ["end"],
  });
export type Education = z.infer<typeof educationSchema>;

/** Newest first: by end year (ongoing first), then start year. */
export function sortEducation<T extends Pick<Education, "start" | "end">>(
  entries: readonly T[],
): T[] {
  return [...entries].sort(
    (a, b) => (b.end || "9999").localeCompare(a.end || "9999") || b.start.localeCompare(a.start),
  );
}

const website = z.union([
  z.literal(""),
  z
    .string()
    .trim()
    .max(EXPERIENCE_LIMITS.website)
    .transform((value) => (/^https?:\/\//i.test(value) ? value : `https://${value}`))
    .pipe(z.string().url("invalid_url")),
]);

export const profileInputSchema = z.object({
  name: text(EXPERIENCE_LIMITS.name).default(""),
  headline: text(EXPERIENCE_LIMITS.headline).default(""),
  location: text(EXPERIENCE_LIMITS.location).default(""),
  email: z.union([z.literal(""), z.string().trim().email("invalid_email").max(254)]).default(""),
  phone: z
    .string()
    .trim()
    .max(EXPERIENCE_LIMITS.phone)
    .regex(/^[+\d][\d\s()/.-]*$|^$/, "invalid_phone")
    .default(""),
  /** Postal address, one or two lines. */
  address: z.string().trim().max(EXPERIENCE_LIMITS.address).default(""),
  website: website.default(""),
  summary: text(EXPERIENCE_LIMITS.summary).default(""),
  certificates: z.array(certificateSchema).max(EXPERIENCE_LIMITS.certificates).default([]),
  languages: z.array(languageSchema).max(EXPERIENCE_LIMITS.languages).default([]),
  education: z.array(educationSchema).max(EXPERIENCE_LIMITS.education).default([]),
  hobbies: z
    .array(z.string().max(EXPERIENCE_LIMITS.hobby))
    .max(EXPERIENCE_LIMITS.hobbies * 2)
    .default([])
    .transform((items) => uniqueSkills(items).slice(0, EXPERIENCE_LIMITS.hobbies)),
});
export type ProfileInput = z.input<typeof profileInputSchema>;

export const experienceProfileSchema = profileInputSchema.extend({
  /** Null until the freelancer saves the details for the first time. */
  updatedAt: z.string().datetime().nullable(),
});
export type ExperienceProfile = z.infer<typeof experienceProfileSchema>;

/** Trims, drops empty entries and keeps the first spelling of each skill (case-insensitive). */
export function uniqueSkills(skills: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of skills) {
    const skill = raw.trim().replace(/\s+/g, " ");
    const key = skill.toLowerCase();
    if (skill && !seen.has(key)) {
      seen.add(key);
      result.push(skill);
    }
  }
  return result;
}

/** Splits the comma or middle-dot separated skills a person types into one field. */
export function parseSkills(value: string): string[] {
  return uniqueSkills(value.split(/[,;·\n]/));
}

export const referenceInputSchema = z
  .object({
    organization: required(EXPERIENCE_LIMITS.organization),
    role: required(EXPERIENCE_LIMITS.role),
    start: yearMonthSchema,
    /** Null while the engagement is ongoing. */
    end: yearMonthSchema.nullable().default(null),
    contribution: required(EXPERIENCE_LIMITS.contribution),
    skills: z
      .array(z.string().max(EXPERIENCE_LIMITS.skill))
      .max(EXPERIENCE_LIMITS.skillsPerReference * 2)
      .default([])
      .transform(uniqueSkills)
      .refine((skills) => skills.length <= EXPERIENCE_LIMITS.skillsPerReference, "too_many"),
  })
  .refine((reference) => reference.end === null || reference.end >= reference.start, {
    message: "end_before_start",
    path: ["end"],
  });
export type ReferenceInput = z.input<typeof referenceInputSchema>;

export const experienceReferenceSchema = z.object({
  id: identifier,
  organization: z.string(),
  role: z.string(),
  start: yearMonthSchema,
  end: yearMonthSchema.nullable(),
  contribution: z.string(),
  skills: z.array(z.string()),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ExperienceReference = z.infer<typeof experienceReferenceSchema>;

export const profileImageSchema = z.object({
  id: identifier,
  /** "data:image/jpeg;base64,…", ready for an <img> and for the PDF. */
  dataUrl: z.string().startsWith("data:image/jpeg;base64,"),
  createdAt: z.string().datetime(),
});
export type ProfileImage = z.infer<typeof profileImageSchema>;

export const profileImageUploadSchema = z.object({
  data: z
    .string()
    .regex(/^[A-Za-z0-9+/]+={0,2}$/, "invalid_image")
    .max(Math.ceil((EXPERIENCE_LIMITS.imageBytes * 4) / 3) + 4, "too_large"),
});
export type ProfileImageUpload = z.infer<typeof profileImageUploadSchema>;

export const experienceSchema = z.object({
  profile: experienceProfileSchema,
  references: z.array(experienceReferenceSchema),
  images: z.array(profileImageSchema),
});
export type Experience = z.infer<typeof experienceSchema>;

/** Most recent first: ongoing engagements, then by end month, then by start month. */
export function sortReferences<T extends Pick<ExperienceReference, "start" | "end">>(
  references: readonly T[],
): T[] {
  return [...references].sort((a, b) => {
    const endA = a.end ?? "9999-99";
    const endB = b.end ?? "9999-99";
    if (endA !== endB) {
      return endA < endB ? 1 : -1;
    }
    return a.start < b.start ? 1 : a.start > b.start ? -1 : 0;
  });
}

/** The short label shown next to a reference, E01, E02, … in display order. */
export function referenceLabel(index: number): string {
  return `E${String(index + 1).padStart(2, "0")}`;
}

/** "2023–2025", "03/2023–today" style period; whole years when both ends are January–December. */
export function formatPeriod(
  start: YearMonth,
  end: YearMonth | null,
  locale: string,
  ongoing: string,
): string {
  const month = (value: YearMonth) =>
    new Intl.DateTimeFormat(locale, { month: "2-digit", year: "numeric", timeZone: "UTC" }).format(
      new Date(`${value}-01T00:00:00Z`),
    );
  const startYear = start.slice(0, 4);
  const startMonth = start.slice(5);
  if (end === null) {
    return `${month(start)}–${ongoing}`;
  }
  const endYear = end.slice(0, 4);
  const endMonth = end.slice(5);
  if (startMonth === "01" && endMonth === "12") {
    return startYear === endYear ? startYear : `${startYear}–${endYear}`;
  }
  return start === end ? month(start) : `${month(start)}–${month(end)}`;
}

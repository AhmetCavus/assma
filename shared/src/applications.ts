import { z } from "zod";
import { identifier } from "./account.js";
import { CV_LANGUAGES, cvDesignSchema } from "./cvDesign.js";
import { experienceProfileSchema, experienceReferenceSchema } from "./experience.js";
import { cvDraftSchema, fitSchema } from "./fit.js";
import { projectStatusSchema, type ProjectStatus } from "./projects.js";

/**
 * Contracts for applications. An application is recorded when the person confirms that an
 * email went out or records a portal submission. At that moment assma freezes the listing,
 * the fit, the profile, the references and the CV wording, and keeps the exact PDF that was
 * attached. Later edits change future drafts only. Notes, replies and follow-ups belong to
 * the existing application.
 */

export const APPLICATION_LIMITS = {
  subject: 300,
  message: 10_000,
  portal: 300,
  portalNote: 2000,
  eventText: 4000,
  events: 200,
  followUpNote: 300,
  /** The CV PDF embeds its font, so a few hundred kilobytes is normal. */
  fileBytes: 3 * 1024 * 1024,
  fileName: 120,
  applications: 2000,
} as const;

export const APPLICATION_CHANNELS = ["email", "portal"] as const;
export const applicationChannelSchema = z.enum(APPLICATION_CHANNELS);
export type ApplicationChannel = z.infer<typeof applicationChannelSchema>;

/** Statuses after an application: the project's own status, changed from the application. */
export const OPEN_STATUSES: readonly ProjectStatus[] = ["applied", "review", "interview"];

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "invalid_date");
export type Day = string;

export const emailDetailsSchema = z.object({
  to: z.string().trim().email("invalid_email").max(254),
  subject: z.string().trim().min(1, "required").max(APPLICATION_LIMITS.subject),
  message: z.string().trim().min(1, "required").max(APPLICATION_LIMITS.message),
});
export type EmailDetails = z.infer<typeof emailDetailsSchema>;

export const portalDetailsSchema = z.object({
  /** The portal's name or address. */
  portal: z.string().trim().max(APPLICATION_LIMITS.portal).default(""),
  /** False records explicitly that no CV was uploaded. */
  cvUploaded: z.boolean(),
  note: z.string().trim().max(APPLICATION_LIMITS.portalNote).default(""),
});
export type PortalDetails = z.infer<typeof portalDetailsSchema>;

/** The CV as it was chosen for this application, with every choice resolved. */
export const cvChoiceSchema = cvDraftSchema.extend({
  language: z.enum(CV_LANGUAGES),
  skills: z.array(z.string().trim().min(1).max(40)).max(24),
});
export type CvChoice = z.infer<typeof cvChoiceSchema>;

const base64 = z
  .string()
  .regex(/^[A-Za-z0-9+/]+={0,2}$/, "invalid_file")
  .max(Math.ceil((APPLICATION_LIMITS.fileBytes * 4) / 3) + 4, "too_large");

export const applicationInputSchema = z
  .object({
    projectId: identifier,
    channel: applicationChannelSchema,
    /** When it was sent or submitted; a portal submission may be recorded afterwards. */
    submittedAt: z.string().datetime(),
    email: emailDetailsSchema.nullable().default(null),
    portal: portalDetailsSchema.nullable().default(null),
    cv: cvChoiceSchema,
    /** The exact PDF that was attached or uploaded, base64; null when no CV was sent. */
    file: base64.nullable().default(null),
    fileName: z.string().trim().max(APPLICATION_LIMITS.fileName).default(""),
  })
  .superRefine((input, context) => {
    if (input.channel === "email" && !input.email) {
      context.addIssue({ code: "custom", path: ["email"], message: "required" });
    }
    if (input.channel === "portal" && !input.portal) {
      context.addIssue({ code: "custom", path: ["portal"], message: "required" });
    }
    const cvSent = input.channel === "email" || Boolean(input.portal?.cvUploaded);
    if (cvSent && !input.file) {
      context.addIssue({ code: "custom", path: ["file"], message: "required" });
    }
    if (!cvSent && input.file) {
      context.addIssue({ code: "custom", path: ["file"], message: "unexpected" });
    }
  });
export type ApplicationInput = z.input<typeof applicationInputSchema>;

/** Everything that went into the application, frozen at submission. */
export const snapshotSchema = z.object({
  project: z.object({
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
  }),
  fit: fitSchema.nullable(),
  profile: experienceProfileSchema,
  /** The references on the CV, in CV order. */
  references: z.array(experienceReferenceSchema),
  /** Every reference at the time, for the years in the skill matrix. */
  allReferences: z.array(experienceReferenceSchema),
  cv: z.object({
    summary: z.string(),
    skills: z.array(z.string()),
    language: z.enum(CV_LANGUAGES),
    design: cvDesignSchema,
    /** The photo as a data URL, or null for none. */
    photo: z.string().nullable(),
  }),
});
export type Snapshot = z.infer<typeof snapshotSchema>;

export const EVENT_KINDS = ["note", "reply", "status", "followUp"] as const;
export const eventKindSchema = z.enum(EVENT_KINDS);
export type EventKind = z.infer<typeof eventKindSchema>;

export const applicationEventSchema = z.object({
  id: z.string().uuid(),
  kind: eventKindSchema,
  at: z.string().datetime(),
  text: z.string(),
  /** For a status change: the new status. */
  status: projectStatusSchema.nullable(),
  /** For a follow-up: the planned day, or null when it was cleared. */
  followUpAt: day.nullable(),
});
export type ApplicationEvent = z.infer<typeof applicationEventSchema>;

export const applicationFileSchema = z.object({ name: z.string(), size: z.number().int() });

export const applicationSchema = z.object({
  id: identifier,
  projectId: identifier,
  channel: applicationChannelSchema,
  submittedAt: z.string().datetime(),
  email: emailDetailsSchema.nullable(),
  portal: portalDetailsSchema.nullable(),
  file: applicationFileSchema.nullable(),
  snapshot: snapshotSchema,
  followUpAt: day.nullable(),
  followUpNote: z.string(),
  events: z.array(applicationEventSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Application = z.infer<typeof applicationSchema>;

/** One row of a list: what Dashboard and the project page need, without the snapshot. */
export const applicationSummarySchema = z.object({
  id: identifier,
  projectId: identifier,
  title: z.string(),
  company: z.string(),
  agency: z.string(),
  contact: z.string(),
  channel: applicationChannelSchema,
  submittedAt: z.string().datetime(),
  /** The project's current status; null when the project was deleted. */
  status: projectStatusSchema.nullable(),
  archived: z.boolean(),
  followUpAt: day.nullable(),
  followUpNote: z.string(),
  hasFile: z.boolean(),
  /** The latest note, reply, status change or follow-up, if any. */
  lastEvent: applicationEventSchema.nullable(),
});
export type ApplicationSummary = z.infer<typeof applicationSummarySchema>;

export const applicationChangeSchema = z
  .object({
    status: projectStatusSchema,
    followUpAt: day.nullable(),
    followUpNote: z.string().trim().max(APPLICATION_LIMITS.followUpNote),
  })
  .partial()
  .refine(
    (change) =>
      change.status !== undefined ||
      change.followUpAt !== undefined ||
      change.followUpNote !== undefined,
    "empty",
  );
export type ApplicationChange = z.input<typeof applicationChangeSchema>;

export const eventInputSchema = z.object({
  kind: z.enum(["note", "reply"]),
  text: z.string().trim().min(1, "required").max(APPLICATION_LIMITS.eventText),
  at: z.string().datetime(),
});
export type EventInput = z.input<typeof eventInputSchema>;

export const applicationFileContentSchema = z.object({ name: z.string(), data: z.string() });

/** A local calendar day as "YYYY-MM-DD". */
export function dayOf(date: Date): Day {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Whole days from `from` to `to`; negative when `to` lies before `from`. */
export function daysBetween(from: Day, to: Day): number {
  const time = (value: Day) =>
    Date.UTC(+value.slice(0, 4), +value.slice(5, 7) - 1, +value.slice(8));
  return Math.round((time(to) - time(from)) / 86_400_000);
}

export const isOpen = (status: ProjectStatus | null) =>
  status !== null && OPEN_STATUSES.includes(status);

/** Follow-ups of open applications that are due today or earlier, oldest first. */
export function dueFollowUps<T extends Pick<ApplicationSummary, "followUpAt" | "status">>(
  applications: readonly T[],
  today: Day,
): T[] {
  return applications
    .filter((item) => item.followUpAt !== null && item.followUpAt <= today && isOpen(item.status))
    .sort((a, b) => (a.followUpAt! < b.followUpAt! ? -1 : a.followUpAt! > b.followUpAt! ? 1 : 0));
}

/** Follow-ups of open applications within the next `days` days, soonest first. */
export function upcomingFollowUps<T extends Pick<ApplicationSummary, "followUpAt" | "status">>(
  applications: readonly T[],
  today: Day,
  days = 14,
): T[] {
  return applications
    .filter(
      (item) =>
        item.followUpAt !== null &&
        item.followUpAt > today &&
        daysBetween(today, item.followUpAt) <= days &&
        isOpen(item.status),
    )
    .sort((a, b) => (a.followUpAt! < b.followUpAt! ? -1 : a.followUpAt! > b.followUpAt! ? 1 : 0));
}

/** Checks that bytes look like a complete PDF file. */
export function looksLikePdf(bytes: Uint8Array): boolean {
  const head = String.fromCharCode(...bytes.slice(0, 5));
  const tail = String.fromCharCode(...bytes.slice(Math.max(0, bytes.length - 1024)));
  return head === "%PDF-" && tail.includes("%%EOF");
}

type DraftCopy = {
  subject: (title: string) => string;
  greeting: (contact: string) => string;
  opening: (title: string, company: string) => string;
  strengths: (items: string) => string;
  attached: string;
  closing: string;
};

/**
 * A first email in the CV's language: greeting, the listing, up to four confirmed
 * requirements as strengths, and a signature from the profile.
 */
export function applicationEmail(
  project: { title: string; company: string; contact: string; contactEmail: string },
  profile: { name: string; phone: string; email: string; website: string },
  confirmed: readonly string[],
  copy: DraftCopy,
): { to: string; subject: string; message: string } {
  const strengths = confirmed.slice(0, 4);
  const signature = [
    profile.name,
    profile.phone,
    profile.email,
    profile.website.replace(/^https?:\/\//, "").replace(/\/$/, ""),
  ].filter(Boolean);
  const message = [
    copy.greeting(project.contact),
    "",
    copy.opening(project.title, project.company),
    ...(strengths.length > 0 ? ["", copy.strengths(strengths.join(", "))] : []),
    "",
    copy.attached,
    "",
    copy.closing,
    ...signature,
  ].join("\n");
  return { to: project.contactEmail, subject: copy.subject(project.title), message };
}

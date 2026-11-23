import { z } from "zod";
import { identifier } from "./account.js";
import { APPLICATION_LIMITS } from "./applications.js";
import { CV_LANGUAGES } from "./cvDesign.js";
import { FIT_LIMITS } from "./fit.js";

/**
 * The assma assistant: one helper above every signed-in page, spoken to or typed to. It knows
 * which page is open and offers that page's services: revising the application email, the
 * CV summary, running the fit check, noting what happened with an application, or opening
 * another page. The model only proposes; the page carries the action out through the normal
 * API, so every action keeps its usual checks.
 */

export const ASSISTANT_LIMITS = {
  message: 1000,
  history: 8,
  historyText: 1500,
  reply: 1500,
} as const;

/** What is on screen, derived from the address. */
export const ASSISTANT_PAGES = [
  "dashboard",
  "projects",
  "new_project",
  "project",
  "edit",
  "cv",
  "apply",
  "application",
  "experience",
  "import",
] as const;
export type AssistantPage = (typeof ASSISTANT_PAGES)[number];

export const assistantViewSchema = z.object({
  page: z.enum(ASSISTANT_PAGES),
  projectId: identifier.nullable().default(null),
  applicationId: identifier.nullable().default(null),
});
export type AssistantView = z.input<typeof assistantViewSchema>;

/** Services a page can offer; the page that is open decides which ones exist. */
export const ASSISTANT_SERVICES = [
  "revise_email",
  "revise_summary",
  "assess_fit",
  "add_note",
] as const;
export type AssistantService = (typeof ASSISTANT_SERVICES)[number];

/** Pages the assistant may open. Project pages need a project in view. */
export const NAVIGATION_TARGETS = [
  "dashboard",
  "projects",
  "new_project",
  "experience",
  "import",
  "project",
  "project_cv",
  "project_apply",
] as const;
export type NavigationTarget = (typeof NAVIGATION_TARGETS)[number];

/** Unsaved text on the page that a service works on. */
export const assistantContextSchema = z.object({
  email: z
    .object({
      subject: z.string().max(APPLICATION_LIMITS.subject),
      message: z.string().max(APPLICATION_LIMITS.message),
    })
    .nullable()
    .default(null),
  summary: z.string().max(FIT_LIMITS.summary).nullable().default(null),
  /** The CV's language; email and summary are written in it. */
  cvLanguage: z.enum(CV_LANGUAGES).nullable().default(null),
});
export type AssistantContext = z.input<typeof assistantContextSchema>;

export const assistantTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(ASSISTANT_LIMITS.historyText),
});
export type AssistantTurn = z.infer<typeof assistantTurnSchema>;

export const assistantRequestSchema = z.object({
  message: z.string().trim().min(1, "required").max(ASSISTANT_LIMITS.message),
  locale: z.enum(CV_LANGUAGES).default("de"),
  /** Spoken: the answer should be short enough to listen to. */
  voice: z.boolean().default(false),
  view: assistantViewSchema,
  services: z
    .array(z.enum(ASSISTANT_SERVICES))
    .max(ASSISTANT_SERVICES.length)
    .default([])
    .transform((list) => [...new Set(list)]),
  context: assistantContextSchema.default({}),
  /** This conversation so far, oldest first. */
  history: z.array(assistantTurnSchema).max(ASSISTANT_LIMITS.history).default([]),
});
export type AssistantRequest = z.infer<typeof assistantRequestSchema>;
export type AssistantInput = z.input<typeof assistantRequestSchema>;

export const assistantActionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none") }),
  z.object({ kind: z.literal("navigate"), target: z.enum(NAVIGATION_TARGETS) }),
  z.object({
    kind: z.literal("revise_email"),
    subject: z.string(),
    message: z.string(),
    unexpected: z.array(z.string()),
  }),
  z.object({
    kind: z.literal("revise_summary"),
    summary: z.string(),
    unexpected: z.array(z.string()),
  }),
  z.object({ kind: z.literal("assess_fit") }),
  z.object({ kind: z.literal("add_note"), text: z.string() }),
]);
export type AssistantAction = z.infer<typeof assistantActionSchema>;

export const assistantAnswerSchema = z.object({
  reply: z.string(),
  action: assistantActionSchema,
});
export type AssistantAnswer = z.infer<typeof assistantAnswerSchema>;

export const assistantJobSchema = z.object({
  id: z.string(),
  state: z.enum(["queued", "reading", "done", "failed"]),
  position: z.number().int().min(0),
  startedAt: z.string().datetime(),
  /** The reply as far as the model has written it. */
  partial: z.string(),
  answer: assistantAnswerSchema.nullable(),
  error: z.string().nullable(),
});
export type AssistantJob = z.infer<typeof assistantJobSchema>;

const LINK = /\b(?:https?:\/\/|www\.)[^\s<>"')\]]+/gi;
/**
 * A bare lowercase domain: with a path ("evil.example/cv") or ending in a common top-level
 * domain. Lowercase only, so technology names such as "ASP.NET" are not taken for links.
 */
const BARE =
  /\b[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:(?!js\/)[a-z]{2,}\/[^\s<>"')\]]*|(?:com|de|net|org|io|dev|app|eu|info|me|co|ai|biz|ch|at|uk|example)\b)/g;
const ADDRESS = /[^\s@<>"'(),;:]+@[^\s@<>"'(),;:]+\.[a-z]{2,}/gi;
/** Starts with + or 0 like German and international numbers, so years and ranges are not. */
const PHONE = /(?<![\w.])(?:\+|0)[\d ()/.-]{6,}\d/g;
const DATE = /^\d{1,2}\.\d{1,2}\.\d{2,4}$/;

const canonical = (value: string) =>
  value
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[.,;:!?]+$/, "")
    .replace(/\/$/, "");
const digits = (value: string) => value.replace(/\D/g, "");
const isPhone = (value: string) => /^\+?[\d ()/.-]+$/.test(value);

/** Links, addresses and phone numbers in a text, as written. */
export function contactsIn(text: string): string[] {
  const addresses = text.match(ADDRESS) ?? [];
  let rest = text.replace(ADDRESS, " ");
  const links = rest.match(LINK) ?? [];
  rest = rest.replace(LINK, " ");
  const bare = rest.match(BARE) ?? [];
  rest = rest.replace(BARE, " ");
  const phones = (rest.match(PHONE) ?? [])
    .map((match) => match.trim())
    .filter((match) => digits(match).length >= 7 && !DATE.test(match));
  const found = [...links, ...bare, ...addresses, ...phones];
  return [...new Set(found.map((value) => value.trim().replace(/[.,;:!?]+$/, "")))];
}

/**
 * The links, addresses and phone numbers of `rewritten` that none of the `known` texts
 * contains. A link below a known one counts as known, so "github.com/name/repo" is fine when
 * the profile names "github.com/name", but "github.com/other" is not.
 */
export function unexpectedContacts(rewritten: string, known: readonly string[]): string[] {
  const knownText = known.join("\n");
  const knownLinks = contactsIn(knownText).map(canonical);
  const knownDigits = new Set(
    contactsIn(knownText)
      .filter(isPhone)
      .map(digits)
      .filter((value) => value.length >= 7),
  );
  return contactsIn(rewritten).filter((value) => {
    if (isPhone(value)) {
      return !knownDigits.has(digits(value));
    }
    const link = canonical(value);
    return !knownLinks.some((knownLink) => knownLink === link || link.startsWith(`${knownLink}/`));
  });
}

/** Control characters that have no place in text, keeping line breaks and tabs. */
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f​-‏‪-‮⁦-⁩]/g;

/** One line: no control characters, single spaces. */
export function cleanLine(value: unknown, max: number): string {
  return typeof value === "string"
    ? value.replace(CONTROL, "").replace(/\s+/g, " ").trim().slice(0, max)
    : "";
}

/** Plain text with paragraphs: no control characters, at most one empty line in a row. */
export function cleanText(value: unknown, max: number): string {
  return typeof value === "string"
    ? value
        .replace(/\r\n?/g, "\n")
        .replace(CONTROL, "")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim()
        .slice(0, max)
    : "";
}

/**
 * Splits finished sentences off a growing text, so a reply can be read aloud while it is
 * still being written. Punctuation only ends a sentence when whitespace follows.
 */
export function takeSentences(buffer: string): { sentences: string[]; rest: string } {
  const sentences: string[] = [];
  const pattern = /(?:[^.!?…\n]|[.!?…](?![\s"')\]]|$))+[.!?…]+["')\]]*\s+|[^\n]+\n+/g;
  let consumed = 0;
  for (const match of buffer.matchAll(pattern)) {
    if (match.index !== consumed) {
      break;
    }
    const sentence = match[0].trim();
    if (sentence) {
      sentences.push(sentence);
    }
    consumed += match[0].length;
  }
  return { sentences, rest: buffer.slice(consumed) };
}

/** Commands the assistant carries out at once, without the model. */
export type LocalIntent =
  { kind: "navigate"; target: NavigationTarget } | { kind: "theme" } | { kind: "clear" };

const INTENT_RULES: [RegExp, LocalIntent][] = [
  [
    /^(öffne |zeig |zum |zur |geh zu |go to |open |show )?(das |the |mein |my )?dashboard$/,
    { kind: "navigate", target: "dashboard" },
  ],
  [
    /^(öffne |zeig |zu |geh zu |go to |open |show )?(den |die |meine |my )?(projekte|projects)$/,
    { kind: "navigate", target: "projects" },
  ],
  [
    /^(neues projekt|projekt erfassen|new project|capture (a )?project)$/,
    { kind: "navigate", target: "new_project" },
  ],
  [
    /^(öffne |zeig |zur |geh zur |go to |open |show )?(meine |my )?(erfahrung|experience|referenzen|references)$/,
    { kind: "navigate", target: "experience" },
  ],
  [/^(cv importieren|cv import|import (my )?cv)$/, { kind: "navigate", target: "import" }],
  [
    /^(dunkel|hell|dunkler modus|heller modus|dark mode|light mode|switch theme|theme wechseln)$/,
    { kind: "theme" },
  ],
  [/^(gespräch leeren|chat leeren|clear (the )?(chat|conversation))$/, { kind: "clear" }],
];

/** A short spoken or typed command assma understands without asking the model. */
export function localIntent(utterance: string): LocalIntent | null {
  const text = utterance
    .toLowerCase()
    .replace(/[.!?,;:"„“”]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text || text.split(" ").length > 5) {
    return null;
  }
  return INTENT_RULES.find(([pattern]) => pattern.test(text))?.[1] ?? null;
}

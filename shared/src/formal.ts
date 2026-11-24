import {
  citeExists,
  correctionFor,
  EDUCATION_LEVELS,
  groupsFor,
  skillFactFor,
  termsOf,
  type Candidate,
  type Cite,
  type EducationLevel,
  type FormalState,
  type Requirement,
  type RequirementGroup,
  type StoredAssessment,
} from "./assessment.js";
import { LANGUAGE_LEVELS, type LanguageLevel } from "./experience.js";
import { currentMonth } from "./skills.js";
import { mentionsTerm, sameLanguage, skillMatches } from "./terms.js";
import { usageOf } from "./usage.js";

/**
 * Formal Fit: does the person meet what the listing explicitly demands? Decided only from
 * stated facts. Missing data makes a requirement unverified; "not fulfilled" needs the
 * person's own statement, complete confirmed data below the threshold, or a contradicting
 * fact. Transferable experience never fulfils a formal requirement.
 */

export type FormalReason =
  | "corrected"
  | "conditions"
  | "denied"
  | "duration_met"
  | "duration_short"
  | "duration_unconfirmed"
  | "present"
  | "undocumented"
  | "language_met"
  | "language_below"
  | "language_missing"
  | "education_met"
  | "education_unconfirmed"
  | "certificate_met"
  | "certificate_missing";

/** Ways to settle an unverified requirement. */
export type ClarifyAction =
  | { kind: "confirm_usage"; referenceIds: string[]; skill: string }
  | { kind: "confirm_complete"; skill: string }
  | { kind: "deny"; skill: string }
  | { kind: "add_experience" }
  | { kind: "add_language" }
  | { kind: "add_education" }
  | { kind: "add_certificate" };

export type FormalItem = {
  requirement: Requirement;
  state: FormalState;
  reason: FormalReason;
  cites: Cite[];
  /** For duration requirements: months required, confirmed, possible with assumed ones, and the gap to confirmed. */
  duration: { required: number; confirmed: number; possible: number; gap: number } | null;
  /** For language requirements: the level asked for and the level listed. */
  levels: { required: string | null; listed: string | null } | null;
  actions: ClarifyAction[];
};

/** One countable entry: a requirement of an AND group, or a whole OR group. */
export type FormalEntry = {
  group: RequirementGroup;
  state: FormalState;
  /** The members behind the state: one for AND, all alternatives for OR. */
  items: FormalItem[];
};

export type FormalFit = {
  items: FormalItem[];
  entries: FormalEntry[];
  mandatory: { fulfilled: number; total: number };
  /** Mandatory entries that cannot be confirmed yet: potential eligibility risks. */
  risks: FormalEntry[];
  /** Mandatory entries that are not fulfilled. */
  blockers: FormalEntry[];
  /** Duration requirements short of the confirmed months. */
  gaps: FormalItem[];
  optional: { fulfilled: number; total: number };
};

const LANGUAGE_RANK = new Map<string, number>(
  LANGUAGE_LEVELS.map((level, index) => [level.toLowerCase(), index]),
);

function languageLevel(value: string | null): LanguageLevel | null {
  if (!value) {
    return null;
  }
  const folded = value.trim().toLowerCase();
  if (/^(native|muttersprache|mother tongue|first language)/.test(folded)) {
    return "native";
  }
  const cefr = /\b([abc][12])\b/i.exec(folded)?.[1]?.toUpperCase();
  return cefr ? (cefr as LanguageLevel) : null;
}

const EDUCATION_PATTERNS: [EducationLevel, RegExp][] = [
  ["phd", /\b(phd|ph d|dr|doktor|promotion|doctorate|doctor)\b/],
  ["master", /\b(master|m sc|msc|m a|m eng|meng|mba|diplom|dipl|magister|staatsexamen)\b/],
  ["bachelor", /\b(bachelor|b sc|bsc|b a|b eng|beng)\b/],
  [
    "vocational",
    /\b(ausbildung|apprenticeship|vocational|fachinformatiker|kaufmann|kauffrau|techniker|meister)\b/,
  ],
];

const EDUCATION_RANK: Record<EducationLevel, number> = {
  vocational: 1,
  degree: 2,
  bachelor: 2,
  master: 3,
  phd: 4,
};

/** The level a degree name implies, or null when it cannot be told. */
export function educationLevel(degree: string): EducationLevel | null {
  const folded = degree
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ");
  return EDUCATION_PATTERNS.find(([, pattern]) => pattern.test(` ${folded} `))?.[0] ?? null;
}

function requiredEducation(level: string | null): EducationLevel {
  const value = (level ?? "").toLowerCase();
  return (EDUCATION_LEVELS as readonly string[]).includes(value)
    ? (value as EducationLevel)
    : "degree";
}

/** Citations the model gave for a requirement, when they point at existing data. */
function modelCites(
  requirement: Requirement,
  assessment: Pick<StoredAssessment, "technical" | "corrections">,
  candidate: Candidate,
  states: readonly string[] = ["direct"],
): Cite[] {
  const correction = correctionFor(requirement.id, assessment.corrections)?.technical;
  if (correction) {
    return states.includes(correction.state)
      ? correction.cites.filter((cite) => citeExists(cite, candidate))
      : [];
  }
  const result = assessment.technical.find((entry) => entry.requirementId === requirement.id);
  return result && states.includes(result.state)
    ? result.cites.filter((cite) => citeExists(cite, candidate))
    : [];
}

function item(
  requirement: Requirement,
  state: FormalState,
  reason: FormalReason,
  extra: Partial<Pick<FormalItem, "cites" | "duration" | "levels" | "actions">> = {},
): FormalItem {
  return {
    requirement,
    state,
    reason,
    cites: extra.cites ?? [],
    duration: extra.duration ?? null,
    levels: extra.levels ?? null,
    actions: extra.actions ?? [],
  };
}

export function formalItem(
  requirement: Requirement,
  assessment: Pick<StoredAssessment, "technical" | "corrections">,
  candidate: Candidate,
): FormalItem {
  const correction = correctionFor(requirement.id, assessment.corrections)?.formal;
  if (correction) {
    return item(requirement, correction, "corrected");
  }
  if (requirement.category === "conditions") {
    return item(requirement, "not_applicable", "conditions");
  }
  const terms = termsOf(requirement);
  const skill = requirement.normalised;

  if (requirement.category === "language") {
    const required = languageLevel(requirement.level);
    const listed = candidate.profile.languages.find((entry) =>
      terms.some((term) => sameLanguage(entry.name, term)),
    );
    if (!listed) {
      return item(requirement, "unverified", "language_missing", {
        levels: { required, listed: null },
        actions: [{ kind: "add_language" }],
      });
    }
    const cites: Cite[] = [{ kind: "language", key: listed.name }];
    const levels = { required, listed: listed.level };
    // A listed lower level is a confirmed fact that contradicts the requirement.
    if (
      required &&
      LANGUAGE_RANK.get(listed.level.toLowerCase())! > LANGUAGE_RANK.get(required.toLowerCase())!
    ) {
      return item(requirement, "not_fulfilled", "language_below", { cites, levels });
    }
    return item(requirement, "fulfilled", "language_met", { cites, levels });
  }

  if (requirement.category === "education") {
    const needed = EDUCATION_RANK[requiredEducation(requirement.level)];
    const year = Number(currentMonth().slice(0, 4));
    const cited = modelCites(requirement, assessment, candidate, [
      "direct",
      "partial",
      "transferable",
    ])
      .filter((cite) => cite.kind === "education")
      .map((cite) => cite.key.toLowerCase());
    // For education the terms name the field, if the listing asks for one.
    const fields = requirement.terms.filter(
      (term) => term.toLowerCase() !== requirement.normalised.toLowerCase(),
    );
    const qualifying = candidate.profile.education.find((entry) => {
      const level = educationLevel(entry.degree);
      const completed = entry.end !== "" && Number(entry.end) <= year;
      const text = `${entry.degree} ${entry.institution} ${entry.note}`;
      const fieldOk =
        fields.length === 0 ||
        fields.some((field) => mentionsTerm(text, field)) ||
        cited.includes(entry.degree.toLowerCase());
      return level !== null && EDUCATION_RANK[level] >= needed && completed && fieldOk;
    });
    if (qualifying) {
      return item(requirement, "fulfilled", "education_met", {
        cites: [{ kind: "education", key: qualifying.degree }],
      });
    }
    // A degree that is not listed is not a confirmed fact; it may simply be missing.
    return item(requirement, "unverified", "education_unconfirmed", {
      actions: [{ kind: "add_education" }],
    });
  }

  if (requirement.category === "certification") {
    const listed = candidate.profile.certificates.find((entry) =>
      terms.some((term) => skillMatches(entry.name, term)),
    );
    const cited = modelCites(requirement, assessment, candidate).find(
      (cite) => cite.kind === "certificate",
    );
    if (listed || cited) {
      return item(requirement, "fulfilled", "certificate_met", {
        cites: [listed ? { kind: "certificate", key: listed.name } : cited!],
      });
    }
    return item(requirement, "unverified", "certificate_missing", {
      actions: [{ kind: "add_certificate" }],
    });
  }

  // Technologies, methods, domains and professional experience.
  const fact = skillFactFor(requirement, candidate.skillFacts);
  if (fact === "none") {
    return item(requirement, "not_fulfilled", "denied");
  }
  // Only direct experience cited by the model counts; transferable never fulfils.
  const citedReferences = modelCites(requirement, assessment, candidate)
    .filter((cite) => cite.kind === "reference")
    .map((cite) => cite.key);
  const usage = usageOf(terms, candidate.references, {
    today: candidate.today,
    cited: citedReferences,
  });
  const cites: Cite[] = usage.references.map((entry) => ({
    kind: "reference",
    key: entry.referenceId,
  }));
  const assumedReferences = usage.references
    .filter((entry) => entry.usage === "assumed")
    .map((entry) => entry.referenceId);

  if (requirement.months !== null) {
    const duration = {
      required: requirement.months,
      confirmed: usage.confirmedMonths,
      possible: usage.possibleMonths,
      gap: Math.max(0, requirement.months - usage.confirmedMonths),
    };
    if (usage.confirmedMonths >= requirement.months) {
      return item(requirement, "fulfilled", "duration_met", { cites, duration });
    }
    if (fact === "complete") {
      return item(requirement, "not_fulfilled", "duration_short", { cites, duration });
    }
    const actions: ClarifyAction[] = [];
    if (assumedReferences.length > 0) {
      actions.push({ kind: "confirm_usage", referenceIds: assumedReferences, skill });
    }
    if (usage.references.length > 0) {
      actions.push({ kind: "confirm_complete", skill });
    }
    actions.push({ kind: "add_experience" }, { kind: "deny", skill });
    return item(
      requirement,
      "unverified",
      usage.references.length > 0 ? "duration_unconfirmed" : "undocumented",
      { cites, duration, actions },
    );
  }

  if (usage.references.length > 0) {
    return item(requirement, "fulfilled", "present", { cites });
  }
  return item(requirement, "unverified", "undocumented", {
    actions: [{ kind: "add_experience" }, { kind: "deny", skill }],
  });
}

/** Fulfilled beats not applicable beats unverified beats not fulfilled. */
const STATE_ORDER: Record<FormalState, number> = {
  fulfilled: 0,
  not_applicable: 1,
  unverified: 2,
  not_fulfilled: 3,
};

export function formalFit(
  assessment: Pick<StoredAssessment, "groups" | "requirements" | "technical" | "corrections">,
  candidate: Candidate,
): FormalFit {
  const items: FormalItem[] = [];
  const entries: FormalEntry[] = [];
  for (const { group, members } of groupsFor(assessment, "formal")) {
    const groupItems = members.map((member) => formalItem(member, assessment, candidate));
    items.push(...groupItems);
    if (group.operator === "any") {
      const best = [...groupItems].sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state])[0]!;
      entries.push({ group, state: best.state, items: groupItems });
    } else {
      entries.push(...groupItems.map((entry) => ({ group, state: entry.state, items: [entry] })));
    }
  }
  const counted = entries.filter((entry) => entry.state !== "not_applicable");
  const mandatory = counted.filter((entry) => entry.group.mandatory);
  const optional = counted.filter((entry) => !entry.group.mandatory);
  return {
    items,
    entries,
    mandatory: {
      fulfilled: mandatory.filter((entry) => entry.state === "fulfilled").length,
      total: mandatory.length,
    },
    risks: mandatory.filter((entry) => entry.state === "unverified"),
    blockers: mandatory.filter((entry) => entry.state === "not_fulfilled"),
    gaps: items.filter((entry) => entry.duration !== null && entry.duration.gap > 0),
    optional: {
      fulfilled: optional.filter((entry) => entry.state === "fulfilled").length,
      total: optional.length,
    },
  };
}

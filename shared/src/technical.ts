import {
  citeExists,
  correctionFor,
  groupsFor,
  skillFactFor,
  type Candidate,
  type Cite,
  type OnboardingEffort,
  type Requirement,
  type StoredAssessment,
  type TechnicalState,
} from "./assessment.js";

/**
 * Technical Fit: can the person do the work? The model's judgement is checked against the
 * data it cites; the score is computed here. Unknown requirements are left out of the score
 * and shown as reduced coverage instead.
 */

export type TechnicalItem = {
  requirement: Requirement;
  state: TechnicalState;
  onboarding: OnboardingEffort;
  cites: Cite[];
  note: string;
  /** Where the state comes from. */
  source: "model" | "correction" | "fact" | "none";
};

export type TechnicalFit = {
  /** 0–10, or null when nothing could be assessed. */
  score: number | null;
  /** Share of the requirement weight that could be assessed, 0–1; null without requirements. */
  coverage: number | null;
  items: TechnicalItem[];
  counts: Record<TechnicalState, number>;
};

/** What a state earns towards the score; unknown is not scored at all. */
export const TECHNICAL_EARNED: Record<Exclude<TechnicalState, "unknown">, number> = {
  direct: 1,
  transferable: 0.75,
  partial: 0.4,
  gap: 0,
};

const MANDATORY_WEIGHT = 2;
const OPTIONAL_WEIGHT = 1;

/** The resolved state of one requirement: correction, then stated fact, then the checked model result. */
export function technicalItem(
  requirement: Requirement,
  assessment: Pick<StoredAssessment, "technical" | "corrections">,
  candidate: Candidate,
): TechnicalItem {
  const correction = correctionFor(requirement.id, assessment.corrections)?.technical;
  if (correction) {
    return {
      requirement,
      state: correction.state,
      onboarding: "unknown",
      cites: correction.cites.filter((cite) => citeExists(cite, candidate)),
      note: "",
      source: "correction",
    };
  }
  if (skillFactFor(requirement, candidate.skillFacts) === "none") {
    return {
      requirement,
      state: "gap",
      onboarding: "unknown",
      cites: [],
      note: "",
      source: "fact",
    };
  }
  const result = assessment.technical.find((entry) => entry.requirementId === requirement.id);
  if (!result) {
    return {
      requirement,
      state: "unknown",
      onboarding: "unknown",
      cites: [],
      note: "",
      source: "none",
    };
  }
  const cites = result.cites.filter((cite) => citeExists(cite, candidate));
  // A match must point at existing data. A gap too: missing documentation is not missing
  // experience, so the model may only call something a gap when it shows what falls short.
  const state: TechnicalState =
    result.state !== "unknown" && cites.length === 0 ? "unknown" : result.state;
  return {
    requirement,
    state,
    onboarding: state === "transferable" || state === "partial" ? result.onboarding : "unknown",
    cites: state === "unknown" ? [] : cites,
    note: result.note,
    source: "model",
  };
}

const earned = (item: TechnicalItem) =>
  item.state === "unknown" ? null : TECHNICAL_EARNED[item.state];

export function technicalFit(
  assessment: Pick<StoredAssessment, "groups" | "requirements" | "technical" | "corrections">,
  candidate: Candidate,
): TechnicalFit {
  const items: TechnicalItem[] = [];
  let total = 0;
  let assessed = 0;
  let points = 0;
  for (const { group, members } of groupsFor(assessment, "technical")) {
    const weight = group.mandatory ? MANDATORY_WEIGHT : OPTIONAL_WEIGHT;
    const groupItems = members.map((member) => technicalItem(member, assessment, candidate));
    items.push(...groupItems);
    total += weight;
    if (group.operator === "any") {
      // Alternatives: the best known alternative stands for the group.
      const known = groupItems.map(earned).filter((value): value is number => value !== null);
      if (known.length > 0) {
        assessed += weight;
        points += weight * Math.max(...known);
      }
    } else {
      // All needed: the members share the group's weight, so splitting a sentence into
      // several technologies does not make it count more.
      const share = weight / groupItems.length;
      for (const item of groupItems) {
        const value = earned(item);
        if (value !== null) {
          assessed += share;
          points += share * value;
        }
      }
    }
  }
  const counts = { direct: 0, transferable: 0, partial: 0, gap: 0, unknown: 0 };
  for (const item of items) {
    counts[item.state] += 1;
  }
  return {
    score: assessed === 0 ? null : Math.min(10, Math.max(0, Math.round((points / assessed) * 10))),
    coverage: total === 0 ? null : assessed / total,
    items,
    counts,
  };
}

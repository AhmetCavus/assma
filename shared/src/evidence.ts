import {
  groupsFor,
  termsOf,
  type Candidate,
  type Cite,
  type EvidenceState,
  type Requirement,
  type StoredAssessment,
} from "./assessment.js";
import { formalItem, type ClarifyAction, type FormalItem } from "./formal.js";
import { technicalItem, type TechnicalItem } from "./technical.js";
import { mentionsTerm, skillMatches } from "./terms.js";

/**
 * Evidence: does the project's CV show the experience the person has? Only requirements
 * with supporting candidate data are assessed. A requirement without any data is missing
 * profile data, to be supplemented in the profile, and a confirmed skill gap is neither —
 * no CV wording can resolve either. Suggestions only select or reuse existing data.
 */

/** The parts of a CV draft that decide what the CV shows. */
export type CvEvidenceInput = {
  summary: string;
  referenceIds: readonly string[];
  /** Skills chosen for the matrix; null lets assma choose from the references. */
  skills: readonly string[] | null;
};

export type EvidenceSuggestion =
  | { kind: "select_reference"; referenceId: string }
  | { kind: "add_skill"; skill: string; referenceId: string }
  | { kind: "mention_in_summary"; term: string; referenceId: string | null };

export type EvidenceItem = {
  requirement: Requirement;
  state: EvidenceState;
  /** The candidate data the requirement rests on. */
  support: Cite[];
  /** Requirement terms the CV text does not mention. */
  missingKeywords: string[];
  /** A duration requirement whose skill is not in the CV's skill matrix. */
  missingDuration: boolean;
  suggestions: EvidenceSuggestion[];
};

export type MissingProfileData = {
  requirement: Requirement;
  actions: ClarifyAction[];
};

export type Evidence = {
  /** False until the project has a CV; the score is then not available. */
  available: boolean;
  /** 0–10, or null when nothing could be assessed. */
  score: number | null;
  /** Share of the requirements with supporting data that could be assessed, 0–1. */
  coverage: number | null;
  items: EvidenceItem[];
  /** Partially evidenced and missing evidence: what the person can act on in the CV. */
  gaps: number;
  missingProfileData: MissingProfileData[];
  /** Confirmed skill gaps: not documentation problems. */
  skillGaps: Requirement[];
};

/** The text of a CV as it reads, for keyword checks. */
export function cvPlainText(cv: CvEvidenceInput, candidate: Candidate): string {
  const selected = cv.referenceIds
    .map((id) => candidate.references.find((reference) => reference.id === id))
    .filter((reference): reference is Candidate["references"][number] => Boolean(reference));
  const skills = cv.skills ?? selected.flatMap((reference) => reference.skills);
  const { profile } = candidate;
  return [
    profile.headline,
    cv.summary,
    ...selected.flatMap((reference) => [
      reference.organization,
      reference.role,
      reference.contribution,
      reference.skills.join(", "),
    ]),
    skills.join(", "),
    ...profile.education.map((entry) => `${entry.degree} ${entry.institution} ${entry.note}`),
    ...profile.languages.map((entry) => `${entry.name} ${entry.level}`),
    ...profile.certificates.map((entry) => `${entry.name} ${entry.issuer}`),
  ]
    .filter(Boolean)
    .join("\n");
}

function supportOf(technical: TechnicalItem, formal: FormalItem): Cite[] {
  const cites = [
    ...(technical.state === "direct" ||
    technical.state === "transferable" ||
    technical.state === "partial"
      ? technical.cites
      : []),
    ...formal.cites,
  ];
  const seen = new Set<string>();
  return cites.filter((cite) => {
    const key = `${cite.kind}:${cite.key.toLowerCase()}`;
    return seen.has(key) ? false : (seen.add(key), true);
  });
}

export function evidence(
  assessment: Pick<StoredAssessment, "groups" | "requirements" | "technical" | "corrections">,
  candidate: Candidate,
  cv: CvEvidenceInput | null,
): Evidence {
  const items: EvidenceItem[] = [];
  const missingProfileData: MissingProfileData[] = [];
  const skillGaps: Requirement[] = [];
  const text = cv ? cvPlainText(cv, candidate) : "";
  const selected = new Set(cv?.referenceIds ?? []);

  for (const { group, members } of groupsFor(assessment, "evidence")) {
    const judged = members.map((requirement) => {
      const technical = technicalItem(requirement, assessment, candidate);
      const formal = formalItem(requirement, assessment, candidate);
      return { requirement, technical, formal, support: supportOf(technical, formal) };
    });
    // Of alternatives, only those with data matter once any of them has some.
    const anySupported = judged.some((entry) => entry.support.length > 0);
    for (const { requirement, technical, formal, support } of judged) {
      if (group.operator === "any" && anySupported && support.length === 0) {
        continue;
      }
      if (technical.state === "gap" || formal.reason === "denied") {
        skillGaps.push(requirement);
        continue;
      }
      if (support.length === 0) {
        missingProfileData.push({ requirement, actions: formal.actions });
        continue;
      }
      if (!cv) {
        continue;
      }
      const terms = termsOf(requirement);
      const references = support
        .filter((cite) => cite.kind === "reference")
        .map((cite) => cite.key);
      const inCv =
        references.some((id) => selected.has(id)) ||
        // Education, languages and certificates always appear on the CV.
        support.some((cite) => cite.kind !== "reference");
      const mentioned = terms.some((term) => mentionsTerm(text, term));
      const missingKeywords = mentioned ? [] : [requirement.normalised];
      const listingReferences = candidate.references.filter((reference) =>
        reference.skills.some((skill) => terms.some((term) => skillMatches(skill, term))),
      );
      const matrixHas =
        cv.skills === null
          ? listingReferences.length > 0
          : cv.skills.some((skill) => terms.some((term) => skillMatches(skill, term)));
      const missingDuration = requirement.months !== null && !matrixHas;

      const technicalUnknown =
        requirement.dimensions.includes("technical") &&
        technical.state === "unknown" &&
        formal.state !== "fulfilled";
      const state: EvidenceState = technicalUnknown
        ? "unknown"
        : inCv && mentioned && !missingDuration
          ? "full"
          : inCv || mentioned
            ? "partial"
            : "missing";

      const suggestions: EvidenceSuggestion[] = [];
      if (state === "partial" || state === "missing") {
        const unselected = references.find((id) => !selected.has(id));
        if (!references.some((id) => selected.has(id)) && unselected) {
          suggestions.push({ kind: "select_reference", referenceId: unselected });
        }
        // A skill may only be added when an existing reference lists it.
        const lister = listingReferences.find((reference) => references.includes(reference.id));
        const listedSkill = lister?.skills.find((skill) =>
          terms.some((term) => skillMatches(skill, term)),
        );
        if ((missingDuration || !mentioned) && cv.skills !== null && lister && listedSkill) {
          suggestions.push({ kind: "add_skill", skill: listedSkill, referenceId: lister.id });
        } else if (!mentioned && inCv) {
          suggestions.push({
            kind: "mention_in_summary",
            term: requirement.normalised,
            referenceId: references.find((id) => selected.has(id)) ?? null,
          });
        }
      }
      items.push({ requirement, state, support, missingKeywords, missingDuration, suggestions });
    }
  }

  const scored = items.filter((entry) => entry.state !== "unknown");
  const full = scored.filter((entry) => entry.state === "full").length;
  const partial = scored.filter((entry) => entry.state === "partial").length;
  return {
    available: cv !== null,
    score:
      cv === null || scored.length === 0
        ? null
        : Math.round((10 * (full + 0.5 * partial)) / scored.length),
    coverage: cv === null || items.length === 0 ? null : scored.length / items.length,
    items,
    gaps: scored.filter((entry) => entry.state !== "full").length,
    missingProfileData,
    skillGaps,
  };
}

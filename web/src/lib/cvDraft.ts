import {
  DEFAULT_CV_DESIGN,
  defaultSkills,
  FIT_LIMITS,
  skillRows,
  supportingReferences,
  technicalFit,
  type StoredAssessment,
  type CvChoice,
  type CvDraft,
  type CvRole,
  type CvDesign,
  type CvLanguage,
  type Experience,
  type Locale,
  type Project,
  type Snapshot,
} from "@assma/shared";
import { cvDocument, type CvDocument } from "./cvDocument";

/** The tailored CV as the person edits it; shared by the CV page and the apply page. */
export type Draft = {
  summary: string;
  referenceIds: string[];
  imageId: string | null;
  /** null: the recommended selection (project-relevant first, then most practised). */
  skills: string[] | null;
  /** Years set by hand per skill. */
  skillYears: Record<string, number>;
  /** null: the most practised roles with their detected years. */
  roles: CvRole[] | null;
  /** null: the interface language. */
  language: CvLanguage | null;
  design: CvDesign;
};

export const EMPTY_DRAFT: Draft = {
  summary: "",
  referenceIds: [],
  imageId: null,
  skills: null,
  skillYears: {},
  roles: null,
  language: null,
  design: DEFAULT_CV_DESIGN,
};

/** References the assessment cites for existing competencies, most cited first. */
function assessedReferences(assessment: StoredAssessment, experience: Experience): string[] {
  const candidate = {
    references: experience.references,
    profile: experience.profile,
    skillFacts: experience.skillFacts,
  };
  const counts = new Map<string, number>();
  for (const item of technicalFit(assessment, candidate).items) {
    if (item.state === "gap" || item.state === "unknown") {
      continue;
    }
    for (const cite of item.cites) {
      if (cite.kind === "reference") {
        counts.set(cite.key, (counts.get(cite.key) ?? 0) + (item.state === "direct" ? 2 : 1));
      }
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

/**
 * A stored CV configuration as a draft; references and photos deleted since are left out.
 */
export function draftOf(cv: CvDraft, experience: Experience): Draft {
  const known = new Set(experience.references.map((reference) => reference.id));
  const photos = new Set(experience.images.map((image) => image.id));
  return {
    summary: cv.summary,
    referenceIds: cv.referenceIds.filter((id) => known.has(id)),
    imageId: cv.imageId && photos.has(cv.imageId) ? cv.imageId : null,
    skills: cv.skills,
    skillYears: cv.skillYears,
    roles: cv.roles,
    language: cv.language,
    design: cv.design,
  };
}

/** Whether two drafts produce the same CV, whatever order their keys were stored in. */
export function sameDraft(a: Draft, b: Draft): boolean {
  const comparable = (draft: Draft) =>
    JSON.stringify([
      draft.summary.trim(),
      draft.referenceIds,
      draft.imageId,
      draft.skills,
      Object.entries(draft.skillYears).sort(([x], [y]) => x.localeCompare(y)),
      draft.roles,
      draft.language,
      draft.design.theme,
      draft.design.layout,
      draft.design.photoShape,
    ]);
  return comparable(a) === comparable(b);
}

/** The saved draft, or a first one: profile summary, references the fit supports, first photo. */
export function initialDraft(project: Project, experience: Experience): Draft {
  const known = new Set(experience.references.map((reference) => reference.id));
  const photos = new Set(experience.images.map((image) => image.id));
  const firstPhoto = experience.images[0]?.id ?? null;
  if (project.cv) {
    return draftOf(project.cv, experience);
  }
  const supporting = (
    project.assessment
      ? assessedReferences(project.assessment, experience)
      : project.fit
        ? supportingReferences(project.fit)
        : []
  ).filter((id) => known.has(id));
  return {
    summary: experience.profile.summary,
    referenceIds: (supporting.length > 0
      ? supporting
      : experience.references.map((reference) => reference.id)
    ).slice(0, FIT_LIMITS.cvReferences),
    imageId: firstPhoto,
    skills: null,
    skillYears: {},
    roles: null,
    language: null,
    design: DEFAULT_CV_DESIGN,
  };
}

/** Every choice of a draft resolved, as it goes into a document and an application. */
export function resolveDraft(
  project: Project,
  experience: Experience,
  draft: Draft,
  locale: Locale,
): CvChoice {
  return {
    summary: draft.summary,
    referenceIds: draft.referenceIds.filter((id) =>
      experience.references.some((reference) => reference.id === id),
    ),
    imageId: draft.imageId,
    skills: draft.skills ?? defaultSkills(skillRows(experience.references), project),
    skillYears: draft.skillYears,
    roles: draft.roles,
    language: draft.language ?? locale,
    design: draft.design,
  };
}

export function documentOf(experience: Experience, choice: CvChoice): CvDocument {
  const byId = new Map(experience.references.map((reference) => [reference.id, reference]));
  return cvDocument({
    profile: experience.profile,
    summary: choice.summary,
    references: choice.referenceIds.flatMap((id) => {
      const reference = byId.get(id);
      return reference ? [reference] : [];
    }),
    allReferences: experience.references,
    skills: choice.skills,
    skillYears: choice.skillYears,
    roles: choice.roles,
    photo: experience.images.find((image) => image.id === choice.imageId)?.dataUrl ?? null,
    language: choice.language,
    design: choice.design,
  });
}

/** The CV exactly as it was frozen in an application. */
export function documentOfSnapshot(snapshot: Snapshot): CvDocument {
  return cvDocument({
    profile: snapshot.profile,
    summary: snapshot.cv.summary,
    references: snapshot.references,
    allReferences: snapshot.allReferences,
    skills: snapshot.cv.skills,
    skillYears: snapshot.cv.skillYears,
    roles: snapshot.cv.roles,
    photo: snapshot.cv.photo,
    language: snapshot.cv.language,
    design: snapshot.cv.design,
  });
}

import {
  DEFAULT_CV_DESIGN,
  defaultSkills,
  FIT_LIMITS,
  skillRows,
  supportingReferences,
  type CvChoice,
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
  /** null: the interface language. */
  language: CvLanguage | null;
  design: CvDesign;
};

export const EMPTY_DRAFT: Draft = {
  summary: "",
  referenceIds: [],
  imageId: null,
  skills: null,
  language: null,
  design: DEFAULT_CV_DESIGN,
};

/** The saved draft, or a first one: profile summary, references the fit supports, first photo. */
export function initialDraft(project: Project, experience: Experience): Draft {
  const known = new Set(experience.references.map((reference) => reference.id));
  const photos = new Set(experience.images.map((image) => image.id));
  const firstPhoto = experience.images[0]?.id ?? null;
  if (project.cv) {
    return {
      summary: project.cv.summary,
      referenceIds: project.cv.referenceIds.filter((id) => known.has(id)),
      imageId: project.cv.imageId && photos.has(project.cv.imageId) ? project.cv.imageId : null,
      skills: project.cv.skills,
      language: project.cv.language,
      design: project.cv.design,
    };
  }
  const supporting = project.fit
    ? supportingReferences(project.fit).filter((id) => known.has(id))
    : [];
  return {
    summary: experience.profile.summary,
    referenceIds: (supporting.length > 0
      ? supporting
      : experience.references.map((reference) => reference.id)
    ).slice(0, FIT_LIMITS.cvReferences),
    imageId: firstPhoto,
    skills: null,
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
    photo: snapshot.cv.photo,
    language: snapshot.cv.language,
    design: snapshot.cv.design,
  });
}

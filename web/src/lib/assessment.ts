import { useEffect, useState } from "react";
import {
  DEFAULT_ECONOMIC_PREFERENCES,
  toApiError,
  type AssmaApi,
  type Candidate,
  type CvEvidenceInput,
  type EconomicPreferences,
  type Experience,
  type Project,
} from "@assma/shared";

/**
 * The browser computes the four dimensions itself with the shared rules, from the project,
 * the person's experience and their preferences, so every change shows at once and no
 * model runs for it.
 */

const EXPERIENCE_CHANGED = "assma:experience-changed";
const PREFERENCES_CHANGED = "assma:preferences-changed";

export function experienceChanged(): void {
  window.dispatchEvent(new Event(EXPERIENCE_CHANGED));
}

export function preferencesChanged(): void {
  window.dispatchEvent(new Event(PREFERENCES_CHANGED));
}

export function candidateFrom(experience: Experience): Candidate {
  return {
    references: experience.references,
    profile: experience.profile,
    skillFacts: experience.skillFacts,
  };
}

/** What the CV of a project shows, or null when there is no CV yet. */
export function cvInputOf(project: Pick<Project, "cv">): CvEvidenceInput | null {
  return project.cv
    ? {
        summary: project.cv.summary,
        referenceIds: project.cv.referenceIds,
        skills: project.cv.skills,
      }
    : null;
}

function useReloading<T>(
  load: () => Promise<T>,
  event: string,
  onUnauthorized: () => void,
  deps: unknown[],
): T | null {
  const [value, setValue] = useState<T | null>(null);
  useEffect(() => {
    let active = true;
    const run = () => {
      load()
        .then((next) => active && setValue(next))
        .catch((failure: unknown) => {
          if (active && toApiError(failure).isUnauthorized) {
            onUnauthorized();
          }
        });
    };
    run();
    window.addEventListener(event, run);
    return () => {
      active = false;
      window.removeEventListener(event, run);
    };
  }, deps);
  return value;
}

/** The person's experience; reloads after `experienceChanged()`. */
export function useExperience(api: AssmaApi, onUnauthorized: () => void): Experience | null {
  return useReloading(() => api.experience(), EXPERIENCE_CHANGED, onUnauthorized, [api]);
}

/** The person's economic preferences, or the defaults; reloads after `preferencesChanged()`. */
export function useEconomicPreferences(
  api: AssmaApi,
  onUnauthorized: () => void,
): { economic: EconomicPreferences; saved: boolean } | null {
  const stored = useReloading(() => api.preferences(), PREFERENCES_CHANGED, onUnauthorized, [api]);
  return stored
    ? {
        economic: stored.economic ?? DEFAULT_ECONOMIC_PREFERENCES,
        saved: stored.updatedAt !== null,
      }
    : null;
}

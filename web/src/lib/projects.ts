import { useEffect, useState } from "react";
import { sortProjects, toApiError, type AssmaApi, type Project } from "@assma/shared";

const CHANGED = "assma:projects-changed";

/** Tells every list on screen (sidebar, register, Dashboard) to reload. */
export function projectsChanged(): void {
  window.dispatchEvent(new Event(CHANGED));
}

/** The signed-in person's projects, newest first; reloads after `projectsChanged()`. */
export function useProjects(api: AssmaApi, onUnauthorized: () => void) {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    const load = () => {
      api
        .projects()
        .then((list) => {
          if (active) {
            setProjects(sortProjects(list));
            setFailed(false);
          }
        })
        .catch((failure: unknown) => {
          if (!active) {
            return;
          }
          if (toApiError(failure).isUnauthorized) {
            onUnauthorized();
          } else {
            setFailed(true);
          }
        });
    };
    load();
    window.addEventListener(CHANGED, load);
    return () => {
      active = false;
      window.removeEventListener(CHANGED, load);
    };
  }, [api]);

  return { projects, failed };
}

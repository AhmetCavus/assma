import { useEffect, useState } from "react";
import { toApiError, type ApplicationSummary, type AssmaApi } from "@assma/shared";

const CHANGED = "assma:applications-changed";

/** Tells every list on screen (Dashboard, project pages) to reload. */
export function applicationsChanged(): void {
  window.dispatchEvent(new Event(CHANGED));
}

/** The signed-in person's applications, newest first; reloads after `applicationsChanged()`. */
export function useApplications(api: AssmaApi, onUnauthorized: () => void) {
  const [applications, setApplications] = useState<ApplicationSummary[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    const load = () => {
      api
        .applications()
        .then((list) => {
          if (active) {
            setApplications(list);
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

  return { applications, failed };
}

/** "2026-11-21T14:05" in local time, for a datetime-local input. */
export function localDateTime(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/** A datetime-local value back to an ISO timestamp; null when empty or invalid. */
export function isoOf(local: string): string | null {
  const time = new Date(local).getTime();
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

export function pdfBlob(bytes: Uint8Array): Blob {
  return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "application/pdf" });
}

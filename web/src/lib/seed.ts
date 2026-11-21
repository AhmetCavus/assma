/**
 * A listing or link typed on the landing page, carried through sign-up to the project
 * editor. Kept in sessionStorage so it survives the sign-up page, and taken once.
 */
const KEY = "assma.seed";

export function setSeed(value: string): void {
  try {
    if (value.trim()) {
      sessionStorage.setItem(KEY, value.trim());
    } else {
      sessionStorage.removeItem(KEY);
    }
  } catch {
    // Blocked storage only loses the convenience.
  }
}

export function hasSeed(): boolean {
  try {
    return Boolean(sessionStorage.getItem(KEY));
  } catch {
    return false;
  }
}

/** Cleared after the current render, so React's repeated initialiser calls see it too. */
export function takeSeed(): { sourceUrl: string; brief: string } | null {
  let value: string | null = null;
  try {
    value = sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
  queueMicrotask(() => {
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      // Already unavailable.
    }
  });
  if (!value) {
    return null;
  }
  return /^https?:\/\/\S+$/i.test(value)
    ? { sourceUrl: value, brief: "" }
    : { sourceUrl: "", brief: value };
}

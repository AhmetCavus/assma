/** A one-time message carried to the next page, such as "3 references imported". */
let pending = "";

export function setFlash(message: string): void {
  pending = message;
}

/**
 * Returns the message and clears it after the current render, so React's repeated
 * initialiser calls in development still see the same message.
 */
export function takeFlash(): string {
  const message = pending;
  if (message) {
    queueMicrotask(() => {
      if (pending === message) {
        pending = "";
      }
    });
  }
  return message;
}

/** A project saved with "save and check fit" is assessed when its fit page opens. */
let autoAssess = "";

export function setAutoAssess(projectId: string): void {
  autoAssess = projectId;
}

/** True once for the project that was just saved; repeated initial calls see it too. */
export function takeAutoAssess(projectId: string): boolean {
  if (autoAssess !== projectId) {
    return false;
  }
  queueMicrotask(() => {
    if (autoAssess === projectId) {
      autoAssess = "";
    }
  });
  return true;
}

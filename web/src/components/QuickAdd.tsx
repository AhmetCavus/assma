import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { PROJECT_LIMITS, quickInputOf, toApiError } from "@assma/shared";
import { Icon } from "./Icon";
import type { Preferences } from "../lib/preferences";
import { projectsChanged } from "../lib/projects";
import type { Session } from "../lib/session";

const MAX_HEIGHT = 220;

/**
 * Saves project links or a pasted listing as drafts without reading them. Links become one
 * draft each and are loaded later; text with substance becomes one draft that is read
 * directly later. Links that are already saved are only reported.
 */
export function QuickAdd({ session, preferences }: { session: Session; preferences: Preferences }) {
  const { copy } = preferences;
  const text = copy.projects.quick;
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const field = useRef<HTMLTextAreaElement>(null);
  const input = quickInputOf(value);

  // Grows with the text up to a limit, then scrolls.
  useLayoutEffect(() => {
    const element = field.current;
    if (element) {
      element.style.height = "auto";
      element.style.height = `${Math.min(element.scrollHeight + 2, MAX_HEIGHT)}px`;
    }
  }, [value]);

  async function add() {
    setStatus("");
    setError("");
    if (input.kind === "empty") {
      setError(text.noLink);
      return;
    }
    if (input.kind === "links" && input.urls.length > PROJECT_LIMITS.quickLinks) {
      setError(text.tooMany(PROJECT_LIMITS.quickLinks));
      return;
    }
    if (input.kind === "text" && input.text.length > PROJECT_LIMITS.brief) {
      setError(text.tooLong(PROJECT_LIMITS.brief));
      return;
    }
    setBusy(true);
    try {
      const result = await session.api.addDrafts(
        input.kind === "links" ? { urls: input.urls } : { text: input.text, url: input.url },
      );
      setValue("");
      const created = result.created.length;
      setStatus(
        [
          created > 0 && (input.kind === "text" ? text.addedText : text.added(created)),
          result.existing.length > 0 && text.existing(result.existing.length),
        ]
          .filter(Boolean)
          .join(" "),
      );
      if (created > 0) {
        projectsChanged();
      }
    } catch (failure) {
      const apiError = toApiError(failure);
      if (apiError.isUnauthorized) {
        session.signOut(copy.common.sessionExpired);
      } else if (apiError.code === "project_limit") {
        setError(copy.projects.projectLimit);
      } else if (apiError.code === "invalid_input") {
        setError(text.noLink);
      } else {
        setError(copy.common.error);
      }
    } finally {
      setBusy(false);
    }
  }

  // Enter saves and Shift+Enter starts a new line; on touch screens Enter is a new line.
  function onKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) {
      return;
    }
    const touch = window.matchMedia("(pointer: coarse)").matches;
    if (event.metaKey || event.ctrlKey || (!event.shiftKey && !touch)) {
      event.preventDefault();
      if (!busy && value.trim()) {
        void add();
      }
    }
  }

  const detected =
    input.kind === "links"
      ? text.asLinks(input.urls.length)
      : input.kind === "text"
        ? text.asText
        : "";

  return (
    <form
      className="quick-add"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void add();
      }}
    >
      <div className="quick-add-head">
        <span className="quick-add-badge" aria-hidden="true">
          <Icon name="bolt" size={22} />
        </span>
        <div>
          <label htmlFor="quick-add-input">{text.label}</label>
          <p className="quick-add-lead">{text.lead}</p>
        </div>
      </div>
      <div className="quick-add-row">
        <textarea
          id="quick-add-input"
          ref={field}
          rows={1}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            // What was saved last no longer describes the field.
            setStatus("");
            setError("");
          }}
          onKeyDown={onKey}
          placeholder={text.placeholder}
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          aria-describedby="quick-add-hint"
          aria-invalid={error ? true : undefined}
        />
        <button className="button primary" disabled={busy || !value.trim()}>
          <Icon name="plus" size={18} />
          {busy ? text.adding : text.add}
        </button>
      </div>
      {error ? (
        <small className="field-error" role="alert">
          {error}
        </small>
      ) : (
        <small
          id="quick-add-hint"
          className={`quick-add-hint ${status ? "is-saved" : detected ? "is-detected" : ""}`}
          aria-live="polite"
        >
          {status ? (
            <Icon name="check" size={15} />
          ) : input.kind === "links" ? (
            <Icon name="link" size={15} />
          ) : input.kind === "text" ? (
            <Icon name="text" size={15} />
          ) : null}
          {status || detected || text.hint}
          {!status && value.trim() && <span className="quick-add-keys"> · {text.keys}</span>}
        </small>
      )}
    </form>
  );
}

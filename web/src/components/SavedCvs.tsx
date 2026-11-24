import { useEffect, useState } from "react";
import {
  SAVED_CV_LIMITS,
  toApiError,
  type AssmaApi,
  type Experience,
  type SavedCv,
} from "@assma/shared";
import { draftOf, sameDraft, type Draft } from "../lib/cvDraft";
import type { Preferences } from "../lib/preferences";

type Mode = "idle" | "create" | "rename" | "delete";

/**
 * Named CV configurations of the account: load one into the draft, save the draft as a new
 * one, or update, rename and delete the selected one. Loading only changes the draft; the
 * project keeps it once the person saves the draft.
 */
export function SavedCvs({
  api,
  experience,
  draft,
  text,
  onLoad,
  onError,
}: {
  api: AssmaApi;
  experience: Experience;
  draft: Draft;
  text: Preferences["copy"]["cv"];
  onLoad: (draft: Draft) => void;
  onError: (failure: unknown) => void;
}) {
  const [saved, setSaved] = useState<SavedCv[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("idle");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [problem, setProblem] = useState("");

  useEffect(() => {
    let active = true;
    api
      .savedCvs()
      .then((list) => {
        if (!active) {
          return;
        }
        setSaved(list);
        // The configuration this draft came from, if it still matches one.
        const matching = list.find((entry) => sameDraft(draftOf(entry.cv, experience), draft));
        setSelectedId(matching?.id ?? null);
      })
      .catch((failure: unknown) => active && onError(failure));
    return () => {
      active = false;
    };
    // Loaded once per page; later changes come from this component.
  }, [api]);

  const selected = saved?.find((entry) => entry.id === selectedId) ?? null;
  const changed = selected ? !sameDraft(draftOf(selected.cv, experience), draft) : false;
  const limitReached = (saved?.length ?? 0) >= SAVED_CV_LIMITS.perAccount;

  const reset = (next: string) => {
    setMode("idle");
    setName("");
    setProblem("");
    setMessage(next);
  };

  const sortByName = (list: SavedCv[]) =>
    [...list].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setProblem("");
    try {
      await action();
    } catch (failure) {
      const code = toApiError(failure).code;
      if (code === "name_taken") {
        setProblem(text.savedNameTaken);
      } else if (code === "saved_cv_limit") {
        setProblem(text.savedLimit(SAVED_CV_LIMITS.perAccount));
      } else {
        onError(failure);
      }
    } finally {
      setBusy(false);
    }
  }

  const load = (id: string) => {
    const entry = saved?.find((item) => item.id === id);
    if (!entry) {
      return;
    }
    setSelectedId(entry.id);
    onLoad(draftOf(entry.cv, experience));
    reset(text.savedLoaded(entry.name));
  };

  const submitName = () =>
    run(async () => {
      const trimmed = name.trim();
      if (!trimmed) {
        return;
      }
      if (mode === "rename" && selected) {
        const updated = await api.updateSavedCv(selected.id, { name: trimmed, cv: selected.cv });
        setSaved((list) =>
          sortByName((list ?? []).map((entry) => (entry.id === updated.id ? updated : entry))),
        );
        reset(text.savedStored(updated.name));
        return;
      }
      const created = await api.createSavedCv({ name: trimmed, cv: draft });
      setSaved((list) => sortByName([...(list ?? []), created]));
      setSelectedId(created.id);
      reset(text.savedStored(created.name));
    });

  const update = () =>
    run(async () => {
      if (!selected) {
        return;
      }
      const updated = await api.updateSavedCv(selected.id, { name: selected.name, cv: draft });
      setSaved((list) => (list ?? []).map((entry) => (entry.id === updated.id ? updated : entry)));
      reset(text.savedStored(updated.name));
    });

  const remove = () =>
    run(async () => {
      if (!selected) {
        return;
      }
      await api.deleteSavedCv(selected.id);
      setSaved((list) => (list ?? []).filter((entry) => entry.id !== selected.id));
      setSelectedId(null);
      reset(text.savedDeleted(selected.name));
    });

  return (
    <section className="saved-cvs" aria-labelledby="saved-cvs-title">
      <h3 id="saved-cvs-title" className="section-title">
        {text.savedTitle}
      </h3>
      <p className="muted small">{text.savedHint}</p>
      {saved === null ? null : saved.length === 0 ? (
        <p className="muted small">{text.savedNone}</p>
      ) : (
        <label className="saved-cvs-choose">
          <span className="visually-hidden">{text.savedChoose}</span>
          <select
            className="select-field"
            value={selectedId ?? ""}
            onChange={(event) => load(event.target.value)}
            disabled={busy}
          >
            <option value="" disabled>
              {text.savedPlaceholder}
            </option>
            {saved.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {selected && changed && mode === "idle" && (
        <p className="muted small saved-cvs-changed">{text.savedChanged}</p>
      )}

      {mode === "create" || mode === "rename" ? (
        <form
          className="saved-cvs-form"
          onSubmit={(event) => {
            event.preventDefault();
            void submitName();
          }}
        >
          <label>
            <span className="visually-hidden">{text.savedName}</span>
            <input
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setProblem("");
              }}
              placeholder={text.savedNamePlaceholder}
              maxLength={SAVED_CV_LIMITS.name}
              aria-label={text.savedName}
              aria-invalid={problem ? true : undefined}
              autoFocus
            />
          </label>
          <button type="submit" className="button" disabled={busy || !name.trim()}>
            {mode === "create" ? text.saveAsNew : text.savedRename}
          </button>
          <button type="button" className="pill" onClick={() => reset("")} disabled={busy}>
            {text.cancel}
          </button>
        </form>
      ) : mode === "delete" && selected ? (
        <div className="saved-cvs-form" role="group">
          <span>{text.savedConfirmDelete(selected.name)}</span>
          <button
            type="button"
            className="pill danger"
            onClick={() => void remove()}
            disabled={busy}
          >
            {text.savedDelete}
          </button>
          <button type="button" className="pill" onClick={() => reset("")} disabled={busy}>
            {text.cancel}
          </button>
        </div>
      ) : (
        <div className="saved-cvs-actions">
          {selected && (
            <button
              type="button"
              className="pill"
              onClick={() => void update()}
              disabled={busy || !changed}
            >
              {text.savedUpdate}
            </button>
          )}
          <button
            type="button"
            className="pill"
            onClick={() => {
              setMode("create");
              setName("");
              setMessage("");
            }}
            disabled={busy || saved === null || limitReached}
          >
            {text.saveAsNew}
          </button>
          {selected && (
            <>
              <button
                type="button"
                className="pill"
                onClick={() => {
                  setMode("rename");
                  setName(selected.name);
                  setMessage("");
                }}
                disabled={busy}
              >
                {text.savedRename}
              </button>
              <button
                type="button"
                className="pill"
                onClick={() => {
                  setMode("delete");
                  setMessage("");
                }}
                disabled={busy}
              >
                {text.savedDelete}
              </button>
            </>
          )}
        </div>
      )}
      {problem && (
        <p className="field-error" role="alert">
          {problem}
        </p>
      )}
      {limitReached && mode === "idle" && (
        <p className="muted small">{text.savedLimit(SAVED_CV_LIMITS.perAccount)}</p>
      )}
      <p className="muted small" aria-live="polite">
        {message}
      </p>
    </section>
  );
}

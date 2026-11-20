import { useEffect, useRef, useState } from "react";
import {
  CV_IMPORT_LIMITS,
  cvImportRequestSchema,
  estimateCvSeconds,
  formatPeriod,
  isKnownReference,
  referenceInputSchema,
  suggestionInput,
  toApiError,
  type CvImportJob,
  type Experience,
  type ExperienceProfile,
  type ProfileInput,
  type ReferenceSuggestion,
} from "@assma/shared";
import { extractCvText, ExtractionError } from "../lib/cvText";
import { setFlash } from "../lib/flash";
import type { Preferences } from "../lib/preferences";
import { linkHandler, navigate } from "../lib/router";
import type { Session } from "../lib/session";
import { PencilIcon, ReferenceForm } from "./ExperiencePage";

type Step = "choose" | "extracting" | "reading" | "review";
type Reviewed = ReferenceSuggestion & { key: number; selected: boolean; known: boolean };

const JOB_KEY = "assma.cvImport";
const PROFILE_FIELDS = ["name", "headline", "location", "email", "summary"] as const;

// The running job survives a reload in this tab; storage may be unavailable.
function remember(value: { id: string; text: string } | null): void {
  try {
    if (value) {
      sessionStorage.setItem(JOB_KEY, JSON.stringify(value));
    } else {
      sessionStorage.removeItem(JOB_KEY);
    }
  } catch {
    // Without storage a reload simply starts over.
  }
}

function remembered(): { id: string; text: string } | null {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(JOB_KEY) ?? "null");
    if (
      value &&
      typeof value === "object" &&
      "id" in value &&
      "text" in value &&
      typeof value.id === "string" &&
      typeof value.text === "string"
    ) {
      return { id: value.id, text: value.text };
    }
  } catch {
    // Ignore unreadable storage.
  }
  return null;
}

const valid = (suggestion: ReferenceSuggestion) =>
  referenceInputSchema.safeParse(suggestionInput(suggestion)).success;

/** Profile fields the import would fill: only those still empty in the saved profile. */
function profileFill(suggested: ProfileInput, saved: ExperienceProfile): Partial<ProfileInput> {
  const fill: Partial<ProfileInput> = {};
  for (const field of PROFILE_FIELDS) {
    const value = suggested[field];
    if (value && (saved.updatedAt === null || !saved[field])) {
      fill[field] = value;
    }
  }
  return fill;
}

export function CvImportPage({
  session,
  preferences,
}: {
  session: Session;
  preferences: Preferences;
}) {
  const { copy, locale } = preferences;
  const text = copy.cvImport;
  const { api, signOut } = session;
  const [step, setStep] = useState<Step>("choose");
  const [available, setAvailable] = useState<boolean | null>(null);
  const [experience, setExperience] = useState<Experience | null>(null);
  const [source, setSource] = useState("");
  const [pasted, setPasted] = useState("");
  const [job, setJob] = useState<CvImportJob | null>(null);
  const [suggestions, setSuggestions] = useState<Reviewed[]>([]);
  const [profile, setProfile] = useState<Partial<ProfileInput>>({});
  const [useProfile, setUseProfile] = useState(true);
  const [editing, setEditing] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [now, setNow] = useState(Date.now());
  const fileInput = useRef<HTMLInputElement>(null);

  function fail(failure: unknown, fallback = copy.common.error) {
    const apiError = toApiError(failure);
    if (apiError.isUnauthorized) {
      signOut(copy.common.sessionExpired);
      return;
    }
    if (apiError.status === 413) {
      setError(text.tooLong);
      return;
    }
    const messages: Record<string, string> = {
      too_many_attempts: text.tooMany,
      reference_limit: copy.experience.referenceLimit,
      not_found: text.expired,
    };
    setError(messages[apiError.code] ?? fallback);
  }

  useEffect(() => {
    let active = true;
    Promise.all([api.cvImportStatus(), api.experience()])
      .then(([status, current]) => {
        if (!active) {
          return;
        }
        setAvailable(status.available);
        setExperience(current);
        const previous = remembered();
        if (previous) {
          setSource(previous.text);
          setJob({ id: previous.id } as CvImportJob);
          setStep("reading");
        }
      })
      .catch((failure: unknown) => active && fail(failure));
    return () => {
      active = false;
    };
  }, [api]);

  // Poll the job every two seconds while the model reads.
  useEffect(() => {
    if (step !== "reading" || !job || !experience) {
      return;
    }
    let active = true;
    const poll = async () => {
      try {
        const next = await api.cvImport(job.id);
        if (!active) {
          return;
        }
        setJob(next);
        if (next.state === "done" && next.suggestions) {
          remember(null);
          review(next, experience);
        } else if (next.state === "failed") {
          remember(null);
          setError(next.error === "timeout" ? text.timeout : text.failed);
          setStep("choose");
        }
      } catch (failure) {
        if (active) {
          remember(null);
          fail(failure);
          setStep("choose");
        }
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 2000);
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    // Background tabs slow timers down; catch up as soon as the tab is visible again.
    const visible = () => {
      if (document.visibilityState === "visible") {
        setNow(Date.now());
        void poll();
      }
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.clearInterval(clock);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [step, job?.id, experience]);

  function review(finished: CvImportJob, current: Experience) {
    const found = finished.suggestions?.references ?? [];
    setSuggestions(
      found.map((suggestion, key) => {
        const known = isKnownReference(suggestion, current.references);
        return { ...suggestion, key, known, selected: !known && valid(suggestion) };
      }),
    );
    const fill = profileFill(finished.suggestions!.profile, current.profile);
    setProfile(fill);
    setUseProfile(Object.keys(fill).length > 0);
    setStep("review");
  }

  async function start(cvText: string) {
    const request = cvImportRequestSchema.safeParse({ text: cvText });
    if (!request.success) {
      const issue = request.error.issues[0]?.message;
      setError(issue === "too_long" ? text.tooLong : text.tooShort);
      setStep("choose");
      return;
    }
    setError("");
    setSource(request.data.text);
    try {
      const started = await api.startCvImport({ text: request.data.text });
      remember({ id: started.id, text: request.data.text });
      setJob(started);
      setStep("reading");
    } catch (failure) {
      fail(failure, text.failed);
      setStep("choose");
    }
  }

  async function readFile(file: File) {
    setError("");
    setStep("extracting");
    try {
      await start(await extractCvText(file));
    } catch (failure) {
      if (failure instanceof ExtractionError) {
        setError(text[failure.problem]);
      } else {
        setError(copy.common.error);
      }
      setStep("choose");
    }
  }

  async function cancel() {
    if (job) {
      await api.cancelCvImport(job.id).catch(() => undefined);
    }
    remember(null);
    setJob(null);
    setStep("choose");
  }

  async function apply() {
    const chosen = suggestions.filter((suggestion) => suggestion.selected && valid(suggestion));
    const includeProfile = useProfile && Object.keys(profile).length > 0;
    if (chosen.length === 0 && !includeProfile) {
      setError(text.nothingSelected);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await api.applyCvImport({
        profile: includeProfile ? profile : null,
        references: chosen.map(suggestionInput),
      });
      setFlash(copy.experience.imported(result.references, result.profileFields.length));
      navigate("/experience");
    } catch (failure) {
      fail(failure);
    } finally {
      setBusy(false);
    }
  }

  const back = (
    <a className="link" href="/experience" onClick={linkHandler("/experience")}>
      ← {text.back}
    </a>
  );

  if (step === "review") {
    const period = (suggestion: ReferenceSuggestion) =>
      suggestion.start
        ? formatPeriod(
            suggestion.start,
            suggestion.ongoing ? null : (suggestion.end ?? suggestion.start),
            locale,
            copy.experience.today,
          )
        : "";
    const selectedCount =
      suggestions.filter((suggestion) => suggestion.selected).length +
      (useProfile && Object.keys(profile).length > 0 ? 1 : 0);
    return (
      <div className="page wide">
        {back}
        <h1>{text.reviewTitle}</h1>
        <p className="lead">{text.reviewLead}</p>
        {error && (
          <p className="alert error" role="alert">
            {error}
          </p>
        )}
        <div className="import-grid">
          <section className="card" aria-labelledby="source-title">
            <h2 id="source-title">{text.sourceTitle}</h2>
            <pre className="source-document">{source}</pre>
          </section>
          <section className="card" aria-labelledby="suggestions-title">
            <h2 id="suggestions-title">{text.suggestionsTitle}</h2>
            {suggestions.length === 0 && <p className="muted">{text.nothingFound}</p>}
            <ul className="suggestion-list">
              <li className="suggestion">
                {Object.keys(profile).length > 0 ? (
                  <label className="suggestion-choice">
                    <input
                      type="checkbox"
                      checked={useProfile}
                      onChange={(event) => setUseProfile(event.target.checked)}
                    />
                    <span>
                      <strong>{text.profileSuggestion}</strong>
                      <span className="muted small">{text.profileFillHint}</span>
                      {PROFILE_FIELDS.filter((field) => profile[field]).map((field) => (
                        <span key={field} className="suggestion-detail">
                          {copy.experience[field]}: {profile[field]}
                        </span>
                      ))}
                    </span>
                  </label>
                ) : (
                  <p className="muted small">{text.profileNothing}</p>
                )}
              </li>
              {suggestions.map((suggestion) => {
                const ready = valid(suggestion);
                const update = (changes: Partial<Reviewed>) =>
                  setSuggestions((current) =>
                    current.map((item) =>
                      item.key === suggestion.key ? { ...item, ...changes } : item,
                    ),
                  );
                if (editing === suggestion.key) {
                  return (
                    <li key={suggestion.key} className="suggestion">
                      <ReferenceForm
                        title={suggestion.organization || suggestion.role}
                        initial={{ ...suggestion, start: suggestion.start ?? "" }}
                        copy={copy}
                        onSave={async (input) => {
                          const parsed = referenceInputSchema.parse(input);
                          update({
                            ...parsed,
                            end: parsed.end,
                            ongoing: parsed.end === null,
                            selected: true,
                          });
                          setEditing(null);
                        }}
                        onCancel={() => setEditing(null)}
                        onFailure={() => setError(copy.common.error)}
                      />
                    </li>
                  );
                }
                return (
                  <li key={suggestion.key} className="suggestion">
                    <label className="suggestion-choice">
                      <input
                        type="checkbox"
                        checked={suggestion.selected}
                        disabled={!ready}
                        onChange={(event) => update({ selected: event.target.checked })}
                      />
                      <span>
                        <strong>{suggestion.organization || "—"}</strong>
                        <span>
                          {[suggestion.role, period(suggestion)].filter(Boolean).join(" · ")}
                        </span>
                        {suggestion.skills.length > 0 && (
                          <span className="muted small">{suggestion.skills.join(" · ")}</span>
                        )}
                        {suggestion.known && <span className="tag">{text.known}</span>}
                        {!ready && <span className="tag warn">{text.needsReview}</span>}
                      </span>
                    </label>
                    <button
                      type="button"
                      className="icon-button small-button"
                      onClick={() => setEditing(suggestion.key)}
                      aria-label={`${text.edit}: ${suggestion.organization}`}
                      title={text.edit}
                    >
                      <PencilIcon />
                    </button>
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              className="button full"
              onClick={() => void apply()}
              disabled={busy || editing !== null || selectedCount === 0}
            >
              {busy ? copy.common.working : text.apply}
            </button>
            <button type="button" className="link" onClick={() => void cancel()}>
              {text.startOver}
            </button>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      {back}
      <h1>{text.title}</h1>
      <p className="lead">{text.lead}</p>
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      {available === false && (
        <p className="alert error" role="alert">
          {text.unavailable}
        </p>
      )}
      {step === "reading" || step === "extracting" ? (
        <section className="card progress-card" aria-live="polite">
          <div className="spinner" aria-hidden="true" />
          <div>
            <h2>
              {step === "extracting"
                ? text.extracting
                : job?.state === "queued" && job.position > 0
                  ? text.queued(job.position)
                  : text.reading}
            </h2>
            {step === "reading" && (
              <>
                <p className="muted">
                  {(() => {
                    const estimate = estimateCvSeconds(source.length);
                    return text.readingHint(
                      Math.max(1, Math.round(estimate.min / 60)),
                      Math.max(1, Math.ceil(estimate.max / 60)),
                    );
                  })()}
                </p>
                <p>
                  {job && job.parts > 1 && job.part > 0 && (
                    <strong>{text.part(job.part, job.parts)} · </strong>
                  )}
                  {text.found(job?.found ?? 0)}{" "}
                  {job?.startedAt && (
                    <span className="muted">
                      ·{" "}
                      {text.elapsed(
                        Math.max(0, Math.round((now - Date.parse(job.startedAt)) / 1000)),
                      )}
                    </span>
                  )}
                </p>
                <button type="button" className="pill" onClick={() => void cancel()}>
                  {text.cancel}
                </button>
              </>
            )}
          </div>
        </section>
      ) : (
        <section className="card" aria-labelledby="choose-title">
          <h2 id="choose-title">{text.chooseTitle}</h2>
          <p className="muted">{text.chooseLead}</p>
          <div
            className={`dropzone ${dragging ? "active" : ""}`}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              const file = event.dataTransfer.files[0];
              if (file && available) {
                void readFile(file);
              }
            }}
          >
            <button
              type="button"
              className="button"
              disabled={!available}
              onClick={() => fileInput.current?.click()}
            >
              {text.chooseFile}
            </button>
            <span className="muted">{text.dropHint}</span>
            <input
              ref={fileInput}
              type="file"
              hidden
              accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) {
                  void readFile(file);
                }
              }}
            />
          </div>
          <form
            className="form compact"
            onSubmit={(event) => {
              event.preventDefault();
              void start(pasted);
            }}
          >
            <label>
              {text.pasteLabel}
              <textarea
                value={pasted}
                onChange={(event) => setPasted(event.target.value)}
                rows={8}
                maxLength={CV_IMPORT_LIMITS.text + 2000}
              />
            </label>
            <div className="form-actions">
              <button
                className="button"
                disabled={!available || pasted.trim().length < CV_IMPORT_LIMITS.minText}
              >
                {text.read}
              </button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}

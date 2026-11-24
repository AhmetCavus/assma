import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "../components/Icon";
import {
  COMPENSATION_UNITS,
  CONTRACT_TYPES,
  TRAVEL_LEVELS,
  UNKNOWN_CONDITIONS,
  type CompensationUnit,
  type ProjectConditions,
  parseLines,
  parseSkills,
  PROJECT_LIMITS,
  PROJECT_STATUSES,
  projectInputSchema,
  toApiError,
  type ListingJob,
  type ListingSuggestions,
  type Project,
  type ProjectInput,
  type ProjectStatus,
} from "@assma/shared";
import { setAutoAssess, setFlash } from "../lib/flash";
import type { Preferences } from "../lib/preferences";
import { projectsChanged } from "../lib/projects";
import { takeSeed } from "../lib/seed";
import { linkHandler, navigate } from "../lib/router";
import type { Session } from "../lib/session";

type Draft = {
  title: string;
  company: string;
  agency: string;
  contact: string;
  contactEmail: string;
  sourceUrl: string;
  brief: string;
  tech: string;
  required: string;
  preferred: string;
  terms: string;
};

const EMPTY: Draft = {
  title: "",
  company: "",
  agency: "",
  contact: "",
  contactEmail: "",
  sourceUrl: "",
  brief: "",
  tech: "",
  required: "",
  preferred: "",
  terms: "",
};

function draftOf(project: Project): Draft {
  return {
    // A draft's title is only a stand-in, so the suggestion may replace it.
    title: project.draft ? "" : project.title,
    company: project.company,
    agency: project.agency,
    contact: project.contact,
    contactEmail: project.contactEmail,
    sourceUrl: project.sourceUrl,
    brief: project.brief,
    tech: project.tech.join(", "),
    required: project.required.join("\n"),
    preferred: project.preferred.join("\n"),
    terms: project.terms,
  };
}

function inputOf(draft: Draft): ProjectInput {
  return {
    title: draft.title,
    company: draft.company,
    agency: draft.agency,
    contact: draft.contact,
    contactEmail: draft.contactEmail,
    sourceUrl: draft.sourceUrl,
    brief: draft.brief,
    tech: parseSkills(draft.tech),
    required: parseLines(draft.required),
    preferred: parseLines(draft.preferred),
    terms: draft.terms,
  };
}

/** Suggested conditions fill only what is still unknown. */
function withConditions(
  current: ProjectConditions,
  suggested: ProjectConditions,
): ProjectConditions {
  const keep = <T,>(value: T | null, next: T | null) => (value === null ? next : value);
  return {
    compensation: keep(current.compensation, suggested.compensation),
    contract: keep(current.contract, suggested.contract),
    remote: keep(current.remote, suggested.remote),
    months: keep(current.months, suggested.months),
    hoursPerWeek: keep(current.hoursPerWeek, suggested.hoursPerWeek),
    start: keep(current.start, suggested.start),
    onsite: current.onsite || suggested.onsite,
    travel: keep(current.travel, suggested.travel),
  };
}

/** Empty fields mean unknown; nothing is filled in on the person's behalf. */
function ConditionsFields({
  conditions,
  onChange,
  preferences,
  error,
}: {
  conditions: ProjectConditions;
  onChange: (next: ProjectConditions) => void;
  preferences: Preferences;
  error: string;
}) {
  const text = preferences.copy.capture.conditions;
  const contracts = preferences.copy.assessment.contracts;
  const set = (change: Partial<ProjectConditions>) => onChange({ ...conditions, ...change });
  const number = (value: string) => (value.trim() === "" ? null : Number(value));
  const compensation = conditions.compensation;
  return (
    <fieldset className="conditions-fields">
      <legend>{text.title}</legend>
      {error ? (
        <small className="field-error" role="alert">
          {text.invalid}
        </small>
      ) : (
        <small className="muted">{text.hint}</small>
      )}
      <div className="form-row">
        <label>
          {text.amount}
          <input
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            value={compensation?.amount ?? ""}
            onChange={(event) => {
              const amount = number(event.target.value);
              set({
                compensation:
                  amount && amount > 0
                    ? {
                        amount,
                        unit: compensation?.unit ?? "hour",
                        currency: compensation?.currency ?? "EUR",
                      }
                    : null,
              });
            }}
          />
        </label>
        <label>
          {text.unit}
          <select
            className="select-field"
            value={compensation?.unit ?? "hour"}
            disabled={!compensation}
            onChange={(event) =>
              compensation &&
              set({
                compensation: { ...compensation, unit: event.target.value as CompensationUnit },
              })
            }
          >
            {COMPENSATION_UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {text.units[unit]}
              </option>
            ))}
          </select>
        </label>
        <label>
          {text.currency}
          <input
            value={compensation?.currency ?? "EUR"}
            maxLength={3}
            disabled={!compensation}
            onChange={(event) =>
              compensation &&
              set({ compensation: { ...compensation, currency: event.target.value.toUpperCase() } })
            }
          />
        </label>
      </div>
      <div className="form-row">
        <label>
          {text.contract}
          <select
            className="select-field"
            value={conditions.contract ?? ""}
            onChange={(event) =>
              set({ contract: (event.target.value || null) as ProjectConditions["contract"] })
            }
          >
            <option value="">{text.unknown}</option>
            {CONTRACT_TYPES.map((contract) => (
              <option key={contract} value={contract}>
                {contracts[contract]}
              </option>
            ))}
          </select>
        </label>
        <label>
          {text.remote}
          <input
            type="number"
            min={0}
            max={100}
            value={conditions.remote ?? ""}
            onChange={(event) => set({ remote: number(event.target.value) })}
          />
        </label>
      </div>
      <div className="form-row">
        <label>
          {text.months}
          <input
            type="number"
            min={1}
            max={120}
            value={conditions.months ?? ""}
            onChange={(event) => set({ months: number(event.target.value) })}
          />
        </label>
        <label>
          {text.hours}
          <input
            type="number"
            min={1}
            max={80}
            value={conditions.hoursPerWeek ?? ""}
            onChange={(event) => set({ hoursPerWeek: number(event.target.value) })}
          />
        </label>
      </div>
      <div className="form-row">
        <label>
          {text.start}
          <input
            type="date"
            value={conditions.start ?? ""}
            onChange={(event) => set({ start: event.target.value || null })}
          />
        </label>
        <label>
          {text.travel}
          <select
            className="select-field"
            value={conditions.travel ?? ""}
            onChange={(event) =>
              set({ travel: (event.target.value || null) as ProjectConditions["travel"] })
            }
          >
            <option value="">{text.unknown}</option>
            {TRAVEL_LEVELS.map((level) => (
              <option key={level} value={level}>
                {text.travelLevels[level]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        {text.onsite}
        <input
          value={conditions.onsite}
          maxLength={PROJECT_LIMITS.terms}
          onChange={(event) => set({ onsite: event.target.value })}
        />
      </label>
    </fieldset>
  );
}

/** Suggestions fill only fields that are still empty, so nothing typed is overwritten. */
function withSuggestions(draft: Draft, suggestions: ListingSuggestions): Draft {
  const fill = (current: string, value: string) => (current.trim() ? current : value);
  return {
    ...draft,
    title: fill(draft.title, suggestions.title),
    company: fill(draft.company, suggestions.company),
    agency: fill(draft.agency, suggestions.agency),
    contact: fill(draft.contact, suggestions.contact),
    contactEmail: fill(draft.contactEmail, suggestions.contactEmail),
    tech: fill(draft.tech, suggestions.tech.join(", ")),
    required: fill(draft.required, suggestions.required.join("\n")),
    preferred: fill(draft.preferred, suggestions.preferred.join("\n")),
    terms: fill(draft.terms, suggestions.terms),
  };
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label>
      {label}
      {children}
      {error ? (
        <small className="field-error" role="alert">
          {error}
        </small>
      ) : (
        hint && <small className="muted">{hint}</small>
      )}
    </label>
  );
}

export function ProjectEditorPage({
  id,
  session,
  preferences,
}: {
  id: string | null;
  session: Session;
  preferences: Preferences;
}) {
  const { copy } = preferences;
  const text = copy.capture;
  const { api, signOut } = session;
  const [project, setProject] = useState<Project | null>(null);
  const [conditions, setConditions] = useState<ProjectConditions>(UNKNOWN_CONDITIONS);
  const [draft, setDraft] = useState<Draft>(() =>
    id !== null ? EMPTY : { ...EMPTY, ...takeSeed() },
  );
  const [mode, setMode] = useState<"suggest" | "manual">("suggest");
  const [suggested, setSuggested] = useState(false);
  const [job, setJob] = useState<ListingJob | null>(null);
  const [loadingLink, setLoadingLink] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const editing = id !== null;
  const processing = project?.draft ?? false;
  const autoRead = useRef(false);

  function fail(failure: unknown, fallback = copy.common.error) {
    const apiError = toApiError(failure);
    if (apiError.isUnauthorized) {
      signOut(copy.common.sessionExpired);
      return;
    }
    if (apiError.code.startsWith("listing_")) {
      const reason = apiError.code.slice("listing_".length) as keyof typeof text.fetch;
      setError(text.fetch[reason] ?? text.fetch.unreachable);
      return;
    }
    const messages: Record<string, string> = {
      too_many_attempts: text.tooMany,
      project_limit: copy.projects.projectLimit,
      not_found: text.notFound,
    };
    setError(messages[apiError.code] ?? fallback);
  }

  useEffect(() => {
    if (!id) {
      return;
    }
    let active = true;
    api
      .project(id)
      .then((loaded) => {
        if (active) {
          setProject(loaded);
          setDraft(draftOf(loaded));
          setConditions(loaded.conditions);
        }
      })
      .catch((failure: unknown) => active && fail(failure));
    return () => {
      active = false;
    };
  }, [api, id]);

  // Poll the suggestion job every two seconds, and at once when the tab is visible again.
  useEffect(() => {
    if (!job || job.state === "done" || job.state === "failed") {
      return;
    }
    let active = true;
    const poll = async () => {
      try {
        const next = await api.listingSuggestion(job.id);
        if (!active) {
          return;
        }
        if (next.state === "done" && next.suggestions) {
          setDraft((current) => withSuggestions(current, next.suggestions!));
          setConditions((current) => withConditions(current, next.suggestions!.conditions));
          setSuggested(true);
          setStatus(text.suggested);
          setJob(null);
        } else if (next.state === "failed") {
          setError(
            next.error === "timeout"
              ? text.suggestTimeout
              : next.error === "model_unavailable"
                ? text.modelUnavailable
                : text.suggestFailed,
          );
          setJob(null);
        } else {
          setJob(next);
        }
      } catch (failure) {
        if (active) {
          fail(failure, text.suggestFailed);
          setJob(null);
        }
      }
    };
    const timer = window.setInterval(() => void poll(), 2000);
    const visible = () => document.visibilityState === "visible" && void poll();
    document.addEventListener("visibilitychange", visible);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [job?.id]);

  // A draft is read as soon as it is opened: pasted text directly, a bare link after loading.
  useEffect(() => {
    if (processing && !autoRead.current && (draft.brief.trim() || draft.sourceUrl)) {
      autoRead.current = true;
      void suggest();
    }
  }, [processing, draft.brief, draft.sourceUrl]);

  const set = (field: keyof Draft) => (event: { target: { value: string } }) =>
    setDraft((current) => ({ ...current, [field]: event.target.value }));

  async function loadLink(): Promise<string | null> {
    const url = draft.sourceUrl.trim();
    if (!url) {
      setError(text.needText);
      return null;
    }
    setError("");
    setStatus("");
    setLoadingLink(true);
    try {
      const result = await api.fetchListing({ url });
      setDraft((current) => ({ ...current, sourceUrl: result.url, brief: result.text }));
      setStatus(text.loaded);
      return result.text;
    } catch (failure) {
      fail(failure);
      return null;
    } finally {
      setLoadingLink(false);
    }
  }

  async function suggest() {
    setError("");
    setStatus("");
    let brief = draft.brief.trim();
    if (!brief && draft.sourceUrl.trim()) {
      brief = (await loadLink()) ?? "";
      if (!brief) {
        return;
      }
    }
    if (!brief) {
      setError(text.needText);
      return;
    }
    if (brief.length < PROJECT_LIMITS.minBrief) {
      setError(text.tooShort);
      return;
    }
    if (brief.length > PROJECT_LIMITS.brief) {
      setError(text.tooLong);
      return;
    }
    try {
      setJob(await api.suggestListing({ text: brief }));
    } catch (failure) {
      fail(failure, text.suggestFailed);
    }
  }

  async function cancelSuggestion() {
    if (job) {
      await api.cancelListingSuggestion(job.id).catch(() => undefined);
    }
    setJob(null);
  }

  async function save() {
    const parsed = projectInputSchema.safeParse({ ...inputOf(draft), conditions });
    if (!parsed.success) {
      const messages: Record<string, string> = {
        required: text.required_,
        invalid_url: text.invalidUrl,
        invalid_email: text.invalidEmail,
      };
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? "");
        next[field] ??=
          messages[issue.message] ?? (field === "brief" ? text.tooLong : text.required_);
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setError("");
    setBusy(true);
    try {
      if (project?.draft) {
        // A processed draft continues like a new project: on to the fit check.
        const saved = await api.updateProject(project.id, parsed.data);
        projectsChanged();
        setAutoAssess(saved.id);
        navigate(`/projects/${saved.id}`);
      } else if (project) {
        const saved = await api.updateProject(project.id, parsed.data);
        setProject(saved);
        setDraft(draftOf(saved));
        setConditions(saved.conditions);
        setStatus(text.saved);
        projectsChanged();
      } else {
        const created = await api.createProject(parsed.data);
        projectsChanged();
        setAutoAssess(created.id);
        navigate(`/projects/${created.id}`);
      }
    } catch (failure) {
      fail(failure);
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(next: ProjectStatus) {
    if (!project) {
      return;
    }
    try {
      setProject(await api.changeProject(project.id, { status: next }));
      setStatus(copy.projects.statusChanged);
      projectsChanged();
    } catch (failure) {
      fail(failure);
    }
  }

  async function toggleArchive() {
    if (!project) {
      return;
    }
    try {
      setProject(await api.changeProject(project.id, { archived: !project.archived }));
      setStatus(project.archived ? copy.projects.restored : copy.projects.archived);
      projectsChanged();
    } catch (failure) {
      fail(failure);
    }
  }

  async function remove() {
    if (!project || !window.confirm(copy.projects.confirmDelete(project.title))) {
      return;
    }
    try {
      await api.deleteProject(project.id);
      projectsChanged();
      setFlash(copy.projects.deleted);
      navigate("/projects");
    } catch (failure) {
      fail(failure);
    }
  }

  if (editing && !project) {
    return (
      <div className="page wide">
        {error ? (
          <p className="alert error" role="alert">
            {error}
          </p>
        ) : (
          <p className="muted">{copy.common.loading}</p>
        )}
      </div>
    );
  }

  const reading = job !== null;
  const manual = !editing && mode === "manual";

  return (
    <div className="page wide">
      <a
        className="link back-link"
        href={editing ? `/projects/${id}` : "/projects"}
        onClick={linkHandler(editing ? `/projects/${id}` : "/projects")}
      >
        ← {editing ? copy.cv.back : text.toOverview}
      </a>
      <h1>{processing ? text.draftTitle : editing ? text.editTitle : text.title}</h1>
      <p className="lead">{processing ? text.draftLead : text.lead}</p>
      {!editing && (
        <div className="chips" role="tablist" aria-label={text.title}>
          {(["suggest", "manual"] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={mode === option}
              className={`chip ${mode === option ? "selected" : ""}`}
              onClick={() => setMode(option)}
            >
              {option === "suggest" ? text.modeSuggest : text.modeManual}
            </button>
          ))}
        </div>
      )}
      <p className="status" aria-live="polite">
        {status}
      </p>
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className="capture-grid">
          <section className="card" aria-labelledby="source-title">
            <h2 id="source-title">
              {editing ? text.sourceTitle : manual ? text.manualTitle : text.listingTitle}
            </h2>
            <div className="form compact">
              <Field label={text.sourceUrl} error={errors.sourceUrl}>
                <input
                  type="url"
                  value={draft.sourceUrl}
                  onChange={set("sourceUrl")}
                  placeholder="https://"
                  maxLength={PROJECT_LIMITS.sourceUrl}
                  autoCapitalize="none"
                  spellCheck={false}
                />
              </Field>
              <Field label={text.brief} error={errors.brief}>
                <textarea
                  value={draft.brief}
                  onChange={set("brief")}
                  rows={manual ? 6 : 12}
                  maxLength={PROJECT_LIMITS.brief + 1000}
                />
              </Field>
              {manual ? (
                <p className="muted small">{text.manualHint}</p>
              ) : reading ? (
                <div className="inline-progress" aria-live="polite">
                  <div className="spinner" aria-hidden="true" />
                  <div>
                    <strong>
                      {job.state === "queued" && job.position > 0
                        ? text.queued(job.position)
                        : text.suggesting}
                    </strong>
                    <p className="muted small">{text.suggestingHint}</p>
                    <button type="button" className="pill" onClick={() => void cancelSuggestion()}>
                      {text.cancel}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="form-actions">
                  <button
                    type="button"
                    className="pill secondary"
                    onClick={() => void loadLink()}
                    disabled={loadingLink || !draft.sourceUrl.trim()}
                  >
                    {loadingLink ? text.loading : text.loadLink}
                  </button>
                  <button
                    type="button"
                    className="button"
                    onClick={() => void suggest()}
                    disabled={loadingLink}
                  >
                    {text.suggest}
                  </button>
                </div>
              )}
            </div>
          </section>

          <section className="card" aria-labelledby="data-title">
            <div className="card-heading">
              <h2 id="data-title">{text.dataTitle}</h2>
              <span className={`tag ${suggested ? "accent" : ""}`}>
                {suggested ? text.badgeSuggested : text.badgeManual}
              </span>
            </div>
            <div className="form compact">
              <Field label={text.projectTitle} error={errors.title}>
                <input
                  value={draft.title}
                  onChange={set("title")}
                  maxLength={PROJECT_LIMITS.title}
                />
              </Field>
              <Field label={text.company} error={errors.company}>
                <input
                  value={draft.company}
                  onChange={set("company")}
                  maxLength={PROJECT_LIMITS.company}
                />
              </Field>
              <div className="form-row">
                <Field label={text.agency} error={errors.agency}>
                  <input
                    value={draft.agency}
                    onChange={set("agency")}
                    maxLength={PROJECT_LIMITS.agency}
                  />
                </Field>
                <Field label={text.contact} error={errors.contact}>
                  <input
                    value={draft.contact}
                    onChange={set("contact")}
                    maxLength={PROJECT_LIMITS.contact}
                  />
                </Field>
              </div>
              <Field label={text.contactEmail} error={errors.contactEmail}>
                <input
                  type="email"
                  value={draft.contactEmail}
                  onChange={set("contactEmail")}
                  maxLength={PROJECT_LIMITS.contactEmail}
                  autoCapitalize="none"
                  spellCheck={false}
                />
              </Field>
              <Field label={text.tech} hint={text.techHint} error={errors.tech}>
                <input value={draft.tech} onChange={set("tech")} />
              </Field>
              <Field label={text.required} hint={text.listHint} error={errors.required}>
                <textarea value={draft.required} onChange={set("required")} rows={4} />
              </Field>
              <Field label={text.preferred} hint={text.listHint} error={errors.preferred}>
                <textarea value={draft.preferred} onChange={set("preferred")} rows={3} />
              </Field>
              <Field label={text.terms} error={errors.terms}>
                <input
                  value={draft.terms}
                  onChange={set("terms")}
                  maxLength={PROJECT_LIMITS.terms}
                />
              </Field>
              <ConditionsFields
                conditions={conditions}
                onChange={setConditions}
                preferences={preferences}
                error={errors.conditions ? copy.common.error : ""}
              />
              {project && (
                <label>
                  {text.status}
                  <select
                    className="select-field"
                    value={project.status}
                    onChange={(event) => void changeStatus(event.target.value as ProjectStatus)}
                  >
                    {PROJECT_STATUSES.map((option) => (
                      <option key={option} value={option}>
                        {copy.projects.status[option]}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          </section>
        </div>
        <div className="form-actions page-actions">
          <button className="button" disabled={busy || reading}>
            {busy
              ? copy.common.working
              : editing && !processing
                ? text.saveChanges
                : text.saveAndAssess}
          </button>
          <a className="pill" href="/projects" onClick={linkHandler("/projects")}>
            {text.toOverview}
          </a>
          {project && (
            <>
              <button type="button" className="pill tertiary" onClick={() => void toggleArchive()}>
                {project.archived ? copy.projects.restore : copy.projects.toArchive}
              </button>
              <button
                type="button"
                className="button destructive soft compact push-right"
                onClick={() => void remove()}
              >
                <Icon name="trash" size={16} />
                {copy.projects.delete}
              </button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}

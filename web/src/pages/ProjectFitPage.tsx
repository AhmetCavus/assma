import { useEffect, useState } from "react";
import {
  FIT_LIMITS,
  FIT_STATUSES,
  fitBasis,
  fitSummary,
  referenceLabel,
  requirementsOf,
  toApiError,
  type Experience,
  type Finding,
  type FitJob,
  type FitStatus,
  type Project,
} from "@assma/shared";
import { takeAutoAssess } from "../lib/flash";
import type { Preferences } from "../lib/preferences";
import { projectsChanged } from "../lib/projects";
import { linkHandler } from "../lib/router";
import type { Session } from "../lib/session";
import { PencilIcon } from "./ExperiencePage";

export function ProjectFitPage({
  id,
  session,
  preferences,
}: {
  id: string;
  session: Session;
  preferences: Preferences;
}) {
  const { copy, locale } = preferences;
  const text = copy.fit;
  const { api, signOut } = session;
  const [project, setProject] = useState<Project | null>(null);
  const [experience, setExperience] = useState<Experience | null>(null);
  const [job, setJob] = useState<FitJob | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  function fail(failure: unknown) {
    const apiError = toApiError(failure);
    if (apiError.isUnauthorized) {
      signOut(copy.common.sessionExpired);
      return;
    }
    const messages: Record<string, string> = {
      too_many_attempts: text.tooMany,
      not_found: text.notFound,
      reference_required: text.needReference,
    };
    setError(messages[apiError.code] ?? copy.common.error);
  }

  async function startAssessment() {
    setError("");
    setStatus("");
    try {
      setJob(await api.startFit(id));
    } catch (failure) {
      fail(failure);
    }
  }

  useEffect(() => {
    let active = true;
    Promise.all([api.project(id), api.experience()])
      .then(([loadedProject, loadedExperience]) => {
        if (!active) {
          return;
        }
        setProject(loadedProject);
        setExperience(loadedExperience);
        // A project just captured with "save and check fit" is assessed right away.
        if (
          takeAutoAssess(id) &&
          requirementsOf(loadedProject).length > 0 &&
          loadedExperience.references.length > 0
        ) {
          void startAssessment();
        }
      })
      .catch((failure: unknown) => active && fail(failure));
    return () => {
      active = false;
    };
  }, [api, id]);

  useEffect(() => {
    if (!job) {
      return;
    }
    let active = true;
    const poll = async () => {
      try {
        const next = await api.fitJob(id, job.id);
        if (!active) {
          return;
        }
        if (next.state === "done") {
          setJob(null);
          setProject(await api.project(id));
          projectsChanged();
        } else if (next.state === "failed") {
          setJob(null);
          setError(
            next.error === "timeout"
              ? text.timeout
              : next.error === "model_unavailable"
                ? text.modelUnavailable
                : text.failed,
          );
        } else {
          setJob(next);
        }
      } catch (failure) {
        if (active) {
          setJob(null);
          fail(failure);
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

  async function cancel() {
    if (job) {
      await api.cancelFit(id, job.id).catch(() => undefined);
    }
    setJob(null);
  }

  async function correct(index: number, next: FitStatus, referenceIds: string[]) {
    setError("");
    try {
      setProject(await api.changeFinding(id, index, { status: next, referenceIds }));
      setEditing(null);
      setStatus(text.saved);
      projectsChanged();
    } catch (failure) {
      fail(failure);
    }
  }

  if (!project || !experience) {
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

  const references = experience.references;
  const labelOf = (referenceId: string) => {
    const index = references.findIndex((reference) => reference.id === referenceId);
    return index < 0 ? null : referenceLabel(index);
  };
  const fit = project.fit;
  const stale = fit !== null && fit.basis !== fitBasis(project, references);
  const requirements = requirementsOf(project);
  const canAssess = requirements.length > 0 && references.length > 0;
  const subtitle = [project.company, project.agency].filter(Boolean).join(" · ");
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });

  const assessButton = (label: string) => (
    <button
      type="button"
      className="pill"
      onClick={() => void startAssessment()}
      disabled={!canAssess || job !== null}
    >
      {label}
    </button>
  );

  return (
    <div className="page wide">
      <a className="link back-link" href="/projects" onClick={linkHandler("/projects")}>
        ← {text.back}
      </a>
      <div className="page-header">
        <div>
          <h1>{project.title}</h1>
          {subtitle && <p className="lead">{subtitle}</p>}
        </div>
        <div className="header-buttons">
          <a
            className="pill"
            href={`/projects/${id}/edit`}
            onClick={linkHandler(`/projects/${id}/edit`)}
          >
            <PencilIcon />
            {text.edit}
          </a>
          <a
            className="button"
            href={`/projects/${id}/cv`}
            onClick={linkHandler(`/projects/${id}/cv`)}
          >
            <SparkIcon />
            {text.draftCv}
          </a>
        </div>
      </div>
      <p className="status" aria-live="polite">
        {status}
      </p>
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}

      {job ? (
        <section className="card progress-card" aria-live="polite">
          <div className="spinner" aria-hidden="true" />
          <div>
            <h2>
              {job.state === "queued" && job.position > 0
                ? text.queued(job.position)
                : text.assessing}
            </h2>
            <p className="muted">{text.assessingHint}</p>
            <button type="button" className="pill" onClick={() => void cancel()}>
              {text.cancel}
            </button>
          </div>
        </section>
      ) : !fit ? (
        <section className="card">
          <h2>{text.notAssessed}</h2>
          <p className="muted">{text.notAssessedLead}</p>
          {requirements.length === 0 ? (
            <p>
              {text.noRequirements}{" "}
              <a
                className="link"
                href={`/projects/${id}/edit`}
                onClick={linkHandler(`/projects/${id}/edit`)}
              >
                {text.edit}
              </a>
            </p>
          ) : references.length === 0 ? (
            <p>
              {text.noReferences}{" "}
              <a className="link" href="/experience" onClick={linkHandler("/experience")}>
                {text.toExperience}
              </a>
            </p>
          ) : (
            <button type="button" className="button" onClick={() => void startAssessment()}>
              {text.assess}
            </button>
          )}
        </section>
      ) : (
        <>
          {stale && (
            <div className="alert stale" role="status">
              <span>{text.stale}</span>
              {assessButton(text.reassess)}
            </div>
          )}
          <div className="fit-grid">
            <section className="card score-card" aria-labelledby="score-title">
              <h2 id="score-title">{text.scoreTitle}</h2>
              {fit.score === null ? (
                <p className="muted">{text.unscored}</p>
              ) : (
                <>
                  <p className="score">
                    <strong>{fit.score}</strong>
                    <span>{text.outOf}</span>
                  </p>
                  <div className="score-bar" role="img" aria-label={`${fit.score} ${text.outOf}`}>
                    {Array.from({ length: 10 }, (_, index) => (
                      <span key={index} className={index < fit.score! ? "filled" : ""} />
                    ))}
                  </div>
                  <p className="muted small">
                    {text.doubleNote} {text.points(fit.points, fit.maxPoints)}
                  </p>
                </>
              )}
              <p className="muted small">{text.assessed(date.format(new Date(fit.assessedAt)))}</p>
              {!stale && assessButton(text.reassess)}
            </section>
            <section className="card" aria-labelledby="summary-title">
              <h2 id="summary-title">{text.summaryTitle}</h2>
              <h3 className="strengths">{text.strengths}</h3>
              <p>
                {fitSummary(fit)
                  .strengths.map((finding) => finding.requirement)
                  .join(", ") || text.none}
              </p>
              <h3 className="open-points">{text.open}</h3>
              <p>
                {fitSummary(fit)
                  .open.map((finding) => finding.requirement)
                  .join(", ") || text.none}
              </p>
            </section>
          </div>
          <section className="card" aria-labelledby="requirements-title">
            <h2 id="requirements-title">{text.requirementsTitle}</h2>
            <ul className="finding-list">
              {fit.findings.map((finding, index) => (
                <li key={`${index}-${finding.requirement}`} className="finding">
                  {editing === index ? (
                    <FindingEditor
                      finding={finding}
                      references={references}
                      preferences={preferences}
                      onSave={(next, ids) => correct(index, next, ids)}
                      onCancel={() => setEditing(null)}
                    />
                  ) : (
                    <>
                      <div className="finding-requirement">
                        <strong>{finding.requirement}</strong>
                        <span className="muted small">{text.kind[finding.kind]}</span>
                      </div>
                      <div>
                        <span className={`fit-badge fit-${finding.status}`}>
                          {text.status[finding.status]}
                        </span>
                        {finding.edited && <span className="muted small"> · {text.edited}</span>}
                      </div>
                      <div className="finding-evidence">
                        <span>{finding.note}</span>
                        {finding.referenceIds.map((referenceId) => {
                          const label = labelOf(referenceId);
                          return label ? (
                            <span key={referenceId} className="badge">
                              {label}
                            </span>
                          ) : (
                            <span key={referenceId} className="muted small">
                              ({text.removedReference})
                            </span>
                          );
                        })}
                      </div>
                      <button
                        type="button"
                        className="icon-button small-button"
                        onClick={() => setEditing(index)}
                        aria-label={text.correct(finding.requirement)}
                        title={text.correct(finding.requirement)}
                      >
                        <PencilIcon />
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
            {project.terms && (
              <p className="muted terms">
                {text.terms} · {project.terms}
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function FindingEditor({
  finding,
  references,
  preferences,
  onSave,
  onCancel,
}: {
  finding: Finding;
  references: Experience["references"];
  preferences: Preferences;
  onSave: (status: FitStatus, referenceIds: string[]) => Promise<void>;
  onCancel: () => void;
}) {
  const text = preferences.copy.fit;
  const [status, setStatus] = useState<FitStatus>(finding.status);
  const [selected, setSelected] = useState<string[]>(
    finding.referenceIds.filter((id) => references.some((reference) => reference.id === id)),
  );
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (status !== "missing" && selected.length === 0) {
      setProblem(text.needReference);
      return;
    }
    setBusy(true);
    try {
      await onSave(status, status === "missing" ? [] : selected);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="form compact finding-editor"
      aria-label={text.correct(finding.requirement)}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <strong>{finding.requirement}</strong>
      <fieldset className="chips">
        <legend className="visually-hidden">{text.statusLabel}</legend>
        {FIT_STATUSES.map((option) => (
          <label key={option} className={`chip ${status === option ? "selected" : ""}`}>
            <input
              type="radio"
              className="visually-hidden"
              name={`status-${finding.requirement}`}
              checked={status === option}
              onChange={() => {
                setStatus(option);
                setProblem("");
              }}
            />
            {text.status[option]}
          </label>
        ))}
      </fieldset>
      {status !== "missing" && (
        <fieldset className="reference-choices">
          <legend>
            {text.evidence} <span className="muted small">{text.evidenceHint}</span>
          </legend>
          {references.map((reference, index) => {
            const checked = selected.includes(reference.id);
            return (
              <label key={reference.id} className="checkbox">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!checked && selected.length >= FIT_LIMITS.referencesPerFinding}
                  onChange={() => {
                    setProblem("");
                    setSelected((current) =>
                      checked
                        ? current.filter((id) => id !== reference.id)
                        : [...current, reference.id],
                    );
                  }}
                />
                <span className="badge">{referenceLabel(index)}</span>
                {reference.organization}
              </label>
            );
          })}
        </fieldset>
      )}
      {problem && (
        <small className="field-error" role="alert">
          {problem}
        </small>
      )}
      <div className="form-actions">
        <button className="button" disabled={busy}>
          {text.save}
        </button>
        <button type="button" className="pill" onClick={onCancel} disabled={busy}>
          {text.cancelEdit}
        </button>
      </div>
    </form>
  );
}

export function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="currentColor">
      <path d="M12 2c.6 4.8 2.8 7.4 8 8-5.2.6-7.4 3.2-8 8-.6-4.8-2.8-7.4-8-8 5.2-.6 7.4-3.2 8-8Z" />
      <path d="M19 15c.3 2.1 1.1 3 3 3.3-1.9.3-2.7 1.1-3 3.2-.3-2.1-1.1-2.9-3-3.2 1.9-.3 2.7-1.2 3-3.3Z" />
    </svg>
  );
}

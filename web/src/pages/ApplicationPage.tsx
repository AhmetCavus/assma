import { useEffect, useState } from "react";
import { Icon } from "../components/Icon";
import {
  dayOf,
  PROJECT_STATUSES,
  toApiError,
  type Application,
  type ApplicationEvent,
  type Project,
  type ProjectStatus,
} from "@assma/shared";
import { applicationsChanged, isoOf, localDateTime } from "../lib/applications";
import { cvFileName, cvMarkdown, cvPdf, download } from "../lib/cvDocument";
import { documentOfSnapshot } from "../lib/cvDraft";
import { setFlash, takeFlash } from "../lib/flash";
import { AssessmentCell } from "../components/Assessment";
import type { Preferences } from "../lib/preferences";
import { useAssistantPage } from "../lib/assistant";
import { projectsChanged } from "../lib/projects";
import { linkHandler, navigate } from "../lib/router";
import type { Session } from "../lib/session";

const QUICK_DAYS = [3, 7, 14];

function addDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return dayOf(date);
}

/** One recorded application: where it stands, what happened since, and what was sent. */
export function ApplicationPage({
  id,
  session,
  preferences,
}: {
  id: string;
  session: Session;
  preferences: Preferences;
}) {
  const { copy, locale } = preferences;
  const text = copy.application;
  const { api, signOut } = session;
  const [application, setApplication] = useState<Application | null>(null);
  /** The live project; null once it was deleted, undefined while loading. */
  const [project, setProject] = useState<Project | null | undefined>(undefined);
  const [followUp, setFollowUp] = useState({ at: "", note: "" });
  const [entry, setEntry] = useState({ kind: "note" as "note" | "reply", text: "", at: "" });
  const [status, setStatus] = useState(takeFlash);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function fail(failure: unknown) {
    const apiError = toApiError(failure);
    if (apiError.isUnauthorized) {
      signOut(copy.common.sessionExpired);
      return;
    }
    setError(apiError.code === "not_found" ? text.notFound : copy.common.error);
  }

  function show(loaded: Application) {
    setApplication(loaded);
    setFollowUp({ at: loaded.followUpAt ?? "", note: loaded.followUpNote });
  }

  useEffect(() => {
    let active = true;
    api
      .application(id)
      .then(async (loaded) => {
        if (!active) {
          return;
        }
        show(loaded);
        setEntry((current) => ({ ...current, at: localDateTime() }));
        try {
          const live = await api.project(loaded.projectId);
          if (active) {
            setProject(live);
          }
        } catch (failure) {
          if (active) {
            if (toApiError(failure).code === "not_found") {
              setProject(null);
            } else {
              fail(failure);
            }
          }
        }
      })
      .catch((failure: unknown) => active && fail(failure));
    return () => {
      active = false;
    };
  }, [api, id]);

  /** The assistant notes what the person tells it; errors throw so it can say so. */
  async function addNote(note: string) {
    const updated = await api.addApplicationEvent(id, {
      kind: "note",
      text: note,
      at: new Date().toISOString(),
    });
    show(updated);
    setStatus(text.added);
    applicationsChanged();
  }
  useAssistantPage({ services: application ? { add_note: addNote } : {} });

  if (!application) {
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

  const snapshot = application.snapshot;
  const dateTime = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const dateOnly = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  const formatDay = (day: string) => dateOnly.format(new Date(`${day}T12:00:00`));
  const channelName = copy.apply.channels[application.channel];
  const title = project?.title ?? snapshot.project.title;
  const company = project?.company ?? snapshot.project.company;
  const document = documentOfSnapshot(snapshot);
  const fileBase = cvFileName(document, snapshot.project.company || snapshot.project.title);

  async function run(action: () => Promise<Application>, done: string) {
    setError("");
    setStatus("");
    setBusy(true);
    try {
      show(await action());
      setStatus(done);
      applicationsChanged();
    } catch (failure) {
      fail(failure);
    } finally {
      setBusy(false);
    }
  }

  const changeStatus = (next: ProjectStatus) =>
    run(async () => {
      const updated = await api.changeApplication(id, { status: next });
      setProject((current) => (current ? { ...current, status: next } : current));
      projectsChanged();
      return updated;
    }, text.statusChanged);

  const saveFollowUp = (at: string | null) =>
    run(
      () =>
        api.changeApplication(id, {
          followUpAt: at,
          followUpNote: at ? followUp.note.trim() : "",
        }),
      at ? text.followUpSaved : text.followUpCleared,
    );

  const addEntry = () => {
    const at = isoOf(entry.at);
    if (!entry.text.trim() || !at) {
      return;
    }
    void run(async () => {
      const updated = await api.addApplicationEvent(id, {
        kind: entry.kind,
        text: entry.text.trim(),
        at,
      });
      setEntry({ kind: entry.kind, text: "", at: localDateTime() });
      return updated;
    }, text.added);
  };

  async function downloadOriginal() {
    setError("");
    try {
      const file = await api.applicationFile(id);
      const bytes = Uint8Array.from(atob(file.data), (character) => character.charCodeAt(0));
      download(file.name, new Blob([bytes], { type: "application/pdf" }));
    } catch (failure) {
      fail(failure);
    }
  }

  async function regenerate() {
    setError("");
    try {
      const bytes = await cvPdf(document);
      download(
        `${fileBase}.pdf`,
        new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "application/pdf" }),
      );
    } catch (failure) {
      console.error("CV export failed", failure);
      setError(copy.common.error);
    }
  }

  async function remove() {
    if (!window.confirm(text.confirmDelete)) {
      return;
    }
    try {
      await api.deleteApplication(id);
      applicationsChanged();
      setFlash(text.deleted);
      navigate(project ? `/projects/${application!.projectId}` : "/dashboard");
    } catch (failure) {
      fail(failure);
    }
  }

  const describe = (event: ApplicationEvent) => {
    if (event.kind === "status" && event.status) {
      return text.eventStatus(copy.projects.status[event.status]);
    }
    if (event.kind === "followUp") {
      return event.followUpAt
        ? `${text.eventFollowUp(formatDay(event.followUpAt))}${event.text ? ` · ${event.text}` : ""}`
        : text.eventFollowUpCleared;
    }
    return event.text;
  };

  // Newest first, with the submission itself at the bottom.
  const events = [...application.events].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  const findings = snapshot.fit?.findings ?? [];

  return (
    <div className="page wide">
      {project ? (
        <a
          className="link back-link"
          href={`/projects/${application.projectId}`}
          onClick={linkHandler(`/projects/${application.projectId}`)}
        >
          ← {text.back}
        </a>
      ) : (
        <a className="link back-link" href="/dashboard" onClick={linkHandler("/dashboard")}>
          ← {copy.dashboard.title}
        </a>
      )}
      <div className="page-header">
        <div>
          <p className="eyebrow">
            {text.submitted(channelName, dateTime.format(new Date(application.submittedAt)))}
          </p>
          <h1>{title}</h1>
          {company && <p className="lead">{company}</p>}
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
      {project === null && <p className="alert">{text.projectDeleted}</p>}

      <div className="application-grid">
        <div className="application-main">
          <div className="fit-grid">
            {project && (
              <section className="card" aria-labelledby="status-title">
                <h2 id="status-title">{text.statusTitle}</h2>
                <div className="chips" role="radiogroup" aria-labelledby="status-title">
                  {PROJECT_STATUSES.filter((option) => option !== "captured").map((option) => (
                    <button
                      key={option}
                      type="button"
                      role="radio"
                      aria-checked={project.status === option}
                      className={`chip ${project.status === option ? "selected" : ""}`}
                      disabled={busy}
                      onClick={() => project.status !== option && void changeStatus(option)}
                    >
                      {copy.projects.status[option]}
                    </button>
                  ))}
                </div>
              </section>
            )}
            <section className="card" aria-labelledby="follow-title">
              <h2 id="follow-title">{text.followUpTitle}</h2>
              <form
                className="form"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (followUp.at) {
                    void saveFollowUp(followUp.at);
                  }
                }}
              >
                <label>
                  {text.followUpOn}
                  <input
                    type="date"
                    value={followUp.at}
                    onChange={(event) => setFollowUp({ ...followUp, at: event.target.value })}
                  />
                </label>
                <div className="chips">
                  {QUICK_DAYS.map((days) => (
                    <button
                      key={days}
                      type="button"
                      className={`chip ${followUp.at === addDays(days) ? "selected" : ""}`}
                      onClick={() => setFollowUp({ ...followUp, at: addDays(days) })}
                    >
                      {text.inDays(days)}
                    </button>
                  ))}
                </div>
                <label>
                  {text.followUpNote}
                  <input
                    value={followUp.note}
                    maxLength={300}
                    placeholder={text.followUpNotePlaceholder}
                    onChange={(event) => setFollowUp({ ...followUp, note: event.target.value })}
                  />
                </label>
                <div className="apply-actions">
                  <button className="button" disabled={busy || !followUp.at}>
                    {text.setFollowUp}
                  </button>
                  {application.followUpAt && (
                    <button
                      type="button"
                      className="pill destructive"
                      disabled={busy}
                      onClick={() => void saveFollowUp(null)}
                    >
                      {text.clearFollowUp}
                    </button>
                  )}
                </div>
              </form>
            </section>
          </div>

          <section className="card" aria-labelledby="activity-title">
            <h2 id="activity-title">{text.activityTitle}</h2>
            <form
              className="form activity-form"
              onSubmit={(event) => {
                event.preventDefault();
                addEntry();
              }}
            >
              <div className="chips" role="radiogroup" aria-label={text.addTitle}>
                {(["note", "reply"] as const).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    role="radio"
                    aria-checked={entry.kind === kind}
                    className={`chip ${entry.kind === kind ? "selected" : ""}`}
                    onClick={() => setEntry({ ...entry, kind })}
                  >
                    {text.kinds[kind]}
                  </button>
                ))}
              </div>
              <label>
                {text.eventText}
                <textarea
                  rows={3}
                  value={entry.text}
                  maxLength={4000}
                  onChange={(event) => setEntry({ ...entry, text: event.target.value })}
                />
              </label>
              <div className="inline-form">
                <label>
                  {text.eventAt}
                  <input
                    type="datetime-local"
                    value={entry.at}
                    onChange={(event) => setEntry({ ...entry, at: event.target.value })}
                  />
                </label>
                <button className="button" disabled={busy || !entry.text.trim()}>
                  {text.add}
                </button>
              </div>
            </form>
            <ol className="timeline">
              {events.map((event) => (
                <li key={event.id} className={`timeline-${event.kind}`}>
                  <span className="timeline-dot" aria-hidden="true" />
                  <div>
                    <p className="timeline-meta">
                      <strong>{text.kinds[event.kind]}</strong> ·{" "}
                      {dateTime.format(new Date(event.at))}
                    </p>
                    <p className="timeline-text">{describe(event)}</p>
                  </div>
                  {(event.kind === "note" || event.kind === "reply") && (
                    <button
                      type="button"
                      className="icon-button small-button"
                      aria-label={text.removeEvent}
                      title={text.removeEvent}
                      disabled={busy}
                      onClick={() =>
                        void run(() => api.removeApplicationEvent(id, event.id), text.removeEvent)
                      }
                    >
                      ×
                    </button>
                  )}
                </li>
              ))}
              <li className="timeline-submitted">
                <span className="timeline-dot" aria-hidden="true" />
                <div>
                  <p className="timeline-meta">
                    <strong>{channelName}</strong> ·{" "}
                    {dateTime.format(new Date(application.submittedAt))}
                  </p>
                  <p className="timeline-text">{text.eventSubmitted[application.channel]}</p>
                </div>
              </li>
            </ol>
          </section>
        </div>

        <aside className="application-side">
          <section className="card" aria-labelledby="snapshot-title">
            <h2 id="snapshot-title">{text.snapshotTitle}</h2>
            <p className="muted small">{text.snapshotLead}</p>
            {application.email && (
              <dl className="sent-details">
                <dt>{text.email.to}</dt>
                <dd>{application.email.to}</dd>
                <dt>{text.email.subject}</dt>
                <dd>{application.email.subject}</dd>
                <dt>{text.email.message}</dt>
                <dd className="sent-message">{application.email.message}</dd>
              </dl>
            )}
            {application.portal && (
              <dl className="sent-details">
                {application.portal.portal && (
                  <>
                    <dt>{text.portal}</dt>
                    <dd>{application.portal.portal}</dd>
                  </>
                )}
                {application.portal.note && (
                  <>
                    <dt>{text.portalNote}</dt>
                    <dd className="sent-message">{application.portal.note}</dd>
                  </>
                )}
              </dl>
            )}
            <h3>{text.original}</h3>
            {application.file ? (
              <p className="file-name">
                {application.file.name} · {Math.round(application.file.size / 1024)} KB
              </p>
            ) : (
              <p className="muted">{text.noCv}</p>
            )}
            <div className="apply-actions">
              {application.file && (
                <button type="button" className="button" onClick={() => void downloadOriginal()}>
                  {text.downloadOriginal}
                </button>
              )}
              <button type="button" className="pill secondary" onClick={() => void regenerate()}>
                {text.regenerate}
              </button>
              <button
                type="button"
                className="pill secondary"
                onClick={() =>
                  download(
                    `${fileBase}.md`,
                    new Blob([cvMarkdown(document)], { type: "text/markdown;charset=utf-8" }),
                  )
                }
              >
                {text.markdown}
              </button>
            </div>
          </section>

          {snapshot.assessment && (
            <section className="card" aria-labelledby="fit-at-title">
              <h2 id="fit-at-title">{text.fitTitle}</h2>
              <AssessmentCell
                summary={snapshot.assessment}
                legacyScore={undefined}
                copy={copy.assessment}
              />
              {snapshot.assessment.formal.blockers.length > 0 && (
                <p className="small tone-text-bad">
                  {copy.assessment.blockers(snapshot.assessment.formal.blockers.length)}:{" "}
                  {snapshot.assessment.formal.blockers.join(", ")}
                </p>
              )}
              {snapshot.assessment.formal.risks.length > 0 && (
                <p className="small tone-text-warn">
                  {copy.assessment.risks(snapshot.assessment.formal.risks.length)}:{" "}
                  {snapshot.assessment.formal.risks.join(", ")}
                </p>
              )}
            </section>
          )}
          {!snapshot.assessment && snapshot.fit && (
            <section className="card" aria-labelledby="fit-at-title">
              <h2 id="fit-at-title">
                {text.fitTitle} · {copy.assessment.legacyTitle}
              </h2>
              {snapshot.fit.score !== null && (
                <p className="score small-score">
                  <strong>{snapshot.fit.score}</strong>
                  <span>{copy.fit.outOf}</span>
                </p>
              )}
              <ul className="snapshot-findings">
                {findings.map((finding) => (
                  <li key={`${finding.kind}-${finding.requirement}`}>
                    <span className={`fit-badge fit-${finding.status}`}>
                      {copy.fit.status[finding.status]}
                    </span>
                    {finding.requirement}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="card" aria-labelledby="refs-title">
            <h2 id="refs-title">{text.referencesTitle}</h2>
            <ol className="apply-references">
              {snapshot.references.map((reference) => (
                <li key={reference.id}>
                  <strong>{reference.organization}</strong>
                  <span className="muted small">{reference.role}</span>
                </li>
              ))}
            </ol>
          </section>

          <details className="card listing-details">
            <summary>{text.listingTitle}</summary>
            {snapshot.project.tech.length > 0 && (
              <p className="muted small">{snapshot.project.tech.join(" · ")}</p>
            )}
            <pre className="source-text">{snapshot.project.brief || snapshot.project.title}</pre>
          </details>

          <button
            type="button"
            className="button destructive soft compact danger-link"
            onClick={() => void remove()}
          >
            <Icon name="trash" size={16} />
            {text.delete}
          </button>
        </aside>
      </div>
    </div>
  );
}

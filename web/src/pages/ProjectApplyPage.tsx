import { useEffect, useMemo, useState } from "react";
import {
  applicationEmail,
  base64Of,
  buildEml,
  LOCALES,
  mailtoLink,
  toApiError,
  type ApplicationChannel,
  type CvChoice,
  type Experience,
  type Project,
} from "@assma/shared";
import { useAssistantPage } from "../lib/assistant";
import { applicationsChanged, isoOf, localDateTime, pdfBlob } from "../lib/applications";
import { cvFileName, cvPdf, download } from "../lib/cvDocument";
import { documentOf, initialDraft, resolveDraft } from "../lib/cvDraft";
import { setFlash } from "../lib/flash";
import type { Preferences } from "../lib/preferences";
import { projectsChanged } from "../lib/projects";
import { linkHandler, navigate } from "../lib/router";
import type { Session } from "../lib/session";

type Email = { to: string; subject: string; message: string };
type EmailText = { subject: string; message: string };

const textOf = (value: Email): EmailText => ({ subject: value.subject, message: value.message });

/**
 * Apply for a project by email or record a portal submission. The email leaves as an .eml
 * draft from the person's own mail app; once it is sent, the application is recorded and
 * frozen together with the exact PDF.
 */
export function ProjectApplyPage({
  id,
  session,
  preferences,
}: {
  id: string;
  session: Session;
  preferences: Preferences;
}) {
  const { copy, locale } = preferences;
  const text = copy.apply;
  const { api, signOut } = session;
  const [project, setProject] = useState<Project | null>(null);
  const [experience, setExperience] = useState<Experience | null>(null);
  const [channel, setChannel] = useState<ApplicationChannel>("email");
  const [email, setEmail] = useState<Email>({ to: "", subject: "", message: "" });
  const [sentAt, setSentAt] = useState(localDateTime);
  const [portal, setPortal] = useState({ portal: "", cvUploaded: true, note: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  /** The PDF made once and reused, so the .eml and the recorded file are the same bytes. */
  const [pdf, setPdf] = useState<{ key: string; bytes: Uint8Array } | null>(null);
  /** Earlier and later versions of subject and message, around the one being edited. */
  const [versions, setVersions] = useState<{ past: EmailText[]; future: EmailText[] }>({
    past: [],
    future: [],
  });

  function fail(failure: unknown) {
    const apiError = toApiError(failure);
    if (apiError.isUnauthorized) {
      signOut(copy.common.sessionExpired);
      return;
    }
    const messages: Record<string, string> = {
      not_found: copy.fit.notFound,
      submitted_in_future: text.errors.future,
      application_limit: text.errors.limit,
      too_many_attempts: text.errors.tooMany,
    };
    setError(messages[apiError.code] ?? copy.common.error);
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
        const choice = resolveDraft(
          loadedProject,
          loadedExperience,
          initialDraft(loadedProject, loadedExperience),
          locale,
        );
        const confirmed = (loadedProject.fit?.findings ?? [])
          .filter((finding) => finding.status === "confirmed")
          .map((finding) => finding.requirement);
        // The email speaks the CV's language, whatever the interface language.
        setEmail(
          applicationEmail(
            loadedProject,
            loadedExperience.profile,
            confirmed,
            LOCALES[choice.language].apply.template,
          ),
        );
        setPortal((current) => ({ ...current, portal: loadedProject.sourceUrl }));
      })
      .catch((failure: unknown) => active && fail(failure));
    return () => {
      active = false;
    };
  }, [api, id]);

  const choice: CvChoice | null = useMemo(
    () =>
      project && experience
        ? resolveDraft(project, experience, initialDraft(project, experience), locale)
        : null,
    [project, experience, locale],
  );

  /** A new version from the assistant; the current text, with its manual edits, is kept. */
  function revise(next: EmailText): boolean {
    if (next.subject === email.subject.trim() && next.message === email.message.trim()) {
      return false;
    }
    setVersions((current) => ({ past: [...current.past, textOf(email)], future: [] }));
    setEmail((current) => ({ ...current, ...next }));
    setErrors({});
    return true;
  }

  // The assistant revises the message on request; the arrows at the message undo it.
  useAssistantPage({
    context:
      choice && channel === "email" ? { email: textOf(email), cvLanguage: choice.language } : {},
    services: choice && channel === "email" ? { revise_email: revise } : {},
  });

  if (!project || !experience || !choice) {
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

  const document = documentOf(experience, choice);
  const fileName = `${cvFileName(document, project.company || project.title)}.pdf`;
  const choiceKey = JSON.stringify(choice);

  async function pdfBytes(): Promise<Uint8Array> {
    if (pdf && pdf.key === choiceKey) {
      return pdf.bytes;
    }
    const bytes = await cvPdf(document);
    setPdf({ key: choiceKey, bytes });
    return bytes;
  }

  function checkEmail(): boolean {
    const next: Record<string, string> = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.to.trim())) {
      next.to = text.errors.to;
    }
    if (!email.subject.trim()) {
      next.subject = text.errors.subject;
    }
    if (!email.message.trim()) {
      next.message = text.errors.message;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function withPdf(action: (bytes: Uint8Array) => void | Promise<void>) {
    setError("");
    setBusy(true);
    let bytes: Uint8Array;
    try {
      bytes = await pdfBytes();
    } catch (failure) {
      console.error("CV export failed", failure);
      setError(text.errors.file);
      setBusy(false);
      return;
    }
    try {
      await action(bytes);
    } catch (failure) {
      fail(failure);
    } finally {
      setBusy(false);
    }
  }

  const downloadEml = () =>
    withPdf((bytes) => {
      if (!checkEmail()) {
        return;
      }
      const eml = buildEml({
        to: email.to.trim(),
        from: experience.profile.email
          ? { name: experience.profile.name, address: experience.profile.email }
          : null,
        subject: email.subject.trim(),
        message: email.message,
        attachment: { name: fileName, bytes },
      });
      download(fileName.replace(/\.pdf$/, ".eml"), new Blob([eml], { type: "message/rfc822" }));
    });

  const openMailto = () =>
    withPdf((bytes) => {
      if (!checkEmail()) {
        return;
      }
      download(fileName, pdfBlob(bytes));
      window.location.href = mailtoLink(email.to.trim(), email.subject.trim(), email.message);
    });

  const record = () =>
    withPdf(async (bytes) => {
      if (channel === "email" && !checkEmail()) {
        return;
      }
      const submittedAt = isoOf(sentAt);
      if (!submittedAt || Date.parse(submittedAt) > Date.now() + 60_000) {
        setErrors({ sentAt: text.errors.future });
        return;
      }
      const cvSent = channel === "email" || portal.cvUploaded;
      const application = await api.createApplication({
        projectId: id,
        channel,
        submittedAt,
        email:
          channel === "email"
            ? { to: email.to.trim(), subject: email.subject.trim(), message: email.message }
            : null,
        portal: channel === "portal" ? portal : null,
        cv: choice,
        file: cvSent ? base64Of(bytes) : null,
        fileName: cvSent ? fileName : "",
      });
      applicationsChanged();
      projectsChanged();
      setFlash(text.recorded);
      navigate(`/applications/${application.id}`);
    });

  function stepVersion(direction: -1 | 1) {
    const source = direction < 0 ? versions.past : versions.future;
    const target = direction < 0 ? source.at(-1) : source[0];
    if (!target) {
      return;
    }
    setVersions(
      direction < 0
        ? { past: versions.past.slice(0, -1), future: [textOf(email), ...versions.future] }
        : { past: [...versions.past, textOf(email)], future: versions.future.slice(1) },
    );
    setEmail({ ...email, ...target });
    setErrors({});
  }

  const versionCount = versions.past.length + 1 + versions.future.length;
  const versionBar = versionCount > 1 && (
    <div
      className="version-bar"
      role="group"
      aria-label={text.versions.of(versions.past.length + 1, versionCount)}
    >
      <button
        type="button"
        className="icon-button"
        disabled={versions.past.length === 0}
        onClick={() => stepVersion(-1)}
        aria-label={text.versions.previous}
        title={text.versions.previous}
      >
        ‹
      </button>
      <span className="muted small">
        {text.versions.of(versions.past.length + 1, versionCount)}
      </span>
      <button
        type="button"
        className="icon-button"
        disabled={versions.future.length === 0}
        onClick={() => stepVersion(1)}
        aria-label={text.versions.next}
        title={text.versions.next}
      >
        ›
      </button>
    </div>
  );

  const field = (name: keyof Email, label: string, multiline = false) => (
    <label>
      {multiline ? (
        <span className="label-row">
          {label}
          {versionBar}
        </span>
      ) : (
        label
      )}
      {multiline ? (
        <textarea
          rows={12}
          value={email[name]}
          onChange={(event) => setEmail({ ...email, [name]: event.target.value })}
          aria-invalid={Boolean(errors[name])}
        />
      ) : (
        <input
          type={name === "to" ? "email" : "text"}
          value={email[name]}
          onChange={(event) => setEmail({ ...email, [name]: event.target.value })}
          aria-invalid={Boolean(errors[name])}
        />
      )}
      {errors[name] ? (
        <small className="field-error" role="alert">
          {errors[name]}
        </small>
      ) : (
        name === "message" && <small className="muted">{text.messageHint}</small>
      )}
    </label>
  );

  const when = (label: string) => (
    <label>
      {label}
      <input
        type="datetime-local"
        value={sentAt}
        max={localDateTime(new Date(Date.now() + 60_000))}
        onChange={(event) => setSentAt(event.target.value)}
        aria-invalid={Boolean(errors.sentAt)}
      />
      {errors.sentAt && (
        <small className="field-error" role="alert">
          {errors.sentAt}
        </small>
      )}
    </label>
  );

  const subtitle = [project.title, project.company].filter(Boolean).join(" · ");

  return (
    <div className="page wide">
      <a
        className="link back-link"
        href={`/projects/${id}`}
        onClick={linkHandler(`/projects/${id}`)}
      >
        ← {text.back}
      </a>
      <h1>{text.title}</h1>
      <p className="lead">{subtitle}</p>
      <div className="chips" role="tablist" aria-label={text.channelLabel}>
        {(["email", "portal"] as const).map((option) => (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={channel === option}
            className={`chip ${channel === option ? "selected" : ""}`}
            onClick={() => {
              setChannel(option);
              setErrors({});
            }}
          >
            {text.channels[option]}
          </button>
        ))}
      </div>
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}

      <div className="apply-grid">
        <div className="apply-main">
          {channel === "email" ? (
            <>
              <section className="card">
                <h2>{text.emailTitle}</h2>
                <div className="form">
                  {field("to", text.to)}
                  {field("subject", text.subject)}
                  {field("message", text.message, true)}
                </div>
              </section>
              <section className="card">
                <h2>{text.sendTitle}</h2>
                <div className="apply-actions">
                  <button
                    type="button"
                    className="button"
                    disabled={busy}
                    onClick={() => void downloadEml()}
                  >
                    {busy ? text.preparing : text.downloadEml}
                  </button>
                  <button
                    type="button"
                    className="pill secondary"
                    disabled={busy}
                    onClick={() => void openMailto()}
                  >
                    {text.mailto}
                  </button>
                </div>
                <p className="muted small">{text.emlHint}</p>
                <p className="muted small">{text.mailtoHint}</p>
              </section>
              <section className="card confirm-card">
                <h2>{text.confirmTitle}</h2>
                <p className="muted">{text.confirmLead}</p>
                <div className="form inline-form">
                  {when(text.sentAt)}
                  <button
                    type="button"
                    className="button positive"
                    disabled={busy}
                    onClick={() => void record()}
                  >
                    {text.recordEmail}
                  </button>
                </div>
              </section>
            </>
          ) : (
            <section className="card">
              <h2>{text.portalTitle}</h2>
              <div className="form">
                <label>
                  {text.portal}
                  <input
                    value={portal.portal}
                    placeholder={text.portalPlaceholder}
                    maxLength={300}
                    onChange={(event) => setPortal({ ...portal, portal: event.target.value })}
                  />
                </label>
                {when(text.submittedAt)}
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={portal.cvUploaded}
                    onChange={(event) => setPortal({ ...portal, cvUploaded: event.target.checked })}
                  />
                  {text.cvUploaded}
                </label>
                {!portal.cvUploaded && <p className="muted small">{text.cvNotUploaded}</p>}
                <label>
                  {text.portalNote}
                  <textarea
                    rows={3}
                    value={portal.note}
                    maxLength={2000}
                    placeholder={text.portalNotePlaceholder}
                    onChange={(event) => setPortal({ ...portal, note: event.target.value })}
                  />
                </label>
                <p className="muted small">{text.confirmLead}</p>
                <button
                  type="button"
                  className="button positive"
                  disabled={busy}
                  onClick={() => void record()}
                >
                  {busy ? text.preparing : text.recordPortal}
                </button>
              </div>
            </section>
          )}
        </div>

        <aside className="card apply-cv">
          <h2>{text.cvTitle}</h2>
          <p className="file-name">{fileName}</p>
          <p className="muted small">
            {text.cvSummary(
              copy.cv.layouts[choice.design.layout],
              copy.cv.themes[choice.design.theme],
              copy.cv.languageNames[choice.language],
              choice.referenceIds.length,
            )}
          </p>
          {!project.cv && <p className="muted small">{text.cvUnsaved}</p>}
          <ol className="apply-references">
            {document.references.map((reference) => (
              <li key={`${reference.organization}-${reference.period}`}>
                <strong>{reference.organization}</strong>
                <span className="muted small">
                  {reference.role} · {reference.period}
                </span>
              </li>
            ))}
          </ol>
          <div className="apply-actions">
            <a
              className="pill secondary"
              href={`/projects/${id}/cv`}
              onClick={linkHandler(`/projects/${id}/cv`)}
            >
              {text.editCv}
            </a>
            <button
              type="button"
              className="pill secondary"
              disabled={busy}
              onClick={() => void withPdf((bytes) => download(fileName, pdfBlob(bytes)))}
            >
              {text.previewPdf}
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

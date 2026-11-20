import { useEffect, useState } from "react";
import {
  FIT_LIMITS,
  referenceLabel,
  supportingReferences,
  toApiError,
  type Experience,
  type Project,
} from "@assma/shared";
import {
  cvDocument,
  cvFileName,
  cvMarkdown,
  cvPdf,
  download,
  type CvDocument,
} from "../lib/cvDocument";
import type { Preferences } from "../lib/preferences";
import { projectsChanged } from "../lib/projects";
import { linkHandler } from "../lib/router";
import type { Session } from "../lib/session";

type Draft = { summary: string; referenceIds: string[] };

/** The saved draft, or a first one: the profile summary and the references the fit supports. */
function initialDraft(project: Project, experience: Experience): Draft {
  const known = new Set(experience.references.map((reference) => reference.id));
  if (project.cv) {
    return {
      summary: project.cv.summary,
      referenceIds: project.cv.referenceIds.filter((id) => known.has(id)),
    };
  }
  const supporting = project.fit
    ? supportingReferences(project.fit).filter((id) => known.has(id))
    : [];
  return {
    summary: experience.profile.summary,
    referenceIds: (supporting.length > 0
      ? supporting
      : experience.references.map((reference) => reference.id)
    ).slice(0, FIT_LIMITS.cvReferences),
  };
}

export function ProjectCvPage({
  id,
  session,
  preferences,
}: {
  id: string;
  session: Session;
  preferences: Preferences;
}) {
  const { copy, locale } = preferences;
  const text = copy.cv;
  const { api, signOut } = session;
  const [project, setProject] = useState<Project | null>(null);
  const [experience, setExperience] = useState<Experience | null>(null);
  const [draft, setDraft] = useState<Draft>({ summary: "", referenceIds: [] });
  const [saved, setSaved] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  function fail(failure: unknown) {
    const apiError = toApiError(failure);
    if (apiError.isUnauthorized) {
      signOut(copy.common.sessionExpired);
      return;
    }
    setError(apiError.code === "not_found" ? copy.fit.notFound : copy.common.error);
  }

  useEffect(() => {
    let active = true;
    Promise.all([api.project(id), api.experience()])
      .then(([loadedProject, loadedExperience]) => {
        if (!active) {
          return;
        }
        const first = initialDraft(loadedProject, loadedExperience);
        setProject(loadedProject);
        setExperience(loadedExperience);
        setDraft(first);
        setSaved(loadedProject.cv ? first : null);
      })
      .catch((failure: unknown) => active && fail(failure));
    return () => {
      active = false;
    };
  }, [api, id]);

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
  const selected = draft.referenceIds
    .map((referenceId) => references.find((reference) => reference.id === referenceId))
    .filter((reference): reference is NonNullable<typeof reference> => Boolean(reference));
  // Selected references first in CV order, then the others in Experience order.
  const ordered = [
    ...selected,
    ...references.filter((reference) => !draft.referenceIds.includes(reference.id)),
  ];
  const document = cvDocument(experience.profile, draft.summary, selected, copy, locale);
  const dirty = JSON.stringify(saved) !== JSON.stringify(draft);
  const fileName = cvFileName(document, project.company || project.title);

  const toggle = (referenceId: string) =>
    setDraft((current) => ({
      ...current,
      referenceIds: current.referenceIds.includes(referenceId)
        ? current.referenceIds.filter((item) => item !== referenceId)
        : [...current.referenceIds, referenceId].slice(0, FIT_LIMITS.cvReferences),
    }));

  const move = (referenceId: string, step: -1 | 1) =>
    setDraft((current) => {
      const ids = [...current.referenceIds];
      const index = ids.indexOf(referenceId);
      const target = index + step;
      if (index < 0 || target < 0 || target >= ids.length) {
        return current;
      }
      [ids[index], ids[target]] = [ids[target]!, ids[index]!];
      return { ...current, referenceIds: ids };
    });

  async function save() {
    setError("");
    setBusy(true);
    try {
      const updated = await api.saveCv(id, draft);
      setProject(updated);
      setSaved(draft);
      setStatus(text.saved);
      projectsChanged();
    } catch (failure) {
      fail(failure);
    } finally {
      setBusy(false);
    }
  }

  async function exportPdf() {
    setError("");
    try {
      const bytes = await cvPdf(document);
      download(
        `${fileName}.pdf`,
        new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "application/pdf" }),
      );
    } catch {
      setError(copy.common.error);
    }
  }

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
      <p className="lead">{[project.title, project.company].filter(Boolean).join(" · ")}</p>
      <p className="status" aria-live="polite">
        {dirty ? <span className="muted">{text.unsaved}</span> : status}
      </p>
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      {!experience.profile.name && <p className="alert">{text.missingProfile}</p>}
      <div className="capture-grid">
        <section className="card" aria-labelledby="cv-content-title">
          <h2 id="cv-content-title">{text.contentTitle}</h2>
          <div className="form compact">
            <label>
              {text.summary}
              <textarea
                value={draft.summary}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, summary: event.target.value }))
                }
                rows={4}
                maxLength={FIT_LIMITS.summary}
              />
              <small className="muted">{text.summaryHint}</small>
            </label>
          </div>
          <h3 className="section-title">{text.referencesTitle}</h3>
          <p className="muted small">{text.referencesHint}</p>
          {references.length === 0 ? (
            <p className="muted">{text.noReferences}</p>
          ) : (
            <ul className="cv-references">
              {ordered.map((reference) => {
                const position = draft.referenceIds.indexOf(reference.id);
                const chosen = position >= 0;
                const label = referenceLabel(references.indexOf(reference));
                return (
                  <li key={reference.id}>
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={chosen}
                        onChange={() => toggle(reference.id)}
                      />
                      <span>
                        <strong>{reference.organization}</strong>{" "}
                        <span className="badge">{label}</span>
                      </span>
                    </label>
                    {chosen && (
                      <span className="order-buttons">
                        <button
                          type="button"
                          className="pill"
                          onClick={() => move(reference.id, -1)}
                          disabled={position === 0}
                          aria-label={`${text.up}: ${reference.organization}`}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="pill"
                          onClick={() => move(reference.id, 1)}
                          disabled={position === draft.referenceIds.length - 1}
                          aria-label={`${text.down}: ${reference.organization}`}
                        >
                          ↓
                        </button>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <div className="form-actions">
            <button
              type="button"
              className="button"
              onClick={() => void save()}
              disabled={busy || !dirty}
            >
              {busy ? copy.common.working : text.save}
            </button>
            <button
              type="button"
              className="pill"
              onClick={() =>
                download(
                  `${fileName}.md`,
                  new Blob([cvMarkdown(document)], { type: "text/markdown;charset=utf-8" }),
                )
              }
            >
              <DownloadIcon />
              {text.markdown}
            </button>
            <button type="button" className="pill" onClick={() => void exportPdf()}>
              <DownloadIcon />
              {text.pdf}
            </button>
          </div>
        </section>
        <section className="card" aria-labelledby="preview-title">
          <h2 id="preview-title">{text.previewTitle}</h2>
          <CvPreview document={document} />
        </section>
      </div>
    </div>
  );
}

function CvPreview({ document }: { document: CvDocument }) {
  return (
    <article className="cv-paper">
      <h3 className="cv-name">{document.name || "CV"}</h3>
      {document.details.map((detail) => (
        <p key={detail} className="cv-detail">
          {detail}
        </p>
      ))}
      {document.summary && (
        <>
          <h4>{document.headings.profile}</h4>
          <p className="cv-text">{document.summary}</p>
        </>
      )}
      {document.references.length > 0 && <h4>{document.headings.projects}</h4>}
      {document.references.map((reference, index) => (
        <section key={`${reference.organization}-${index}`} className="cv-reference">
          <h5>{reference.organization}</h5>
          <p className="cv-detail">{reference.meta}</p>
          <p className="cv-text">{reference.contribution}</p>
          {reference.skills.length > 0 && (
            <p className="cv-skills">
              {document.headings.skills}: {reference.skills.join(", ")}
            </p>
          )}
        </section>
      ))}
    </article>
  );
}

function DownloadIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="15"
      height="15"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3v12M7 10l5 5 5-5M4 19h16" />
    </svg>
  );
}

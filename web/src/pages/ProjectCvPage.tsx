import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  CV_LANGUAGES,
  CV_LAYOUTS,
  CV_THEME_IDS,
  CV_THEMES,
  cssColor,
  PHOTO_SHAPES,
  type CvDesign,
  type CvLanguage,
  defaultSkills,
  FIT_LIMITS,
  formatYears,
  referenceLabel,
  relevantTo,
  skillRows,
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
  frameColor,
  framedPhoto,
  type CvDocument,
} from "../lib/cvDocument";
import { EMPTY_DRAFT, initialDraft, type Draft } from "../lib/cvDraft";
import type { Preferences } from "../lib/preferences";
import { useAssistantPage } from "../lib/assistant";
import { projectsChanged } from "../lib/projects";
import { linkHandler, navigate } from "../lib/router";
import type { Session } from "../lib/session";

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
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [saved, setSaved] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);

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

  const rows = useMemo(() => (experience ? skillRows(experience.references) : []), [experience]);

  // The assistant rewrites the summary in the draft; saving stays the person's step.
  useAssistantPage({
    context:
      project && experience ? { summary: draft.summary, cvLanguage: draft.language ?? locale } : {},
    services:
      project && experience
        ? {
            revise_summary: (summary: string) => {
              if (summary === draft.summary.trim()) {
                return false;
              }
              setDraft((current) => ({ ...current, summary }));
              setStatus("");
              return true;
            },
          }
        : {},
  });

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
  const ordered = [
    ...selected,
    ...references.filter((reference) => !draft.referenceIds.includes(reference.id)),
  ];
  const recommended = defaultSkills(rows, project);
  const skills = draft.skills ?? recommended;
  const photo = experience.images.find((image) => image.id === draft.imageId)?.dataUrl ?? null;
  const cvLanguage: CvLanguage = draft.language ?? locale;
  const document = cvDocument({
    profile: experience.profile,
    summary: draft.summary,
    references: selected,
    allReferences: references,
    skills,
    photo,
    language: cvLanguage,
    design: draft.design,
  });
  const setDesign = (change: Partial<CvDesign>) =>
    setDraft((current) => ({ ...current, design: { ...current.design, ...change } }));

  const dirty = JSON.stringify(saved) !== JSON.stringify(draft);
  const fileName = cvFileName(document, project.company || project.title);

  const toggleReference = (referenceId: string) =>
    setDraft((current) => ({
      ...current,
      referenceIds: current.referenceIds.includes(referenceId)
        ? current.referenceIds.filter((item) => item !== referenceId)
        : [...current.referenceIds, referenceId].slice(0, FIT_LIMITS.cvReferences),
    }));

  const moveReference = (referenceId: string, step: -1 | 1) =>
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

  const toggleSkill = (name: string) =>
    setDraft((current) => {
      const list = current.skills ?? recommended;
      return {
        ...current,
        skills: list.includes(name)
          ? list.filter((item) => item !== name)
          : [...list, name].slice(0, FIT_LIMITS.cvSkills),
      };
    });

  async function save(): Promise<boolean> {
    setError("");
    setBusy(true);
    try {
      const updated = await api.saveCv(id, draft);
      setProject(updated);
      setSaved(draft);
      setStatus(text.saved);
      projectsChanged();
      return true;
    } catch (failure) {
      fail(failure);
      return false;
    } finally {
      setBusy(false);
    }
  }

  /** The apply page uses the saved draft, so unsaved changes are saved first. */
  async function apply() {
    if (!dirty || (await save())) {
      navigate(`/projects/${id}/apply`);
    }
  }

  async function exportPdf() {
    setError("");
    setExporting(true);
    try {
      const bytes = await cvPdf(document);
      download(
        `${fileName}.pdf`,
        new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "application/pdf" }),
      );
    } catch (failure) {
      console.error("CV export failed", failure);
      setError(copy.common.error);
    } finally {
      setExporting(false);
    }
  }

  const years = (value: number) => formatYears(value, locale, text.yearsUnit);

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
      <div className="cv-grid">
        <section className="card" aria-labelledby="cv-content-title">
          <h2 id="cv-content-title">{text.contentTitle}</h2>

          <h3 className="section-title">{text.designTitle}</h3>
          <div className="design-grid">
            <label>
              {text.languageLabel}
              <select
                className="select-field"
                value={cvLanguage}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    language: event.target.value as CvLanguage,
                  }))
                }
              >
                {CV_LANGUAGES.map((option) => (
                  <option key={option} value={option}>
                    {text.languageNames[option]}
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="choice-row">
              <legend>{text.themeLabel}</legend>
              {CV_THEME_IDS.map((theme) => (
                <label
                  key={theme}
                  className={`swatch ${draft.design.theme === theme ? "selected" : ""}`}
                  title={text.themes[theme]}
                >
                  <input
                    type="radio"
                    className="visually-hidden"
                    name="cv-theme"
                    checked={draft.design.theme === theme}
                    onChange={() => setDesign({ theme })}
                  />
                  <span
                    aria-hidden="true"
                    className="swatch-color"
                    style={{
                      background: `linear-gradient(135deg, ${cssColor(CV_THEMES[theme].panel)} 0 55%, ${cssColor(CV_THEMES[theme].accent)} 55% 100%)`,
                    }}
                  />
                  <span className="swatch-name">{text.themes[theme]}</span>
                </label>
              ))}
            </fieldset>
            <fieldset className="choice-row">
              <legend>{text.layoutLabel}</legend>
              {CV_LAYOUTS.map((layout) => (
                <label
                  key={layout}
                  className={`layout-choice ${draft.design.layout === layout ? "selected" : ""}`}
                >
                  <input
                    type="radio"
                    className="visually-hidden"
                    name="cv-layout"
                    checked={draft.design.layout === layout}
                    onChange={() => setDesign({ layout })}
                  />
                  <span className={`layout-thumb thumb-${layout}`} aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                  <span>{text.layouts[layout]}</span>
                </label>
              ))}
            </fieldset>
            <fieldset className="choice-row">
              <legend>{text.shapeLabel}</legend>
              {PHOTO_SHAPES.map((shape) => (
                <label
                  key={shape}
                  className={`chip ${draft.design.photoShape === shape ? "selected" : ""}`}
                >
                  <input
                    type="radio"
                    className="visually-hidden"
                    name="cv-shape"
                    checked={draft.design.photoShape === shape}
                    onChange={() => setDesign({ photoShape: shape })}
                  />
                  {text.shapes[shape]}
                </label>
              ))}
            </fieldset>
          </div>

          <h3 className="section-title">{text.photoTitle}</h3>
          {experience.images.length === 0 ? (
            <p className="muted small">
              {text.photoHint}{" "}
              <a className="link" href="/experience" onClick={linkHandler("/experience")}>
                {copy.fit.toExperience}
              </a>
            </p>
          ) : (
            <div className="photo-choice" role="radiogroup" aria-label={text.photoTitle}>
              {experience.images.map((image, index) => (
                <label key={image.id} className={draft.imageId === image.id ? "selected" : ""}>
                  <input
                    type="radio"
                    className="visually-hidden"
                    name="cv-photo"
                    checked={draft.imageId === image.id}
                    onChange={() => setDraft((current) => ({ ...current, imageId: image.id }))}
                  />
                  <img src={image.dataUrl} alt={copy.experience.photoAlt(index + 1)} />
                </label>
              ))}
              <label className={draft.imageId === null ? "selected no-photo" : "no-photo"}>
                <input
                  type="radio"
                  className="visually-hidden"
                  name="cv-photo"
                  checked={draft.imageId === null}
                  onChange={() => setDraft((current) => ({ ...current, imageId: null }))}
                />
                <span>{text.noPhoto}</span>
              </label>
            </div>
          )}

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

          <div className="section-row">
            <h3 className="section-title">{text.skillsTitle}</h3>
            {draft.skills !== null && (
              <button
                type="button"
                className="link"
                onClick={() => setDraft((current) => ({ ...current, skills: null }))}
              >
                {text.skillsAuto}
              </button>
            )}
          </div>
          <p className="muted small">{text.skillsHint}</p>
          {rows.length === 0 ? (
            <p className="muted">{text.noSkills}</p>
          ) : (
            <ul className="skill-choices">
              {rows.map((row) => {
                const chosen = skills.includes(row.name);
                return (
                  <li key={row.name}>
                    <label className={`chip ${chosen ? "selected" : ""}`}>
                      <input
                        type="checkbox"
                        className="visually-hidden"
                        checked={chosen}
                        onChange={() => toggleSkill(row.name)}
                      />
                      {relevantTo(row.name, project) && (
                        <span className="relevant" aria-hidden="true">
                          ★
                        </span>
                      )}
                      {row.name}
                      <span className="chip-detail">{years(row.years)}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}

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
                        onChange={() => toggleReference(reference.id)}
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
                          onClick={() => moveReference(reference.id, -1)}
                          disabled={position === 0}
                          aria-label={`${text.up}: ${reference.organization}`}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="pill"
                          onClick={() => moveReference(reference.id, 1)}
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
            <button
              type="button"
              className="pill"
              onClick={() => void exportPdf()}
              disabled={exporting}
            >
              <DownloadIcon />
              {exporting ? copy.common.working : text.pdf}
            </button>
            <button type="button" className="pill" onClick={() => void apply()} disabled={busy}>
              {text.applyWithCv}
            </button>
          </div>
        </section>
        <section className="card" aria-labelledby="preview-title">
          <h2 id="preview-title">{text.previewTitle}</h2>
          <CvPreview cv={document} />
        </section>
      </div>
    </div>
  );
}

/** The framed photo as the PDF draws it, recomputed when photo, frame or theme change. */
function useFramedPhoto(cv: CvDocument): string | null {
  const [framed, setFramed] = useState<string | null>(null);
  const frame = cssColor(frameColor(cv));
  useEffect(() => {
    let active = true;
    if (!cv.photo) {
      setFramed(null);
      return;
    }
    void framedPhoto(cv.photo, cv.design.photoShape, frameColor(cv), 360).then(
      (url) => active && setFramed(url),
    );
    return () => {
      active = false;
    };
  }, [cv.photo, cv.design.photoShape, frame]);
  return framed;
}

/** The same layouts as the PDF, scaled to the preview column. */
function CvPreview({ cv }: { cv: CvDocument }) {
  const photo = useFramedPhoto(cv);
  const layout = cv.design.layout;
  const P = cv.palette;
  const style = {
    "--cv-panel": cssColor(P.panel),
    "--cv-panel-text": cssColor(P.panelText),
    "--cv-panel-muted": cssColor(P.panelMuted),
    "--cv-panel-track": cssColor(P.panelTrack),
    "--cv-accent": cssColor(P.accent),
    "--cv-tint": cssColor(P.tint),
    "--cv-track": cssColor(P.track),
  } as CSSProperties;
  const longest = Math.max(...cv.matrix.map((row) => row.years), 1);
  const share = (years: number) => `${Math.max(4, (years / longest) * 100)}%`;
  const dated = layout === "classic";

  const identity = (
    <div className="cv-identity">
      <h3 className="cv-name">{cv.name || "CV"}</h3>
      {cv.headline && <p className="cv-headline">{cv.headline}</p>}
      {cv.experience && <span className="cv-pill">{cv.experience}</span>}
    </div>
  );
  const contactLines = cv.contact.map((entry) => (
    <p key={entry.kind} className="cv-contact">
      {entry.value}
    </p>
  ));
  const contact = cv.contact.length > 0 && (
    <section>
      <h4>{cv.labels.contact}</h4>
      {contactLines}
    </section>
  );
  const matrixBars = cv.matrix.length > 0 && (
    <section>
      <h4>{cv.labels.matrix}</h4>
      <div className={layout === "modern" ? "cv-skill-grid" : undefined}>
        {cv.matrix.map((row) => (
          <div key={row.name} className="cv-skill">
            <div>
              <strong>{row.name}</strong>
              <span>{row.yearsLabel}</span>
            </div>
            <span className="cv-bar">
              <span style={{ width: share(row.years) }} />
            </span>
          </div>
        ))}
      </div>
    </section>
  );
  const matrixTable = cv.matrix.length > 0 && (
    <section>
      <h4>{cv.labels.matrix}</h4>
      <table className="cv-table">
        <thead>
          <tr>
            <th>{cv.labels.skillColumn}</th>
            <th aria-hidden="true" />
            <th>{cv.labels.yearsColumn}</th>
            <th>{cv.labels.projectsColumn}</th>
            <th>{cv.labels.lastColumn}</th>
          </tr>
        </thead>
        <tbody>
          {cv.matrix.map((row) => (
            <tr key={row.name}>
              <td>
                <strong>{row.name}</strong>
              </td>
              <td>
                <span className="cv-bar">
                  <span style={{ width: share(row.years) }} />
                </span>
              </td>
              <td>{row.yearsLabel}</td>
              <td>{row.projects}</td>
              <td>{row.lastUsed}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
  const summary = cv.summary && (
    <section>
      <h4>{cv.labels.profile}</h4>
      <p className="cv-text">{cv.summary}</p>
    </section>
  );
  const roles = cv.roles.length > 0 && (
    <section>
      <h4>{cv.labels.roles}</h4>
      {cv.roles.map((role) => (
        <p key={role.name} className="cv-role">
          <span>{role.name}</span>
          <strong>{role.yearsLabel}</strong>
        </p>
      ))}
    </section>
  );
  const projects = cv.references.length > 0 && (
    <section>
      <h4>{cv.labels.projects}</h4>
      {cv.references.map((reference, index) => (
        <div
          key={`${reference.organization}-${index}`}
          className={dated ? "cv-entry dated" : "cv-entry"}
        >
          {dated && <span className="cv-date">{reference.period}</span>}
          <div>
            <div className="cv-entry-head">
              <strong>{reference.organization}</strong>
              {!dated && <span>{reference.period}</span>}
            </div>
            <p className="cv-entry-role">{reference.role}</p>
            <p className="cv-text">{reference.contribution}</p>
            {reference.skills.length > 0 && (
              <p className="cv-tags">
                {reference.skills.map((skill) => (
                  <span key={skill}>{skill}</span>
                ))}
              </p>
            )}
          </div>
        </div>
      ))}
    </section>
  );
  const education = cv.education.length > 0 && (
    <section>
      <h4>{cv.labels.education}</h4>
      {cv.education.map((entry) => (
        <div
          key={`${entry.degree}-${entry.institution}`}
          className={dated ? "cv-entry dated plain" : "cv-education"}
        >
          {dated && <span className="cv-date">{entry.period}</span>}
          <div>
            <strong>{entry.degree}</strong>
            <span className="cv-muted">
              {[entry.institution, dated ? "" : entry.period].filter(Boolean).join(" · ")}
            </span>
            {entry.note && <span className="cv-muted">{entry.note}</span>}
          </div>
        </div>
      ))}
    </section>
  );
  const languages =
    cv.languages.length > 0 &&
    (dated ? (
      <section>
        <h4>{cv.labels.languages}</h4>
        <p>{cv.languages.map((entry) => `${entry.name} – ${entry.level}`).join(" · ")}</p>
      </section>
    ) : (
      <section>
        <h4>{cv.labels.languages}</h4>
        {cv.languages.map((entry) => (
          <div key={entry.name} className="cv-language">
            <div>
              <strong>{entry.name}</strong>
              <span className="cv-dots" aria-label={entry.level}>
                {Array.from({ length: 5 }, (_, dot) => (
                  <i key={dot} className={dot < entry.dots ? "on" : ""} />
                ))}
              </span>
            </div>
            <span className="cv-muted">{entry.level}</span>
          </div>
        ))}
      </section>
    ));
  const certificates = cv.certificates.length > 0 && (
    <section>
      <h4>{cv.labels.certificates}</h4>
      {cv.certificates.map((certificate) => (
        <p key={certificate.name} className="cv-certificate">
          <strong>{certificate.name}</strong>
          {certificate.detail && <span className="cv-muted">{certificate.detail}</span>}
        </p>
      ))}
    </section>
  );
  const hobbies = cv.hobbies.length > 0 && (
    <section>
      <h4>{cv.labels.hobbies}</h4>
      <p>{cv.hobbies.join(" · ")}</p>
    </section>
  );
  const image = photo && <img className="cv-photo" src={photo} alt="" />;

  if (layout === "sidebar" || layout === "sidebarRight") {
    return (
      <article className={`cv-sheet layout-${layout}`} style={style}>
        <aside className="cv-side cv-panel">
          {image}
          {contact}
          {matrixBars}
          {languages}
          {certificates}
          {hobbies}
        </aside>
        <div className="cv-main">
          {identity}
          {summary}
          {roles}
          {projects}
          {education}
        </div>
      </article>
    );
  }
  if (layout === "header") {
    return (
      <article className="cv-sheet layout-header" style={style}>
        <header className="cv-band cv-panel">
          {image}
          {identity}
          <div className="cv-band-contact">{contactLines}</div>
        </header>
        <div className="cv-columns">
          <div className="cv-main">
            {summary}
            {roles}
            {projects}
          </div>
          <aside className="cv-aside">
            {matrixBars}
            {languages}
            {education}
            {certificates}
            {hobbies}
          </aside>
        </div>
      </article>
    );
  }
  if (layout === "classic") {
    return (
      <article className="cv-sheet layout-classic" style={style}>
        <header className="cv-head">
          <div>
            {identity}
            {cv.contact.map((entry) => (
              <p key={entry.kind} className="cv-muted cv-contact">
                {entry.value.replace(/\n/g, ", ")}
              </p>
            ))}
          </div>
          {image}
        </header>
        <div className="cv-main">
          {summary}
          {matrixTable}
          {roles}
          {projects}
          {education}
          {languages}
          {certificates}
          {hobbies}
        </div>
      </article>
    );
  }
  return (
    <article className="cv-sheet layout-modern" style={style}>
      <header className="cv-head">
        <div>
          {identity}
          <p className="cv-muted cv-contact-line">
            {cv.contact.map((entry) => entry.value.replace(/\n/g, ", ")).join("  ·  ")}
          </p>
        </div>
        {image}
      </header>
      <div className="cv-main">
        {summary}
        {matrixBars}
      </div>
      <div className="cv-columns">
        <div className="cv-main">{projects}</div>
        <aside className="cv-aside">
          {roles}
          {education}
          {languages}
          {certificates}
          {hobbies}
        </aside>
      </div>
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

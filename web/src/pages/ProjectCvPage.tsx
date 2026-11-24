import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  CV_LANGUAGES,
  CV_LAYOUTS,
  CV_THEME_IDS,
  CV_THEMES,
  cssColor,
  PHOTO_SHAPES,
  type CvDesign,
  type CvLanguage,
  type CvRole,
  alphabetical,
  DEFAULT_ROLE_COUNT,
  defaultSkills,
  FIT_LIMITS,
  formatYears,
  referenceLabel,
  relevantTo,
  roleRows,
  skillRows,
  totalYears,
  yearsSetFor,
  evidence,
  toApiError,
  type EvidenceSuggestion,
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
import { EvidencePanel } from "../components/Assessment";
import { candidateFrom } from "../lib/assessment";
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
  const detectedRoles = useMemo(
    () => (experience ? roleRows(experience.references) : []),
    [experience],
  );
  const [newRole, setNewRole] = useState("");

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
    skillYears: draft.skillYears,
    roles: draft.roles,
    photo,
    language: cvLanguage,
    design: draft.design,
  });
  const setDesign = (change: Partial<CvDesign>) =>
    setDraft((current) => ({ ...current, design: { ...current.design, ...change } }));

  // Evidence follows every change to the draft; nothing runs the model.
  const liveEvidence = project.assessment
    ? evidence(project.assessment, candidateFrom(experience), {
        summary: draft.summary,
        referenceIds: draft.referenceIds,
        skills,
      })
    : null;

  /** A suggestion only ever selects existing data; the person applies it. */
  const applySuggestion = (suggestion: EvidenceSuggestion) => {
    if (suggestion.kind === "select_reference") {
      setDraft((current) =>
        current.referenceIds.includes(suggestion.referenceId)
          ? current
          : {
              ...current,
              referenceIds: [...current.referenceIds, suggestion.referenceId].slice(
                0,
                FIT_LIMITS.cvReferences,
              ),
            },
      );
    } else if (suggestion.kind === "add_skill") {
      setDraft((current) => {
        const list = current.skills ?? recommended;
        return list.includes(suggestion.skill)
          ? current
          : { ...current, skills: [...list, suggestion.skill].slice(0, FIT_LIMITS.cvSkills) };
      });
    }
    setStatus("");
  };

  const writeInSummary = () => {
    const field = window.document.getElementById("cv-summary");
    field?.scrollIntoView({ behavior: "smooth", block: "center" });
    field?.focus();
  };

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

  // Years set by hand: at least one, at most the whole professional experience.
  const maxYears = Math.max(FIT_LIMITS.cvMinYears, totalYears(references));
  const sortedRows = alphabetical(rows, locale);
  const skillLimitReached = skills.length >= FIT_LIMITS.cvSkills;

  const setSkills = (next: string[]) => {
    setDraft((current) => ({ ...current, skills: next.slice(0, FIT_LIMITS.cvSkills) }));
    setStatus("");
  };

  /** Sets the years of a skill; the computed value removes the hand-set one. */
  const setSkillYears = (name: string, value: number | null) =>
    setDraft((current) => {
      const skillYears = Object.fromEntries(
        Object.entries(current.skillYears).filter(
          ([skill]) => skill.toLowerCase() !== name.toLowerCase(),
        ),
      );
      const detected = rows.find((row) => row.name === name)?.years;
      return {
        ...current,
        skillYears:
          value === null || value === detected ? skillYears : { ...skillYears, [name]: value },
      };
    });

  const defaultRoles: CvRole[] = detectedRoles
    .slice(0, DEFAULT_ROLE_COUNT)
    .map((row) => ({ name: row.name, years: null }));
  const chosenRoles = draft.roles ?? defaultRoles;
  const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const roleChoice = (name: string) => chosenRoles.find((role) => sameName(role.name, name));
  const customRoles = chosenRoles.filter(
    (role) => !detectedRoles.some((row) => sameName(row.name, role.name)),
  );
  const roleLimitReached = chosenRoles.length >= FIT_LIMITS.cvRoles;

  const updateRoles = (change: (roles: CvRole[]) => CvRole[]) => {
    setDraft((current) => ({
      ...current,
      roles: change(current.roles ?? defaultRoles).slice(0, FIT_LIMITS.cvRoles),
    }));
    setStatus("");
  };

  const toggleRole = (name: string) =>
    updateRoles((roles) =>
      roles.some((role) => sameName(role.name, name))
        ? roles.filter((role) => !sameName(role.name, name))
        : [...roles, { name, years: null }],
    );

  const setRoleYears = (name: string, value: number | null) => {
    const detected = detectedRoles.find((row) => sameName(row.name, name))?.years;
    updateRoles((roles) =>
      roles.map((role) =>
        sameName(role.name, name)
          ? { ...role, years: value === detected && detected !== undefined ? null : value }
          : role,
      ),
    );
  };

  const addRole = () => {
    const name = newRole.trim().slice(0, 80);
    if (!name || roleLimitReached) {
      return;
    }
    if (!roleChoice(name)) {
      const detected = detectedRoles.find((row) => sameName(row.name, name));
      updateRoles((roles) => [
        ...roles,
        detected ? { name: detected.name, years: null } : { name, years: FIT_LIMITS.cvMinYears },
      ]);
    }
    setNewRole("");
  };

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
    <div className="page wide cv-page">
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
                id="cv-summary"
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

          <CvSection
            id="skills"
            title={text.skillsTitle}
            meta={
              rows.length > 0
                ? text.skillsChosen(
                    rows.filter((row) => skills.includes(row.name)).length,
                    rows.length,
                  )
                : ""
            }
          >
            {rows.length > 0 && (
              <span className="section-links">
                <button
                  type="button"
                  className="link"
                  onClick={() => setSkills(defaultSkills(rows, project, FIT_LIMITS.cvSkills))}
                  disabled={skills.length === Math.min(rows.length, FIT_LIMITS.cvSkills)}
                >
                  {text.selectAll}
                </button>
                <button
                  type="button"
                  className="link"
                  onClick={() => setSkills([])}
                  disabled={skills.length === 0}
                >
                  {text.deselectAll}
                </button>
                {draft.skills !== null && (
                  <button
                    type="button"
                    className="link"
                    onClick={() => setDraft((current) => ({ ...current, skills: null }))}
                  >
                    {text.skillsAuto}
                  </button>
                )}
              </span>
            )}
            <p className="muted small">{text.skillsHint}</p>
            {rows.length === 0 ? (
              <p className="muted">{text.noSkills}</p>
            ) : (
              <>
                {skillLimitReached && (
                  <p className="muted small">{text.skillsLimit(FIT_LIMITS.cvSkills)}</p>
                )}
                <ul className="year-list">
                  {sortedRows.map((row) => {
                    const set = yearsSetFor(draft.skillYears, row.name);
                    return (
                      <YearRow
                        key={row.name}
                        name={row.name}
                        relevant={relevantTo(row.name, project)}
                        chosen={skills.includes(row.name)}
                        canChoose={!skillLimitReached}
                        value={set ?? row.years}
                        detected={row.years}
                        max={maxYears}
                        years={years}
                        text={text}
                        onToggle={() => toggleSkill(row.name)}
                        onYears={(value) => setSkillYears(row.name, value)}
                      />
                    );
                  })}
                </ul>
              </>
            )}
          </CvSection>

          <CvSection
            id="roles"
            title={text.rolesTitle}
            meta={
              detectedRoles.length + customRoles.length > 0
                ? text.skillsChosen(chosenRoles.length, detectedRoles.length + customRoles.length)
                : ""
            }
          >
            {draft.roles !== null && (
              <span className="section-links">
                <button
                  type="button"
                  className="link"
                  onClick={() => setDraft((current) => ({ ...current, roles: null }))}
                >
                  {text.rolesAuto}
                </button>
              </span>
            )}
            <p className="muted small">{text.rolesHint}</p>
            {detectedRoles.length === 0 && customRoles.length === 0 ? (
              <p className="muted">{text.noRoles}</p>
            ) : (
              <ul className="year-list">
                {detectedRoles.map((row) => {
                  const choice = roleChoice(row.name);
                  return (
                    <YearRow
                      key={row.name}
                      name={row.name}
                      chosen={Boolean(choice)}
                      canChoose={!roleLimitReached}
                      value={choice?.years ?? row.years}
                      detected={row.years}
                      max={maxYears}
                      years={years}
                      text={text}
                      onToggle={() => toggleRole(row.name)}
                      onYears={(value) => setRoleYears(row.name, value)}
                    />
                  );
                })}
                {customRoles.map((role) => (
                  <YearRow
                    key={`custom-${role.name}`}
                    name={role.name}
                    chosen
                    canChoose
                    value={role.years ?? FIT_LIMITS.cvMinYears}
                    detected={null}
                    max={maxYears}
                    years={years}
                    text={text}
                    onRemove={() =>
                      updateRoles((roles) =>
                        roles.filter((entry) => !sameName(entry.name, role.name)),
                      )
                    }
                    onYears={(value) => setRoleYears(role.name, value ?? FIT_LIMITS.cvMinYears)}
                  />
                ))}
              </ul>
            )}
            <form
              className="role-add"
              onSubmit={(event) => {
                event.preventDefault();
                addRole();
              }}
            >
              <label>
                <span className="visually-hidden">{text.roleAddLabel}</span>
                <input
                  value={newRole}
                  onChange={(event) => setNewRole(event.target.value)}
                  placeholder={text.rolePlaceholder}
                  maxLength={80}
                  aria-label={text.roleAddLabel}
                />
              </label>
              <button type="submit" className="pill" disabled={!newRole.trim() || roleLimitReached}>
                {text.roleAdd}
              </button>
            </form>
            {roleLimitReached && (
              <p className="muted small">{text.rolesLimit(FIT_LIMITS.cvRoles)}</p>
            )}
          </CvSection>

          <CvSection
            id="references"
            title={text.referencesTitle}
            meta={
              references.length > 0
                ? text.skillsChosen(draft.referenceIds.length, references.length)
                : ""
            }
          >
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
          </CvSection>
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
      <EvidencePanel
        evidence={liveEvidence}
        experience={experience}
        copy={copy.assessment}
        onApply={applySuggestion}
        onWrite={writeInSummary}
      />
    </div>
  );
}

/** Whether a section of the CV editor was left open, remembered per browser. */
function storedOpen(id: string): boolean {
  try {
    return window.localStorage.getItem(`assma.cv.open.${id}`) === "1";
  } catch {
    return false;
  }
}

/** A collapsible part of the CV editor; the summary shows how much of it is on the CV. */
function CvSection({
  id,
  title,
  meta,
  children,
}: {
  id: string;
  title: string;
  meta: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(() => storedOpen(id));
  return (
    <details
      className="cv-section"
      open={open}
      onToggle={(event) => {
        const next = event.currentTarget.open;
        setOpen(next);
        try {
          window.localStorage.setItem(`assma.cv.open.${id}`, next ? "1" : "0");
        } catch {
          // Without storage the section simply starts closed next time.
        }
      }}
    >
      <summary>
        <h3 className="section-title">{title}</h3>
        {meta && <span className="cv-section-meta">{meta}</span>}
        <span className="cv-section-chevron" aria-hidden="true" />
      </summary>
      <div className="cv-section-body">{children}</div>
    </details>
  );
}

/**
 * One skill or role with its years: a checkbox to show it and, once shown, a slider from one
 * year to the whole professional experience.
 */
function YearRow({
  name,
  relevant = false,
  chosen,
  canChoose,
  value,
  detected,
  max,
  years,
  text,
  onToggle,
  onRemove,
  onYears,
}: {
  name: string;
  relevant?: boolean;
  chosen: boolean;
  canChoose: boolean;
  value: number;
  /** The computed years, or null for an entry the person added. */
  detected: number | null;
  max: number;
  years: (value: number) => string;
  text: Preferences["copy"]["cv"];
  onToggle?: () => void;
  onRemove?: () => void;
  onYears: (value: number | null) => void;
}) {
  const changed = detected !== null && value !== detected;
  return (
    <li className={`year-row ${chosen ? "chosen" : ""}`}>
      <label className="year-name">
        {onToggle ? (
          <input
            type="checkbox"
            checked={chosen}
            disabled={!chosen && !canChoose}
            onChange={onToggle}
          />
        ) : (
          <span className="year-custom" aria-hidden="true">
            +
          </span>
        )}
        {relevant && (
          <span className="relevant" aria-hidden="true">
            ★
          </span>
        )}
        <span className="year-label" title={name}>
          {name}
        </span>
      </label>
      {chosen ? (
        <input
          type="range"
          className="year-range"
          min={FIT_LIMITS.cvMinYears}
          max={max}
          step={0.5}
          value={Math.min(max, Math.max(FIT_LIMITS.cvMinYears, value))}
          aria-label={text.yearsLabel(name)}
          aria-valuetext={years(value)}
          onChange={(event) => onYears(Number(event.target.value))}
        />
      ) : (
        <span />
      )}
      <span
        className={`year-value ${changed ? "changed" : ""}`}
        title={detected === null ? text.roleCustom : text.yearsDetected(years(detected))}
      >
        {years(value)}
      </span>
      {onRemove ? (
        <button
          type="button"
          className="icon-button"
          onClick={onRemove}
          aria-label={text.roleRemove(name)}
          title={text.roleRemove(name)}
        >
          ×
        </button>
      ) : changed && chosen ? (
        <button
          type="button"
          className="icon-button"
          onClick={() => onYears(null)}
          aria-label={`${text.yearsReset}: ${name}`}
          title={`${text.yearsReset} (${years(detected)})`}
        >
          ↺
        </button>
      ) : (
        <span />
      )}
    </li>
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

/** Layouts that show the skill matrix as a two-column grid. */
const GRID_MATRIX: readonly CvDesign["layout"][] = ["modern", "banner", "minimal", "margin"];

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
      <div className={GRID_MATRIX.includes(layout) ? "cv-skill-grid" : undefined}>
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
  const contactLine = cv.contact.length > 0 && (
    <p className="cv-muted cv-contact-line">
      {cv.contact.map((entry) => entry.value.replace(/\n/g, ", ")).join("  ·  ")}
    </p>
  );

  if (layout === "sidebar" || layout === "sidebarRight" || layout === "sidebarSoft") {
    return (
      <article className={`cv-sheet layout-${layout}`} style={style}>
        <aside className={`cv-side ${layout === "sidebarSoft" ? "cv-soft" : "cv-panel"}`}>
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
  if (layout === "banner") {
    return (
      <article className="cv-sheet layout-banner" style={style}>
        <header className="cv-banner cv-panel">
          {image}
          {identity}
          {contactLine}
        </header>
        <div className="cv-main">
          {summary}
          {matrixBars}
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
  if (layout === "minimal" || layout === "margin") {
    return (
      <article className={`cv-sheet layout-${layout}`} style={style}>
        <header className="cv-head">
          <div>
            {identity}
            {contactLine}
          </div>
          {image}
        </header>
        <div className="cv-main">
          {summary}
          {matrixBars}
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
  if (layout === "columns") {
    return (
      <article className="cv-sheet layout-columns" style={style}>
        <header className="cv-head photo-left">
          {image}
          <div>
            {identity}
            {contactLine}
          </div>
        </header>
        <div className="cv-main">{summary}</div>
        <div className="cv-columns even">
          <div className="cv-main">{projects}</div>
          <aside className="cv-aside">
            {matrixBars}
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

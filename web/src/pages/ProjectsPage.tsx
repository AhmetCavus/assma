import { useEffect, useMemo, useRef, useState } from "react";
import {
  assessProject,
  summariseAssessment,
  type AssessmentSummary,
  matchesSearch,
  PROJECT_STATUSES,
  toApiError,
  type Project,
  type ProjectChange,
  type ProjectStatus,
} from "@assma/shared";
import { AssessmentCell } from "../components/Assessment";
import { Icon } from "../components/Icon";
import { QuickAdd } from "../components/QuickAdd";
import { candidateFrom, cvInputOf, useEconomicPreferences, useExperience } from "../lib/assessment";
import type { Preferences } from "../lib/preferences";
import { projectsChanged, useProjects } from "../lib/projects";
import { linkHandler, navigate } from "../lib/router";
import type { Session } from "../lib/session";
import { takeFlash } from "../lib/flash";

export function StatusBadge({ status, label }: { status: ProjectStatus; label: string }) {
  return <span className={`status-badge status-${status}`}>{label}</span>;
}

export function ProjectsPage({
  session,
  preferences,
}: {
  session: Session;
  preferences: Preferences;
}) {
  const { copy, locale } = preferences;
  const text = copy.projects;
  const { api, signOut } = session;
  const { projects, failed } = useProjects(api, () => signOut(copy.common.sessionExpired));
  const experience = useExperience(api, () => signOut(copy.common.sessionExpired));
  const economic = useEconomicPreferences(api, () => signOut(copy.common.sessionExpired));
  // The four dimensions per project, computed here like on the project page.
  const summaries = useMemo(() => {
    const result = new Map<string, AssessmentSummary>();
    if (!experience || !economic) {
      return result;
    }
    const candidate = candidateFrom(experience);
    for (const project of projects ?? []) {
      if (project.assessment) {
        const view = assessProject({
          assessment: project.assessment,
          candidate,
          cv: cvInputOf(project),
          conditions: project.conditions,
          preferences: economic.economic,
        });
        result.set(project.id, summariseAssessment(view, project.assessment.assessedAt));
      }
    }
    return result;
  }, [projects, experience, economic?.economic]);
  const [archived, setArchived] = useState(false);
  const [filter, setFilter] = useState<ProjectStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState(takeFlash);
  const [error, setError] = useState("");

  // Drafts wait in their own list until they are processed.
  const drafts = (projects ?? []).filter((project) => project.draft && !project.archived);
  const active = (projects ?? []).filter((project) => !project.archived && !project.draft);
  const archive = (projects ?? []).filter((project) => project.archived);
  const shown = (archived ? archive : active).filter(
    (project) => (filter === "all" || project.status === filter) && matchesSearch(project, query),
  );
  const date = new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  async function change(project: Project, change: ProjectChange, message: string) {
    setError("");
    try {
      await api.changeProject(project.id, change);
      setStatus(message);
      projectsChanged();
    } catch (failure) {
      if (toApiError(failure).isUnauthorized) {
        signOut(copy.common.sessionExpired);
      } else {
        setError(copy.common.error);
      }
    }
  }

  async function remove(project: Project) {
    if (!window.confirm(text.confirmDelete(project.title))) {
      return;
    }
    setError("");
    try {
      await api.deleteProject(project.id);
      setStatus(text.deleted);
      projectsChanged();
    } catch (failure) {
      if (toApiError(failure).isUnauthorized) {
        signOut(copy.common.sessionExpired);
      } else {
        setError(copy.common.error);
      }
    }
  }

  const emptyMessage =
    (archived ? archive : active).length === 0
      ? archived
        ? text.emptyArchive
        : text.empty
      : text.noMatch;

  return (
    <div className="page wide">
      <div className="page-header">
        <div>
          <h1>{text.title}</h1>
          <p className="lead">{text.lead}</p>
        </div>
        <a className="button primary" href="/projects/new" onClick={linkHandler("/projects/new")}>
          <Icon name="plus" />
          {text.newProject}
        </a>
      </div>
      <section className="card quick-card">
        <QuickAdd session={session} preferences={preferences} />
      </section>
      <p className="status" aria-live="polite">
        {status}
      </p>
      {(error || failed) && (
        <p className="alert error" role="alert">
          {error || copy.common.error}
        </p>
      )}
      {drafts.length > 0 && (
        <section className="card draft-card" aria-labelledby="drafts-title">
          <h2 id="drafts-title">{text.drafts.title(drafts.length)}</h2>
          <p className="muted small">{text.drafts.lead}</p>
          <ul className="draft-list">
            {drafts.map((project) => (
              <li key={project.id}>
                <span className="draft-body">
                  <strong>{project.title}</strong>
                  <span className="muted small draft-source">
                    <span className="draft-kind">
                      {project.brief ? text.drafts.fromText : text.drafts.fromLink}
                    </span>
                    {project.sourceUrl ? (
                      <a
                        href={project.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={text.drafts.source}
                      >
                        {project.sourceUrl}
                      </a>
                    ) : (
                      project.brief.replace(/\s+/g, " ").slice(0, 160)
                    )}
                  </span>
                </span>
                <span className="muted small draft-date">
                  {date.format(new Date(project.createdAt))}
                </span>
                <a
                  className="pill"
                  href={`/projects/${project.id}/edit`}
                  onClick={linkHandler(`/projects/${project.id}/edit`)}
                >
                  {text.drafts.process}
                </a>
                <button
                  type="button"
                  className="button destructive soft compact"
                  onClick={() => void remove(project)}
                >
                  <Icon name="trash" size={16} />
                  {text.delete}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="chips" role="tablist" aria-label={text.title}>
        <button
          type="button"
          role="tab"
          aria-selected={!archived}
          className={`chip ${!archived ? "selected" : ""}`}
          onClick={() => setArchived(false)}
        >
          {text.active(active.length)}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={archived}
          className={`chip ${archived ? "selected" : ""}`}
          onClick={() => setArchived(true)}
        >
          {text.archive(archive.length)}
        </button>
      </div>
      <section className="card filter-card">
        <input
          type="search"
          className="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={text.search}
          aria-label={text.search}
        />
        <div className="chips">
          {(["all", ...PROJECT_STATUSES] as const).map((option) => (
            <button
              key={option}
              type="button"
              className={`chip ${filter === option ? "selected" : ""}`}
              aria-pressed={filter === option}
              onClick={() => setFilter(option)}
            >
              {option === "all" ? text.all : text.status[option]}
            </button>
          ))}
        </div>
      </section>
      <section className="card table-card">
        {projects === null ? (
          !failed && <p className="muted">{copy.common.loading}</p>
        ) : shown.length === 0 ? (
          <p className="muted">{emptyMessage}</p>
        ) : (
          <table className="project-table">
            <thead>
              <tr>
                <th scope="col">{text.columnProject}</th>
                <th scope="col">{text.columnStatus}</th>
                <th scope="col">{text.columnTech}</th>
                <th scope="col">{text.columnDate}</th>
                <th scope="col">{text.columnFit}</th>
                <th scope="col">
                  <span className="visually-hidden">{text.open}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((project) => (
                <tr key={project.id}>
                  <td>
                    <a
                      className="project-link"
                      href={`/projects/${project.id}`}
                      onClick={linkHandler(`/projects/${project.id}`)}
                    >
                      <strong>{project.title}</strong>
                      <span className="muted small">
                        {[project.company, project.agency].filter(Boolean).join(" · ")}
                      </span>
                    </a>
                  </td>
                  <td data-label={text.columnStatus}>
                    {project.draft ? (
                      <span className="status-badge status-draft">{text.drafts.badge}</span>
                    ) : (
                      <StatusBadge status={project.status} label={text.status[project.status]} />
                    )}
                  </td>
                  <td data-label={text.columnTech}>{project.tech.slice(0, 3).join(" · ")}</td>
                  <td data-label={text.columnDate}>{date.format(new Date(project.createdAt))}</td>
                  <td data-label={text.columnFit}>
                    <AssessmentCell
                      summary={summaries.get(project.id) ?? null}
                      legacyScore={project.fit ? project.fit.score : undefined}
                      copy={copy.assessment}
                    />
                  </td>
                  <td className="row-actions">
                    <RowMenu
                      project={project}
                      preferences={preferences}
                      onOpen={() => navigate(`/projects/${project.id}`)}
                      onEdit={() => navigate(`/projects/${project.id}/edit`)}
                      onStatus={(next) =>
                        void change(project, { status: next }, text.statusChanged)
                      }
                      onArchive={() =>
                        void change(
                          project,
                          { archived: !project.archived },
                          project.archived ? text.restored : text.archived,
                        )
                      }
                      onDelete={() => void remove(project)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function RowMenu({
  project,
  preferences,
  onOpen,
  onEdit,
  onStatus,
  onArchive,
  onDelete,
}: {
  project: Project;
  preferences: Preferences;
  onOpen: () => void;
  onEdit: () => void;
  onStatus: (status: ProjectStatus) => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const text = preferences.copy.projects;
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const outside = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape);
    root.current?.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus();
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const act = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  return (
    <div className="row-menu" ref={root}>
      <button
        ref={button}
        type="button"
        className="icon-button small-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={text.actions(project.title)}
        title={text.actions(project.title)}
        onClick={() => setOpen((current) => !current)}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor">
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>
      {open && (
        <div className="menu" role="menu" aria-label={text.actions(project.title)}>
          <button type="button" role="menuitem" onClick={act(onOpen)}>
            {text.open}
          </button>
          <button type="button" role="menuitem" onClick={act(onEdit)}>
            {text.edit}
          </button>
          <p className="menu-label">{text.setStatus}</p>
          {PROJECT_STATUSES.map((option) => (
            <button
              key={option}
              type="button"
              role="menuitemradio"
              aria-checked={project.status === option}
              onClick={act(() => onStatus(option))}
              disabled={project.status === option}
            >
              {text.status[option]}
            </button>
          ))}
          <hr />
          <button type="button" role="menuitem" onClick={act(onArchive)}>
            {project.archived ? text.restore : text.toArchive}
          </button>
          <button type="button" role="menuitem" className="danger" onClick={act(onDelete)}>
            <Icon name="trash" size={16} />
            {text.delete}
          </button>
        </div>
      )}
    </div>
  );
}

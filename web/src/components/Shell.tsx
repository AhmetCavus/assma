import type { ReactNode } from "react";
import { GrapeMark, Wordmark } from "./GrapeMark";
import { GitHubLink, LocaleSelect, ThemeButton } from "./Controls";
import type { Preferences } from "../lib/preferences";
import { useProjects } from "../lib/projects";
import { linkHandler } from "../lib/router";
import type { Session } from "../lib/session";

const ICONS: Record<string, ReactNode> = {
  "/dashboard": (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  "/projects": (
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
  ),
  "/experience": (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
    </>
  ),
};

/** Signed-in workspace. Dashboard is the first navigation item; later pages follow it. */
export function Shell({
  session,
  preferences,
  path,
  children,
}: {
  session: Session;
  preferences: Preferences;
  path: string;
  children: ReactNode;
}) {
  const { copy } = preferences;
  // Progress follows Experience in a later iteration.
  const items = [
    { path: "/dashboard", label: copy.nav.dashboard },
    { path: "/projects", label: copy.nav.projects },
    { path: "/experience", label: copy.nav.experience },
  ];
  const { projects } = useProjects(session.api, () => session.signOut(copy.common.sessionExpired));
  const recent = (projects ?? []).filter((project) => !project.archived).slice(0, 6);
  return (
    <div className="workspace">
      <aside className="sidebar">
        <a href="/" onClick={linkHandler("/")} className="home-link">
          <Wordmark />
        </a>
        <nav aria-label={copy.nav.label}>
          <ul className="nav-list">
            {items.map((item) => (
              <li key={item.path}>
                <a
                  href={item.path}
                  onClick={linkHandler(item.path)}
                  className={path.startsWith(item.path) ? "active" : ""}
                  aria-current={path === item.path ? "page" : undefined}
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="18"
                    height="18"
                    aria-hidden="true"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    {ICONS[item.path]}
                  </svg>
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <section className="sidebar-projects" aria-labelledby="sidebar-projects-title">
          <h3 id="sidebar-projects-title">{copy.projects.sidebarTitle}</h3>
          <ul>
            {recent.map((project) => (
              <li key={project.id}>
                <a
                  href={`/projects/${project.id}`}
                  onClick={linkHandler(`/projects/${project.id}`)}
                  className={path.startsWith(`/projects/${project.id}`) ? "active" : ""}
                  aria-current={path === `/projects/${project.id}` ? "page" : undefined}
                >
                  <GrapeMark size={18} />
                  <span>{project.company || project.title}</span>
                </a>
              </li>
            ))}
          </ul>
          <a className="pill" href="/projects/new" onClick={linkHandler("/projects/new")}>
            <span aria-hidden="true">+</span>
            {copy.projects.capture}
          </a>
        </section>
        <div className="sidebar-footer">
          <div className="sidebar-controls">
            <LocaleSelect preferences={preferences} />
            <ThemeButton preferences={preferences} />
            <GitHubLink preferences={preferences} compact />
          </div>
          <button type="button" className="link" onClick={() => session.signOut()}>
            {copy.auth.logout}
          </button>
        </div>
      </aside>
      <main className="workspace-main">{children}</main>
    </div>
  );
}

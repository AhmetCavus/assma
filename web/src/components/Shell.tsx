import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import { AssistantProvider } from "../lib/assistant";
import { AssmaDock } from "./AssmaDock";
import { ShortcutButton, ShortcutGuide } from "./ShortcutGuide";
import { SiteFooter } from "./SiteFooter";
import { GrapeMark, Wordmark } from "./GrapeMark";
import { GitHubLink, LocaleSelect, ThemeButton } from "./Controls";
import type { Preferences } from "../lib/preferences";
import { useProjects } from "../lib/projects";
import { linkHandler } from "../lib/router";
import type { Session } from "../lib/session";

const ICONS: Record<string, IconName> = {
  "/dashboard": "grid",
  "/projects": "folder",
  "/experience": "user",
  "/progress": "chart",
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
  const items = [
    { path: "/dashboard", label: copy.nav.dashboard },
    { path: "/projects", label: copy.nav.projects },
    { path: "/experience", label: copy.nav.experience },
    { path: "/progress", label: copy.nav.progress },
  ];
  const { projects } = useProjects(session.api, () => session.signOut(copy.common.sessionExpired));
  const recent = (projects ?? [])
    .filter((project) => !project.archived && !project.draft)
    .slice(0, 6);
  return (
    <AssistantProvider session={session} preferences={preferences} path={path}>
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
                    className={
                      path.startsWith(item.path) ||
                      (item.path === "/projects" && path.startsWith("/applications/"))
                        ? "active"
                        : ""
                    }
                    aria-current={path === item.path ? "page" : undefined}
                  >
                    <Icon name={ICONS[item.path] ?? "grid"} />
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
            <a className="pill primary" href="/projects/new" onClick={linkHandler("/projects/new")}>
              <Icon name="plus" size={16} />
              {copy.projects.capture}
            </a>
          </section>
          <div className="sidebar-footer">
            <div className="sidebar-controls">
              <LocaleSelect preferences={preferences} />
              <ThemeButton preferences={preferences} />
              <ShortcutButton preferences={preferences} />
              <GitHubLink preferences={preferences} compact />
            </div>
            <button type="button" className="link" onClick={() => session.signOut()}>
              {copy.auth.logout}
            </button>
            <SiteFooter preferences={preferences} compact />
          </div>
        </aside>
        <main className="workspace-main">{children}</main>
        <AssmaDock preferences={preferences} />
        <ShortcutGuide preferences={preferences} />
      </div>
    </AssistantProvider>
  );
}

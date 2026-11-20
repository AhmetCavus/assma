import type { ReactNode } from "react";
import { Wordmark } from "./GrapeMark";
import { GitHubLink, LocaleSelect, ThemeButton } from "./Controls";
import type { Preferences } from "../lib/preferences";
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
  // Projects (between Dashboard and Experience) and Progress follow in later iterations.
  const items = [
    { path: "/dashboard", label: copy.nav.dashboard },
    { path: "/experience", label: copy.nav.experience },
  ];
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

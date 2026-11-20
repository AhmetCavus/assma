import { useEffect, useState } from "react";
import { toApiError, type AccountInfo } from "@assma/shared";
import { GrapeMark } from "../components/GrapeMark";
import type { Preferences } from "../lib/preferences";
import { useProjects } from "../lib/projects";
import { linkHandler } from "../lib/router";
import type { Session } from "../lib/session";

export function DashboardPage({
  session,
  preferences,
}: {
  session: Session;
  preferences: Preferences;
}) {
  const { copy, locale } = preferences;
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [references, setReferences] = useState<number | null>(null);
  const [error, setError] = useState("");
  const { api, signOut } = session;
  const { projects } = useProjects(api, () => signOut(copy.common.sessionExpired));
  const activeProjects = (projects ?? []).filter((project) => !project.archived).length;
  const archivedProjects = (projects ?? []).length - activeProjects;

  // The server confirms the session; an expired or revoked token returns to the login.
  useEffect(() => {
    let active = true;
    Promise.all([api.account(), api.experience()])
      .then(([next, experience]) => {
        if (active) {
          setAccount(next);
          setReferences(experience.references.length);
        }
      })
      .catch((failure: unknown) => {
        if (!active) {
          return;
        }
        if (toApiError(failure).isUnauthorized) {
          signOut(copy.common.sessionExpired);
        } else {
          setError(copy.common.error);
        }
      });
    return () => {
      active = false;
    };
  }, [api]);

  const today = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  return (
    <div className="page">
      <p className="eyebrow">{today}</p>
      <h1>{copy.dashboard.title}</h1>
      <p className="lead">
        {copy.dashboard.greeting(account?.name ?? "")} {copy.dashboard.lead}
      </p>
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      <section className="empty-card" aria-live="polite">
        <GrapeMark size={56} />
        <div>
          <h2>{copy.dashboard.emptyTitle}</h2>
          <p className="muted">{copy.dashboard.emptyLead}</p>
        </div>
      </section>
      {projects !== null && (
        <section className="empty-card">
          <div>
            <h2>{copy.dashboard.projectsTitle}</h2>
            <p className="muted">
              {projects.length === 0
                ? copy.dashboard.projectsEmpty
                : copy.dashboard.projectsCount(activeProjects, archivedProjects)}
            </p>
          </div>
          <a
            className="pill push-right"
            href={projects.length === 0 ? "/projects/new" : "/projects"}
            onClick={linkHandler(projects.length === 0 ? "/projects/new" : "/projects")}
          >
            {projects.length === 0 ? copy.projects.capture : copy.dashboard.projectsOpen}
          </a>
        </section>
      )}
      {references !== null && (
        <section className="empty-card">
          <div>
            <h2>{copy.dashboard.experienceTitle}</h2>
            <p className="muted">
              {references === 0
                ? copy.dashboard.experienceEmpty
                : copy.dashboard.experienceCount(references)}
            </p>
          </div>
          <a className="pill push-right" href="/experience" onClick={linkHandler("/experience")}>
            {copy.dashboard.experienceOpen}
          </a>
        </section>
      )}
      {account ? (
        <p className="muted small" data-testid="signed-in-as">
          {copy.dashboard.signedInAs(account.email, copy.roles[account.role])}
        </p>
      ) : (
        !error && <p className="muted small">{copy.common.loading}</p>
      )}
    </div>
  );
}

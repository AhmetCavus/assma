import { useEffect, useState } from "react";
import {
  dayOf,
  daysBetween,
  dueFollowUps,
  isOpen,
  toApiError,
  upcomingFollowUps,
  type AccountInfo,
  type ApplicationEvent,
  type ApplicationSummary,
} from "@assma/shared";
import { GrapeMark } from "../components/GrapeMark";
import { useApplications } from "../lib/applications";
import type { Preferences } from "../lib/preferences";
import { useProjects } from "../lib/projects";
import { QuickAdd } from "../components/QuickAdd";
import { linkHandler } from "../lib/router";
import type { Session } from "../lib/session";

type Activity = { application: ApplicationSummary; at: string; label: string; text: string };

export function DashboardPage({
  session,
  preferences,
}: {
  session: Session;
  preferences: Preferences;
}) {
  const { copy, locale } = preferences;
  const text = copy.dashboard;
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [references, setReferences] = useState<number | null>(null);
  const [error, setError] = useState("");
  const { api, signOut } = session;
  const expired = () => signOut(copy.common.sessionExpired);
  const { projects } = useProjects(api, expired);
  const { applications, failed } = useApplications(api, expired);
  const activeProjects = (projects ?? []).filter(
    (project) => !project.archived && !project.draft,
  ).length;
  const draftProjects = (projects ?? []).filter(
    (project) => !project.archived && project.draft,
  ).length;
  const archivedProjects = (projects ?? []).filter((project) => project.archived).length;

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
          expired();
        } else {
          setError(copy.common.error);
        }
      });
    return () => {
      active = false;
    };
  }, [api]);

  const now = new Date();
  const today = dayOf(now);
  const heading = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(now);
  const dateOnly = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  const dateTime = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const list = applications ?? [];
  const due = dueFollowUps(list, today);
  const upcoming = upcomingFollowUps(list, today);
  const month = today.slice(0, 7);
  const thisMonth = list.filter((item) => dayOf(new Date(item.submittedAt)).startsWith(month));
  const open = list.filter((item) => isOpen(item.status));
  const interviews = new Set(
    list.filter((item) => item.status === "interview").map((item) => item.projectId),
  );

  const describe = (event: ApplicationEvent) => {
    const kind = copy.application.kinds[event.kind];
    if (event.kind === "status" && event.status) {
      return { label: kind, text: copy.projects.status[event.status] };
    }
    if (event.kind === "followUp") {
      return {
        label: kind,
        text: event.followUpAt
          ? copy.application.eventFollowUp(dateOnly.format(new Date(`${event.followUpAt}T12:00`)))
          : copy.application.eventFollowUpCleared,
      };
    }
    return { label: kind, text: event.text };
  };

  // The latest event of each application, or its submission when nothing happened since.
  const activity: Activity[] = list
    .map((application) =>
      application.lastEvent
        ? { application, at: application.lastEvent.at, ...describe(application.lastEvent) }
        : {
            application,
            at: application.submittedAt,
            label: copy.apply.channels[application.channel],
            text: copy.application.eventSubmitted[application.channel],
          },
    )
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, 6);

  const followUpRow = (item: ApplicationSummary, when: string, overdue: boolean) => (
    <li key={item.id}>
      <a
        className="follow-row"
        href={`/applications/${item.id}`}
        onClick={linkHandler(`/applications/${item.id}`)}
      >
        <span className={`follow-when ${overdue ? "is-overdue" : ""}`}>{when}</span>
        <span className="follow-body">
          <strong>{item.title}</strong>
          <span className="muted small">
            {[item.company, item.contact].filter(Boolean).join(" · ")}
            {item.followUpNote ? ` — ${item.followUpNote}` : ""}
          </span>
        </span>
        <span className={`status-badge status-${item.status ?? "closed"}`}>
          {item.status ? copy.projects.status[item.status] : "—"}
        </span>
      </a>
    </li>
  );

  return (
    <div className="page wide">
      <p className="eyebrow">{heading}</p>
      <h1>{text.title}</h1>
      <p className="lead">
        {text.greeting(account?.name ?? "")} {text.lead}
      </p>
      {(error || failed) && (
        <p className="alert error" role="alert">
          {copy.common.error}
        </p>
      )}

      {applications !== null && (
        <>
          <section className="card due-card" aria-labelledby="due-title">
            <div className="due-head">
              <GrapeMark size={44} />
              <h2 id="due-title">{text.dueTitle}</h2>
            </div>
            {due.length === 0 ? (
              <p className="muted">{list.length === 0 ? text.noApplications : text.dueNone}</p>
            ) : (
              <ul className="follow-list">
                {due.map((item) => {
                  const days = daysBetween(item.followUpAt!, today);
                  return followUpRow(
                    item,
                    days === 0 ? text.dueToday : text.overdue(days),
                    days > 0,
                  );
                })}
              </ul>
            )}
            {upcoming.length > 0 && (
              <>
                <h3>{text.upcomingTitle}</h3>
                <ul className="follow-list">
                  {upcoming.map((item) =>
                    followUpRow(
                      item,
                      `${text.inDays(daysBetween(today, item.followUpAt!))} · ${dateOnly.format(new Date(`${item.followUpAt}T12:00`))}`,
                      false,
                    ),
                  )}
                </ul>
              </>
            )}
          </section>

          <dl className="stat-row">
            {[
              [text.stats.applications, list.length],
              [text.stats.thisMonth, thisMonth.length],
              [text.stats.open, open.length],
              [text.stats.interviews, interviews.size],
            ].map(([label, value]) => (
              <div key={label} className="stat">
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>

          {activity.length > 0 && (
            <section className="card" aria-labelledby="recent-title">
              <h2 id="recent-title">{text.recentTitle}</h2>
              <ul className="recent-list">
                {activity.map((item) => (
                  <li key={item.application.id}>
                    <a
                      href={`/applications/${item.application.id}`}
                      onClick={linkHandler(`/applications/${item.application.id}`)}
                    >
                      <span className="muted small">
                        {dateTime.format(new Date(item.at))} · {item.label}
                      </span>
                      <strong>{item.application.title}</strong>
                      <span className="recent-text">{item.text}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {projects !== null && (
        <section className="empty-card">
          <div>
            <h2>{text.projectsTitle}</h2>
            <p className="muted">
              {projects.length === 0
                ? text.projectsEmpty
                : text.projectsCount(activeProjects, archivedProjects)}
              {draftProjects > 0 && ` ${text.draftsCount(draftProjects)}`}
            </p>
          </div>
          <a
            className="pill push-right"
            href={projects.length === 0 ? "/projects/new" : "/projects"}
            onClick={linkHandler(projects.length === 0 ? "/projects/new" : "/projects")}
          >
            {projects.length === 0 ? copy.projects.capture : text.projectsOpen}
          </a>
        </section>
      )}
      {projects !== null && (
        <section className="card quick-card">
          <QuickAdd session={session} preferences={preferences} />
        </section>
      )}
      {references !== null && (
        <section className="empty-card">
          <div>
            <h2>{text.experienceTitle}</h2>
            <p className="muted">
              {references === 0 ? text.experienceEmpty : text.experienceCount(references)}
            </p>
          </div>
          <a className="pill push-right" href="/experience" onClick={linkHandler("/experience")}>
            {text.experienceOpen}
          </a>
        </section>
      )}
      {account ? (
        <p className="muted small" data-testid="signed-in-as">
          {text.signedInAs(account.email, copy.roles[account.role])}
        </p>
      ) : (
        !error && <p className="muted small">{copy.common.loading}</p>
      )}
    </div>
  );
}

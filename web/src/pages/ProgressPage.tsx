import { useMemo, useState } from "react";
import {
  dayOf,
  periodOf,
  progressOf,
  shiftPeriod,
  type Period,
  type PeriodKind,
} from "@assma/shared";
import { GrapeMark } from "../components/GrapeMark";
import { useApplications } from "../lib/applications";
import { useAssistant, useAssistantPage } from "../lib/assistant";
import type { Preferences } from "../lib/preferences";
import { linkHandler } from "../lib/router";
import type { Session } from "../lib/session";

const KIND_KEY = "assma.progress.kind";

function storedKind(): PeriodKind {
  try {
    return localStorage.getItem(KIND_KEY) === "month" ? "month" : "week";
  } catch {
    return "week";
  }
}

/** A day string as a date at noon, so formatting never slips into the neighbouring day. */
const noon = (day: string) => new Date(`${day}T12:00`);

/**
 * Applications by week or calendar month: totals against the period before, companies,
 * projects now interviewing, the channels and every submission of the period.
 */
export function ProgressPage({
  session,
  preferences,
}: {
  session: Session;
  preferences: Preferences;
}) {
  const { copy, locale } = preferences;
  const text = copy.progress;
  const { api, signOut } = session;
  const { applications, failed } = useApplications(api, () => signOut(copy.common.sessionExpired));
  const assistant = useAssistant();
  const today = dayOf(new Date());
  const [period, setPeriod] = useState<Period>(() => periodOf(storedKind(), today));
  const progress = useMemo(() => progressOf(applications ?? [], period), [applications, period]);
  const current = periodOf(period.kind, today);
  const isCurrent = period.start === current.start;

  useAssistantPage({
    context: {
      progress: {
        kind: period.kind,
        start: period.start,
        offset: -new Date().getTimezoneOffset(),
      },
    },
    services: {},
  });

  function chooseKind(kind: PeriodKind) {
    try {
      localStorage.setItem(KIND_KEY, kind);
    } catch {
      // Only the remembered choice is lost.
    }
    // The new period holds today when the current one is shown, otherwise the shown start.
    setPeriod(periodOf(kind, isCurrent ? today : period.start));
  }

  const label =
    period.kind === "month"
      ? new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(
          noon(period.start),
        )
      : new Intl.DateTimeFormat(locale, {
          day: "numeric",
          month: "short",
          year: "numeric",
        }).formatRange(noon(period.start), noon(period.end));
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "short" });
  const dateTime = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const bucketLabel = (start: string, end: string) =>
    period.kind === "week"
      ? weekday.format(noon(start)).replace(/\.$/, "")
      : `${+start.slice(8)}–${+end.slice(8)}`;
  const bucketName = (start: string, end: string) =>
    period.kind === "week"
      ? new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" }).format(
          noon(start),
        )
      : new Intl.DateTimeFormat(locale, { day: "numeric", month: "long" }).formatRange(
          noon(start),
          noon(end),
        );
  const highest = Math.max(1, ...progress.buckets.map((bucket) => bucket.count));
  const count = progress.submissions.length;
  const share = (value: number) => (count === 0 ? 0 : Math.round((value / count) * 100));

  return (
    <div className="page wide progress-page">
      <h1>{text.title}</h1>
      <p className="lead">{text.lead}</p>

      <div className="progress-toolbar">
        <div className="chips" role="radiogroup" aria-label={text.kinds}>
          {(["week", "month"] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              role="radio"
              aria-checked={period.kind === kind}
              className={`chip ${period.kind === kind ? "selected" : ""}`}
              onClick={() => chooseKind(kind)}
            >
              {text[kind]}
            </button>
          ))}
        </div>
        <div className="period-nav">
          {!isCurrent && (
            <button type="button" className="pill" onClick={() => setPeriod(current)}>
              {text.current}
            </button>
          )}
          <button
            type="button"
            className="icon-button"
            aria-label={text.previous}
            title={text.previous}
            onClick={() => setPeriod(shiftPeriod(period, -1))}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
          </button>
          <strong className="period-label" aria-live="polite">
            {label}
          </strong>
          <button
            type="button"
            className="icon-button"
            aria-label={text.next}
            title={text.next}
            disabled={isCurrent}
            onClick={() => setPeriod(shiftPeriod(period, 1))}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
          </button>
        </div>
      </div>

      {failed && (
        <p className="alert error" role="alert">
          {copy.common.error}
        </p>
      )}
      {applications === null ? (
        !failed && <p className="muted">{copy.common.loading}</p>
      ) : (
        <>
          <dl className="progress-stats">
            <div className="progress-stat accent">
              <dt>{text.applications}</dt>
              <dd>{count}</dd>
              <dd className="muted small">{text.change(count - progress.previous, period.kind)}</dd>
            </div>
            <div className="progress-stat">
              <dt>{text.companies}</dt>
              <dd>{progress.companies}</dd>
              <dd className="muted small">{text.companiesNote}</dd>
            </div>
            <div className="progress-stat">
              <dt>{text.interviews}</dt>
              <dd>{progress.interviews}</dd>
              <dd className="muted small">{text.interviewsNote}</dd>
            </div>
          </dl>

          <div className="progress-grid">
            <section className="card" aria-labelledby="progress-chart-title">
              <h2 id="progress-chart-title">
                {period.kind === "week" ? text.perDay : text.perMonth}
              </h2>
              <ol className="bar-chart">
                {progress.buckets.map((bucket) => {
                  const name = text.bar(bucketName(bucket.start, bucket.end), bucket.count);
                  return (
                    <li key={bucket.start} aria-label={name} title={name}>
                      <span className="bar-track" aria-hidden="true">
                        <span
                          className="bar-fill"
                          style={{ height: `${(bucket.count / highest) * 100}%` }}
                        />
                      </span>
                      <strong aria-hidden="true">{bucket.count}</strong>
                      <span className="muted small" aria-hidden="true">
                        {bucketLabel(bucket.start, bucket.end)}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </section>
            <section className="card" aria-labelledby="progress-channels-title">
              <h2 id="progress-channels-title">{text.channels}</h2>
              <dl className="channel-list">
                {(["email", "portal"] as const).map((channel) => (
                  <div key={channel}>
                    <dt>{text.channel[channel]}</dt>
                    <dd>
                      {progress.channels[channel]} · {share(progress.channels[channel])} %
                    </dd>
                    <dd className="channel-track" aria-hidden="true">
                      <span
                        className={`channel-fill ${channel}`}
                        style={{ width: `${share(progress.channels[channel])}%` }}
                      />
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          </div>

          <section className="card" aria-labelledby="progress-list-title">
            <h2 id="progress-list-title">{text.list}</h2>
            {count === 0 ? (
              <p className="muted">{text.empty}</p>
            ) : (
              <ul className="submission-list">
                {progress.submissions.map((item) => (
                  <li key={item.id}>
                    <a
                      href={`/applications/${item.id}`}
                      onClick={linkHandler(`/applications/${item.id}`)}
                    >
                      <span className="submission-body">
                        <strong>{item.title}</strong>
                        <span className="muted small">
                          {[item.company || item.agency, copy.progress.channel[item.channel]]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      <span className="muted small submission-date">
                        {dateTime.format(new Date(item.submittedAt))}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="ask-bar">
            <GrapeMark size={28} />
            <span>
              <strong>assma</strong> · {text.ask}
            </span>
            <button
              type="button"
              className="pill push-right"
              onClick={() => void assistant.send(text.ask)}
            >
              {text.askAction}
            </button>
          </div>
          <p className="muted small">{text.countNote}</p>
        </>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { toApiError, type AccountInfo } from "@assma/shared";
import { GrapeMark } from "../components/GrapeMark";
import type { Preferences } from "../lib/preferences";
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
  const [error, setError] = useState("");
  const { api, signOut } = session;

  // The server confirms the session; an expired or revoked token returns to the login.
  useEffect(() => {
    let active = true;
    api
      .account()
      .then((next) => active && setAccount(next))
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

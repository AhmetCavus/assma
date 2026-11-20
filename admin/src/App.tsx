import { useCallback, useEffect, useState } from "react";
import {
  LOCALES,
  preferredLocale,
  toApiError,
  type AdminOverview,
  type Copy,
  type Locale,
} from "@assma/shared";
import { useAdminSession, type AdminSession } from "./session";

function Brand({ copy }: { copy: Copy }) {
  return (
    <div className="brand">
      <img src="/icon.svg" width={30} height={30} alt="" />
      <div>
        assma
        <small>{copy.admin.subtitle}</small>
      </div>
    </div>
  );
}

function Login({ session, copy }: { session: AdminSession; copy: Copy }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  return (
    <main className="access">
      <Brand copy={copy} />
      <section className="access-card">
        <h1>{copy.admin.loginTitle}</h1>
        <form
          className="form"
          onSubmit={(event) => {
            event.preventDefault();
            void session.signIn(email, password);
          }}
        >
          <label>
            {copy.auth.email}
            <input
              name="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              autoFocus
            />
          </label>
          <label>
            {copy.auth.password}
            <input
              name="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
              maxLength={72}
            />
          </label>
          {session.error && (
            <p className="alert error" role="alert">
              {session.error}
            </p>
          )}
          <button className="button" disabled={session.busy}>
            {session.busy ? copy.common.working : copy.auth.login}
          </button>
        </form>
      </section>
    </main>
  );
}

function Overview({
  session,
  locale,
  onLocale,
}: {
  session: AdminSession;
  locale: Locale;
  onLocale: (locale: Locale) => void;
}) {
  const copy = LOCALES[locale];
  const { api, signOut } = session;
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      setOverview(await api.adminOverview());
    } catch (failure) {
      // An expired session or a demoted account returns to the login.
      if (toApiError(failure).isUnauthorized) {
        signOut(copy.common.sessionExpired);
      } else {
        setError(copy.common.error);
      }
    } finally {
      setBusy(false);
    }
  }, [api, copy, signOut]);

  useEffect(() => {
    void load();
  }, [api]);

  const tiles = overview
    ? [
        [copy.admin.users, overview.users],
        [copy.admin.admins, overview.admins],
        [copy.admin.newUsersThisWeek, overview.newUsersThisWeek],
      ]
    : [];

  return (
    <div className="app">
      <header className="app-header">
        <Brand copy={copy} />
        <div className="header-actions">
          <span className="muted">{session.profile?.username}</span>
          <select
            className="pill"
            value={locale}
            onChange={(event) => onLocale(event.target.value as Locale)}
            aria-label={copy.common.language}
          >
            {(Object.keys(LOCALES) as Locale[]).map((option) => (
              <option key={option} value={option}>
                {option.toUpperCase()}
              </option>
            ))}
          </select>
          <button type="button" className="pill" onClick={() => signOut()}>
            {copy.auth.logout}
          </button>
        </div>
      </header>
      <main className="main">
        <div className="page-heading">
          <h1>{copy.admin.overview}</h1>
          <button type="button" className="pill" disabled={busy} onClick={() => void load()}>
            {busy ? copy.common.loading : copy.admin.refresh}
          </button>
        </div>
        <p className="muted">{copy.admin.privacyNote}</p>
        {error && (
          <p className="alert error" role="alert">
            {error}
          </p>
        )}
        {overview && (
          <>
            <div className="tiles">
              {tiles.map(([label, value]) => (
                <div className="tile" key={String(label)}>
                  <span className="muted">{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
            <p className="muted small">
              {copy.admin.version} {overview.system.version} · {copy.admin.database}{" "}
              {overview.system.database}
            </p>
          </>
        )}
      </main>
    </div>
  );
}

export default function App() {
  // Kept in memory only: the admin panel stores nothing but the sign-in.
  const [locale, setLocale] = useState<Locale>(() =>
    preferredLocale(navigator.languages ?? [navigator.language]),
  );
  const session = useAdminSession(LOCALES[locale]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return session.profile ? (
    <Overview session={session} locale={locale} onLocale={setLocale} />
  ) : (
    <Login session={session} copy={LOCALES[locale]} />
  );
}

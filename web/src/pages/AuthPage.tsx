import { useState } from "react";
import { Wordmark } from "../components/GrapeMark";
import { LocaleSelect, ThemeButton } from "../components/Controls";
import type { Preferences } from "../lib/preferences";
import { linkHandler, navigate } from "../lib/router";
import type { Session } from "../lib/session";

export function AuthPage({
  mode,
  session,
  preferences,
}: {
  mode: "login" | "signup";
  session: Session;
  preferences: Preferences;
}) {
  const { copy } = preferences;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const signup = mode === "signup";

  async function submit() {
    const ok = signup
      ? await session.signUp(name, email, password)
      : await session.signIn(email, password);
    if (ok) {
      navigate("/dashboard", { replace: true });
    }
  }

  return (
    <main className="access">
      <header className="access-header">
        <a href="/" onClick={linkHandler("/")} aria-label={copy.auth.back}>
          <Wordmark />
        </a>
        <div className="header-actions">
          <LocaleSelect preferences={preferences} />
          <ThemeButton preferences={preferences} />
        </div>
      </header>
      <section className="access-card">
        <h1>{signup ? copy.auth.signupTitle : copy.auth.loginTitle}</h1>
        <p className="muted">{signup ? copy.auth.signupLead : copy.auth.loginLead}</p>
        {session.notice && <p className="alert">{session.notice}</p>}
        <form
          className="form"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          {signup && (
            <label>
              {copy.auth.username}
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="given-name"
                required
                maxLength={60}
              />
            </label>
          )}
          <label>
            {copy.auth.email}
            {/* The initial administrator may sign in with a name that is not an address. */}
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
              autoComplete={signup ? "new-password" : "current-password"}
              required
              maxLength={72}
            />
            {signup && <small className="muted">{copy.auth.passwordHint}</small>}
          </label>
          {session.error && (
            <p className="alert error" role="alert">
              {session.error}
            </p>
          )}
          <button className="button" disabled={session.busy}>
            {session.busy ? copy.common.working : signup ? copy.auth.signup : copy.auth.login}
          </button>
        </form>
        <a
          className="link"
          href={signup ? "/login" : "/signup"}
          onClick={(event) => {
            session.setError("");
            linkHandler(signup ? "/login" : "/signup")(event);
          }}
        >
          {signup ? copy.auth.toLogin : copy.auth.toSignup}
        </a>
      </section>
    </main>
  );
}

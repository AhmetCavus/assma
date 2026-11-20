import { GrapeMark, Wordmark } from "../components/GrapeMark";
import { GitHubLink, LocaleSelect, ThemeButton } from "../components/Controls";
import type { Preferences } from "../lib/preferences";
import { linkHandler } from "../lib/router";

export function LandingPage({
  preferences,
  signedIn,
}: {
  preferences: Preferences;
  signedIn: boolean;
}) {
  const { copy } = preferences;
  const workspace = signedIn ? "/dashboard" : "/login";
  return (
    <div className="landing">
      <header className="landing-header">
        <a href="/" className="home-link" onClick={linkHandler("/")}>
          <Wordmark />
        </a>
        <nav className="header-actions" aria-label={copy.common.language}>
          <GitHubLink preferences={preferences} />
          <LocaleSelect preferences={preferences} />
          <ThemeButton preferences={preferences} />
          <a className="pill" href={workspace} onClick={linkHandler(workspace)}>
            {copy.landing.openWorkspace}
          </a>
        </nav>
      </header>
      <main className="hero">
        <div className="hero-copy">
          <p className="eyebrow">{copy.landing.eyebrow}</p>
          <h1>
            {copy.landing.titleLead}
            <br />
            {copy.landing.titleNext} <em>{copy.landing.titleAccent}</em>
          </h1>
          <p className="lead">{copy.landing.lead}</p>
          <div className="hero-actions">
            <a className="button" href={workspace} onClick={linkHandler(workspace)}>
              {signedIn ? copy.landing.openWorkspace : copy.landing.login}
            </a>
            <GitHubLink preferences={preferences} />
          </div>
          <p className="note">{copy.landing.iterationNote}</p>
        </div>
        <div className="hero-mark" aria-hidden="true">
          <GrapeMark size={220} />
        </div>
      </main>
    </div>
  );
}

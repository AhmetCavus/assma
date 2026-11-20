import { useEffect } from "react";
import { Shell } from "./components/Shell";
import { usePreferences } from "./lib/preferences";
import { navigate, usePath } from "./lib/router";
import { useSession } from "./lib/session";
import { AuthPage } from "./pages/AuthPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ExperiencePage } from "./pages/ExperiencePage";
import { LandingPage } from "./pages/LandingPage";

const WORKSPACE_PATHS = ["/dashboard", "/experience"];

export default function App() {
  const preferences = usePreferences();
  const session = useSession(preferences.copy);
  const path = usePath();
  const signedIn = Boolean(session.profile);
  const inWorkspace = WORKSPACE_PATHS.includes(path);
  const onAuthPage = path === "/login" || path === "/signup";

  useEffect(() => {
    if (inWorkspace && !signedIn) {
      navigate("/login", { replace: true });
    } else if (onAuthPage && signedIn) {
      navigate("/dashboard", { replace: true });
    } else if (!inWorkspace && !onAuthPage && path !== "/") {
      navigate("/", { replace: true });
    }
  }, [path, signedIn, inWorkspace, onAuthPage]);

  if (inWorkspace && signedIn) {
    return (
      <Shell session={session} preferences={preferences} path={path}>
        {path === "/experience" ? (
          <ExperiencePage session={session} preferences={preferences} />
        ) : (
          <DashboardPage session={session} preferences={preferences} />
        )}
      </Shell>
    );
  }
  if (onAuthPage && !signedIn) {
    return (
      <AuthPage
        mode={path === "/signup" ? "signup" : "login"}
        session={session}
        preferences={preferences}
      />
    );
  }
  return <LandingPage preferences={preferences} signedIn={signedIn} />;
}

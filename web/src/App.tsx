import { useEffect } from "react";
import { Shell } from "./components/Shell";
import { usePreferences } from "./lib/preferences";
import { navigate, usePath } from "./lib/router";
import { useSession } from "./lib/session";
import { AuthPage } from "./pages/AuthPage";
import { CvImportPage } from "./pages/CvImportPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ExperiencePage } from "./pages/ExperiencePage";
import { LandingPage } from "./pages/LandingPage";
import { ProjectEditorPage } from "./pages/ProjectEditorPage";
import { ProjectsPage } from "./pages/ProjectsPage";

const WORKSPACE_PATHS = [
  "/dashboard",
  "/projects",
  "/projects/new",
  "/experience",
  "/experience/import",
];
const PROJECT_PATH = /^\/projects\/([a-f0-9]{24})$/;

export default function App() {
  const preferences = usePreferences();
  const session = useSession(preferences.copy);
  const path = usePath();
  const signedIn = Boolean(session.profile);
  const projectId = PROJECT_PATH.exec(path)?.[1] ?? null;
  const inWorkspace = WORKSPACE_PATHS.includes(path) || projectId !== null;
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
        {projectId ? (
          <ProjectEditorPage
            key={projectId}
            id={projectId}
            session={session}
            preferences={preferences}
          />
        ) : path === "/projects/new" ? (
          <ProjectEditorPage key="new" id={null} session={session} preferences={preferences} />
        ) : path === "/projects" ? (
          <ProjectsPage session={session} preferences={preferences} />
        ) : path === "/experience/import" ? (
          <CvImportPage session={session} preferences={preferences} />
        ) : path === "/experience" ? (
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

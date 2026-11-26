import { useEffect } from "react";
import { Shell } from "./components/Shell";
import { legalPageOf } from "./lib/legal";
import { usePreferences } from "./lib/preferences";
import { navigate, usePath } from "./lib/router";
import { useSession } from "./lib/session";
import { ApplicationPage } from "./pages/ApplicationPage";
import { AuthPage } from "./pages/AuthPage";
import { CvImportPage } from "./pages/CvImportPage";
import { ReferenceNewPage } from "./pages/ReferenceNewPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ExperiencePage } from "./pages/ExperiencePage";
import { LandingPage } from "./pages/LandingPage";
import { LegalPage } from "./pages/LegalPage";
import { ProjectApplyPage } from "./pages/ProjectApplyPage";
import { ProjectCvPage } from "./pages/ProjectCvPage";
import { ProjectEditorPage } from "./pages/ProjectEditorPage";
import { ProjectFitPage } from "./pages/ProjectFitPage";
import { ProgressPage } from "./pages/ProgressPage";
import { ProjectsPage } from "./pages/ProjectsPage";

const WORKSPACE_PATHS = [
  "/dashboard",
  "/projects",
  "/projects/new",
  "/experience",
  "/experience/import",
  "/experience/new",
  "/progress",
];
const PROJECT_PATH = /^\/projects\/([a-f0-9]{24})(\/edit|\/cv|\/apply)?$/;
const APPLICATION_PATH = /^\/applications\/([a-f0-9]{24})$/;

export default function App() {
  const preferences = usePreferences();
  const session = useSession(preferences.copy);
  const path = usePath();
  const signedIn = Boolean(session.profile);
  const projectMatch = PROJECT_PATH.exec(path);
  const projectId = projectMatch?.[1] ?? null;
  const projectView = projectMatch?.[2] ?? "";
  const applicationId = APPLICATION_PATH.exec(path)?.[1] ?? null;
  const inWorkspace =
    WORKSPACE_PATHS.includes(path) || projectId !== null || applicationId !== null;
  const onAuthPage = path === "/login" || path === "/signup";
  // Legal pages are open to everyone, signed in or not.
  const legal = legalPageOf(path);

  useEffect(() => {
    if (inWorkspace && !signedIn) {
      navigate("/login", { replace: true });
    } else if (onAuthPage && signedIn) {
      navigate("/dashboard", { replace: true });
    } else if (!inWorkspace && !onAuthPage && !legal && path !== "/") {
      navigate("/", { replace: true });
    }
  }, [path, signedIn, inWorkspace, onAuthPage, legal]);

  // A legal page opens at its top, not where the previous page was scrolled to.
  useEffect(() => {
    if (legal) {
      window.scrollTo(0, 0);
    }
  }, [legal]);

  if (legal) {
    return <LegalPage page={legal} preferences={preferences} />;
  }

  if (inWorkspace && signedIn) {
    return (
      <Shell session={session} preferences={preferences} path={path}>
        {applicationId ? (
          <ApplicationPage
            key={applicationId}
            id={applicationId}
            session={session}
            preferences={preferences}
          />
        ) : projectId && projectView === "/apply" ? (
          <ProjectApplyPage
            key={`${projectId}-apply`}
            id={projectId}
            session={session}
            preferences={preferences}
          />
        ) : projectId && projectView === "/edit" ? (
          <ProjectEditorPage
            key={`${projectId}-edit`}
            id={projectId}
            session={session}
            preferences={preferences}
          />
        ) : projectId && projectView === "/cv" ? (
          <ProjectCvPage
            key={`${projectId}-cv`}
            id={projectId}
            session={session}
            preferences={preferences}
          />
        ) : projectId ? (
          <ProjectFitPage
            key={projectId}
            id={projectId}
            session={session}
            preferences={preferences}
          />
        ) : path === "/projects/new" ? (
          <ProjectEditorPage key="new" id={null} session={session} preferences={preferences} />
        ) : path === "/projects" ? (
          <ProjectsPage session={session} preferences={preferences} />
        ) : path === "/experience/new" ? (
          <ReferenceNewPage session={session} preferences={preferences} />
        ) : path === "/experience/import" ? (
          <CvImportPage session={session} preferences={preferences} />
        ) : path === "/experience" ? (
          <ExperiencePage session={session} preferences={preferences} />
        ) : path === "/progress" ? (
          <ProgressPage session={session} preferences={preferences} />
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

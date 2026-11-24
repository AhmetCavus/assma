import { useEffect, useMemo, useState } from "react";
import {
  assessProject,
  candidateFingerprint,
  listingFingerprint,
  requirementsOf,
  skillMatches,
  termsOf,
  toApiError,
  type ClarifyAction,
  type FitJob,
  type Project,
  type Requirement,
} from "@assma/shared";
import {
  ActionSummary,
  DimensionCards,
  RequirementList,
  type RequirementHandlers,
} from "../components/Assessment";
import { useApplications } from "../lib/applications";
import {
  candidateFrom,
  cvInputOf,
  experienceChanged,
  useEconomicPreferences,
  useExperience,
} from "../lib/assessment";
import { takeAutoAssess } from "../lib/flash";
import type { Preferences } from "../lib/preferences";
import { useAssistantPage } from "../lib/assistant";
import { projectsChanged } from "../lib/projects";
import { linkHandler, navigate } from "../lib/router";
import type { Session } from "../lib/session";
import { PencilIcon } from "./ExperiencePage";

export function ProjectFitPage({
  id,
  session,
  preferences,
}: {
  id: string;
  session: Session;
  preferences: Preferences;
}) {
  const { copy, locale } = preferences;
  const text = copy.fit;
  const assessmentCopy = copy.assessment;
  const { api, signOut } = session;
  const expired = () => signOut(copy.common.sessionExpired);
  const [project, setProject] = useState<Project | null>(null);
  const experience = useExperience(api, expired);
  const economic = useEconomicPreferences(api, expired);
  const [job, setJob] = useState<FitJob | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  function fail(failure: unknown) {
    const apiError = toApiError(failure);
    if (apiError.isUnauthorized) {
      expired();
      return;
    }
    const messages: Record<string, string> = {
      too_many_attempts: text.tooMany,
      not_found: text.notFound,
    };
    setError(messages[apiError.code] ?? copy.common.error);
  }

  async function startAssessment() {
    setError("");
    setStatus("");
    try {
      setJob(await api.startFit(id));
    } catch (failure) {
      fail(failure);
    }
  }

  useEffect(() => {
    let active = true;
    api
      .project(id)
      .then((loaded) => {
        if (!active) {
          return;
        }
        // A draft has no requirements yet; it is read on the edit page first.
        if (loaded.draft) {
          navigate(`/projects/${id}/edit`, { replace: true });
          return;
        }
        setProject(loaded);
        // A project just captured with "save and check fit" is assessed right away.
        if (takeAutoAssess(id) && requirementsOf(loaded).length > 0) {
          void startAssessment();
        }
      })
      .catch((failure: unknown) => active && fail(failure));
    return () => {
      active = false;
    };
  }, [api, id]);

  useEffect(() => {
    if (!job) {
      return;
    }
    let active = true;
    const poll = async () => {
      try {
        const next = await api.fitJob(id, job.id);
        if (!active) {
          return;
        }
        if (next.state === "done") {
          setJob(null);
          setProject(await api.project(id));
          projectsChanged();
        } else if (next.state === "failed") {
          setJob(null);
          setError(
            next.error === "timeout"
              ? text.timeout
              : next.error === "model_unavailable"
                ? text.modelUnavailable
                : text.failed,
          );
        } else {
          setJob(next);
        }
      } catch (failure) {
        if (active) {
          setJob(null);
          fail(failure);
        }
      }
    };
    const timer = window.setInterval(() => void poll(), 2000);
    const visible = () => document.visibilityState === "visible" && void poll();
    document.addEventListener("visibilitychange", visible);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [job?.id]);

  async function cancel() {
    if (job) {
      await api.cancelFit(id, job.id).catch(() => undefined);
    }
    setJob(null);
  }

  // Every dimension is computed here from current data; only a reassessment runs the model.
  const view = useMemo(
    () =>
      project?.assessment && experience && economic
        ? assessProject({
            assessment: project.assessment,
            candidate: candidateFrom(experience),
            cv: cvInputOf(project),
            conditions: project.conditions,
            preferences: economic.economic,
          })
        : null,
    [project, experience, economic?.economic],
  );

  async function saved(task: () => Promise<unknown>, message: string) {
    setError("");
    try {
      await task();
      setStatus(message);
      projectsChanged();
    } catch (failure) {
      fail(failure);
    }
  }

  /** Clarify actions change experience data, never the stored assessment. */
  async function clarify(action: ClarifyAction, requirement: Requirement) {
    if (!experience) {
      return;
    }
    const terms = termsOf(requirement);
    const setFact = (status: "complete" | "none") =>
      api.saveSkillFacts({
        facts: [
          ...experience.skillFacts.filter(
            (fact) => fact.skill.toLowerCase() !== requirement.normalised.toLowerCase(),
          ),
          { skill: requirement.normalised, status },
        ],
      });
    switch (action.kind) {
      case "confirm_usage":
        await saved(async () => {
          for (const referenceId of action.referenceIds) {
            const reference = experience.references.find((entry) => entry.id === referenceId);
            const skills = (reference?.skills ?? []).filter((skill) =>
              terms.some((term) => skillMatches(skill, term)),
            );
            if (skills.length > 0) {
              await api.confirmUsage(referenceId, { skills });
            }
          }
          experienceChanged();
        }, assessmentCopy.usageConfirmed);
        return;
      case "confirm_complete":
        if (window.confirm(assessmentCopy.confirmComplete(action.skill))) {
          await saved(async () => {
            await setFact("complete");
            experienceChanged();
          }, assessmentCopy.factSaved);
        }
        return;
      case "deny":
        if (window.confirm(assessmentCopy.confirmDeny(action.skill))) {
          await saved(async () => {
            await setFact("none");
            experienceChanged();
          }, assessmentCopy.factSaved);
        }
        return;
      default:
        navigate("/experience");
    }
  }

  const handlers: RequirementHandlers = {
    onAction: clarify,
    onCorrect: (requirement, correction) =>
      saved(
        async () => setProject(await api.setCorrection(id, requirement.id, correction)),
        assessmentCopy.saved,
      ),
    onReset: (requirement) =>
      saved(
        async () => setProject(await api.resetCorrections(id, requirement.id)),
        assessmentCopy.saved,
      ),
  };

  async function resetAll() {
    if (window.confirm(assessmentCopy.confirmResetAll)) {
      await saved(async () => setProject(await api.resetCorrections(id)), assessmentCopy.saved);
    }
  }

  const requirementCount = project ? requirementsOf(project).length : 0;
  const assistantCanAssess = project !== null && requirementCount > 0;
  useAssistantPage({
    services: assistantCanAssess && !job ? { assess_fit: startAssessment } : {},
  });

  if (!project || !experience || !economic) {
    return (
      <div className="page wide">
        {error ? (
          <p className="alert error" role="alert">
            {error}
          </p>
        ) : (
          <p className="muted">{copy.common.loading}</p>
        )}
      </div>
    );
  }

  const assessment = project.assessment;
  const canAssess = requirementCount > 0;
  const subtitle = [project.company, project.agency].filter(Boolean).join(" · ");
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const listingChanged =
    assessment !== null && assessment.fingerprint !== listingFingerprint(project);
  // Only data the technical judgement read counts; confirmed usage and stated facts are
  // already reflected in the computed dimensions.
  const experienceNewer =
    assessment !== null &&
    assessment.candidateBasis !== "" &&
    assessment.candidateBasis !== candidateFingerprint(candidateFrom(experience));

  const assessButton = (label: string, primary = false) => (
    <button
      type="button"
      className={primary ? "button" : "pill"}
      onClick={() => void startAssessment()}
      disabled={!canAssess || job !== null}
    >
      {label}
    </button>
  );

  return (
    <div className="page wide">
      <a className="link back-link" href="/projects" onClick={linkHandler("/projects")}>
        ← {text.back}
      </a>
      <div className="page-header">
        <div>
          <h1>{project.title}</h1>
          {subtitle && <p className="lead">{subtitle}</p>}
        </div>
        <div className="header-buttons">
          <a
            className="pill"
            href={`/projects/${id}/edit`}
            onClick={linkHandler(`/projects/${id}/edit`)}
          >
            <PencilIcon />
            {text.edit}
          </a>
          <a
            className="pill"
            href={`/projects/${id}/cv`}
            onClick={linkHandler(`/projects/${id}/cv`)}
          >
            <SparkIcon />
            {text.draftCv}
          </a>
          <a
            className="button"
            href={`/projects/${id}/apply`}
            onClick={linkHandler(`/projects/${id}/apply`)}
          >
            {text.apply}
          </a>
        </div>
      </div>
      <p className="status" aria-live="polite">
        {status}
      </p>
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}

      {job ? (
        <section className="card progress-card" aria-live="polite">
          <div className="spinner" aria-hidden="true" />
          <div>
            <h2>
              {job.state === "queued" && job.position > 0
                ? text.queued(job.position)
                : text.assessing}
            </h2>
            <p className="muted">{text.assessingHint}</p>
            <button type="button" className="pill" onClick={() => void cancel()}>
              {text.cancel}
            </button>
          </div>
        </section>
      ) : !assessment || !view ? (
        <section className="card">
          {project.fit ? (
            <>
              <h2>{assessmentCopy.legacyTitle}</h2>
              <p className="score">
                <strong>{project.fit.score ?? "–"}</strong>
                <span>{assessmentCopy.outOf}</span>
              </p>
              <p className="muted">{assessmentCopy.legacyLead}</p>
            </>
          ) : (
            <>
              <h2>{text.notAssessed}</h2>
              <p className="muted">{text.notAssessedLead}</p>
            </>
          )}
          {requirementCount === 0 ? (
            <p>
              {text.noRequirements}{" "}
              <a
                className="link"
                href={`/projects/${id}/edit`}
                onClick={linkHandler(`/projects/${id}/edit`)}
              >
                {text.edit}
              </a>
            </p>
          ) : (
            assessButton(project.fit ? text.reassess : text.assess, true)
          )}
        </section>
      ) : (
        <>
          {assessment.incomplete && (
            <div className="alert stale" role="status">
              <span>{assessmentCopy.incomplete}</span>
              {assessButton(text.reassess)}
            </div>
          )}
          {(listingChanged || experienceNewer) && !assessment.incomplete && (
            <div className="alert stale" role="status">
              <span>
                {listingChanged ? assessmentCopy.listingChanged : assessmentCopy.experienceChanged}
              </span>
              {assessButton(text.reassess)}
            </div>
          )}
          <DimensionCards
            view={view}
            projectId={id}
            preferencesSaved={economic.saved}
            copy={assessmentCopy}
          />
          <ActionSummary view={view} preferencesSaved={economic.saved} copy={assessmentCopy} />
          <section className="card" aria-labelledby="requirements-title">
            <div className="card-heading">
              <h2 id="requirements-title">{assessmentCopy.requirementsTitle}</h2>
              <span className="muted small">
                {assessmentCopy.assessedAt(date.format(new Date(assessment.assessedAt)))}
              </span>
            </div>
            <RequirementList
              assessment={assessment}
              view={view}
              experience={experience}
              copy={assessmentCopy}
              handlers={handlers}
            />
            <div className="form-actions">
              {!listingChanged &&
                !experienceNewer &&
                !assessment.incomplete &&
                assessButton(text.reassess)}
              {assessment.corrections.length > 0 && (
                <button type="button" className="link" onClick={() => void resetAll()}>
                  {assessmentCopy.resetAll}
                </button>
              )}
            </div>
          </section>
        </>
      )}
      <ProjectApplications projectId={id} session={session} preferences={preferences} />
    </div>
  );
}

export function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="currentColor">
      <path d="M12 2c.6 4.8 2.8 7.4 8 8-5.2.6-7.4 3.2-8 8-.6-4.8-2.8-7.4-8-8 5.2-.6 7.4-3.2 8-8Z" />
      <path d="M19 15c.3 2.1 1.1 3 3 3.3-1.9.3-2.7 1.1-3 3.2-.3-2.1-1.1-2.9-3-3.2 1.9-.3 2.7-1.2 3-3.3Z" />
    </svg>
  );
}

/** The applications recorded for this project, newest first. */
function ProjectApplications({
  projectId,
  session,
  preferences,
}: {
  projectId: string;
  session: Session;
  preferences: Preferences;
}) {
  const { copy, locale } = preferences;
  const { applications } = useApplications(session.api, () =>
    session.signOut(copy.common.sessionExpired),
  );
  if (applications === null) {
    return null;
  }
  const mine = applications.filter((item) => item.projectId === projectId);
  const dateTime = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  return (
    <section className="card" aria-labelledby="applications-title">
      <h2 id="applications-title">{copy.fit.applicationsTitle}</h2>
      {mine.length === 0 ? (
        <p className="muted">{copy.fit.applicationsNone}</p>
      ) : (
        <ul className="recent-list">
          {mine.map((item) => (
            <li key={item.id}>
              <a
                href={`/applications/${item.id}`}
                onClick={linkHandler(`/applications/${item.id}`)}
              >
                <span className="muted small">
                  {copy.apply.channels[item.channel]} ·{" "}
                  {dateTime.format(new Date(item.submittedAt))}
                </span>
                <strong>
                  {item.followUpAt
                    ? copy.application.eventFollowUp(
                        new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
                          new Date(`${item.followUpAt}T12:00`),
                        ),
                      )
                    : copy.application.snapshotTitle}
                </strong>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

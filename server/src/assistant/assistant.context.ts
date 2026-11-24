import {
  type AssessmentView,
  formatPeriod,
  periodOf,
  progressOf,
  shiftPeriod,
  type ApplicationSummary,
  type Day,
  sortReferences,
  type Application,
  type AssistantRequest,
  type ExperienceProfile,
  type ExperienceReference,
  type Project,
} from "@assma/shared";
import * as applications from "../applications/application.repository.js";
import { viewOf } from "../assessment/assessment.service.js";
import { listApplications } from "../applications/application.service.js";
import * as experience from "../experience/experience.repository.js";
import type { Account } from "../platform/access.js";
import * as projects from "../projects/project.repository.js";

/** What the model sees of the person's data. Only what the open page needs, kept short. */
export type AssistantContext = {
  /** Sections of private data, each later fenced as data. */
  sections: { tag: string; text: string }[];
  /** One sentence about the page on screen. */
  page: string;
  /** Links, addresses and numbers the person wrote themselves; anything else is flagged. */
  known: string[];
  /** Whether a project is in view, so project pages can be opened. */
  project: Project | null;
};

const clip = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;

const PAGE_LINES: Record<AssistantRequest["view"]["page"], string> = {
  dashboard: "The dashboard: open projects, follow-ups and recent applications.",
  projects: "The list of all captured projects.",
  new_project: "The form to capture a new project from a listing.",
  project: "One project with its experience fit: which requirements the references confirm.",
  edit: "The form to edit one project's listing facts.",
  cv: "The tailored CV for one project: summary, references, skills and design.",
  apply: "Applying for one project: the application email and the CV that goes with it.",
  application: "One recorded application: its status, follow-up and activity log.",
  experience: "The person's profile and project references.",
  import: "Importing references from an existing CV.",
  progress:
    "Progress: applications submitted in the selected week or month, by day, company and channel.",
};

/** The calendar day of a moment on the person's own clock, `offset` minutes ahead of UTC. */
function localDay(at: string, offset: number): Day {
  return new Date(Date.parse(at) + offset * 60_000).toISOString().slice(0, 10);
}

/** What Progress shows for the selected period, and the one before it for comparison. */
function progressLines(
  list: ApplicationSummary[],
  selection: { kind: "week" | "month"; start: string; offset: number },
): string {
  const period = periodOf(selection.kind, selection.start);
  const day = (item: ApplicationSummary) => localDay(item.submittedAt, selection.offset);
  const progress = progressOf(list, period, day);
  const before = shiftPeriod(period, -1);
  return [
    `Period: ${selection.kind} from ${period.start} to ${period.end}; the one before: ${before.start} to ${before.end}.`,
    `Applications: ${progress.submissions.length} (period before: ${progress.previous}).`,
    `Companies applied to: ${progress.companies}. Projects from this period now in interview: ${progress.interviews}.`,
    `Channels: email ${progress.channels.email}, portal ${progress.channels.portal}.`,
    progress.submissions.length > 0 &&
      `Submissions:\n${progress.submissions
        .slice(0, 20)
        .map(
          (item) =>
            `- ${day(item)} ${item.title}${item.company ? ` (${item.company})` : ""} · ${item.channel} · ${item.status ?? "project deleted"}`,
        )
        .join("\n")}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function profileLines(profile: ExperienceProfile | null): string {
  if (!profile) {
    return "No profile yet.";
  }
  return [
    profile.name && `Name: ${profile.name}`,
    profile.headline && `Headline: ${profile.headline}`,
    profile.location && `Location: ${profile.location}`,
    profile.summary && `Summary: ${clip(profile.summary, 400)}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function referenceLines(references: ExperienceReference[], detailed: boolean): string {
  if (references.length === 0) {
    return "No references yet.";
  }
  return sortReferences(references)
    .slice(0, detailed ? 12 : 8)
    .map((reference) =>
      [
        `- ${reference.organization} · ${reference.role} · ${formatPeriod(reference.start, reference.end, "en", "present")}`,
        reference.skills.length > 0 && `  Skills: ${reference.skills.slice(0, 10).join(", ")}`,
        detailed && `  Contribution: ${clip(reference.contribution, 240)}`,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n");
}

const percent = (value: number | null) => (value === null ? "-" : `${Math.round(value * 100)} %`);

/** The four dimensions in a few lines; the assistant explains, it does not recompute. */
export function assessmentLines(view: AssessmentView): string {
  const { technical, formal, evidence, economic } = view;
  const names = (items: { requirement: { normalised: string } }[]) =>
    items.map((item) => item.requirement.normalised).join(", ");
  return [
    `Technical fit: ${technical.score ?? "not assessable"} of 10 (coverage ${percent(technical.coverage)}).`,
    technical.items.some((item) => item.state === "transferable") &&
      `Transferable: ${names(technical.items.filter((item) => item.state === "transferable"))}.`,
    technical.items.some((item) => item.state === "gap") &&
      `Skill gaps: ${names(technical.items.filter((item) => item.state === "gap"))}.`,
    `Formal fit: ${formal.mandatory.fulfilled} of ${formal.mandatory.total} mandatory requirements fulfilled.`,
    formal.blockers.length > 0 &&
      `Blockers: ${formal.blockers.map((entry) => names(entry.items)).join("; ")}.`,
    formal.risks.length > 0 &&
      `Unverified mandatory (possible risks, data missing): ${formal.risks.map((entry) => names(entry.items)).join("; ")}.`,
    ...formal.gaps.map(
      (item) =>
        `Duration ${item.requirement.normalised}: ${item.duration!.required} months required, ${item.duration!.confirmed} confirmed.`,
    ),
    evidence.available
      ? `Evidence in the CV: ${evidence.score ?? "-"} of 10, ${evidence.gaps} documentation gaps.`
      : "Evidence: no CV for this project yet.",
    evidence.missingProfileData.length > 0 &&
      `Not in the profile data: ${names(evidence.missingProfileData)}.`,
    `Economic fit: ${economic.score ?? "not assessable"} of 10 (coverage ${percent(economic.coverage)}).`,
    economic.exclusions.length > 0 &&
      `Exclusion criteria hit: ${economic.exclusions.map((entry) => entry.kind).join(", ")}.`,
    economic.openQuestions.length > 0 && `Open questions: ${economic.openQuestions.join(", ")}.`,
  ]
    .filter(Boolean)
    .join("\n");
}

function projectLines(project: Project, view: AssessmentView | null): string {
  const fit = project.fit;
  const findings = fit?.findings ?? [];
  if (project.draft) {
    return [
      project.brief
        ? `Draft saved from pasted listing text${project.sourceUrl ? ` (${project.sourceUrl})` : ""}.`
        : `Draft saved with only its link: ${project.sourceUrl}`,
      "The listing has not been read yet; it is processed on the edit page.",
    ].join("\n");
  }
  return [
    `Title: ${project.title}`,
    project.company && `Client: ${project.company}`,
    project.agency && `Agency: ${project.agency}`,
    project.contact && `Contact: ${project.contact}`,
    project.terms && `Terms: ${project.terms}`,
    project.tech.length > 0 && `Tech: ${project.tech.join(", ")}`,
    project.required.length > 0 && `Required: ${project.required.join("; ")}`,
    project.preferred.length > 0 && `Preferred: ${project.preferred.join("; ")}`,
    `Status: ${project.status}${project.archived ? " (archived)" : ""}`,
    view
      ? assessmentLines(view)
      : fit
        ? `Legacy assessment (one score, before the four dimensions; reassess for details): ${fit.score ?? "none"} of 10. ${findings
            .map((finding) => `${finding.requirement}: ${finding.status}`)
            .join("; ")}`
        : "Not assessed yet.",
    `Tailored CV saved: ${project.cv ? "yes" : "no"}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function projectListLines(list: Project[]): string {
  const open = list.filter((project) => !project.archived);
  if (open.length === 0) {
    return "No projects yet.";
  }
  return open
    .slice(0, 15)
    .map(
      (project) =>
        `- ${project.title}${project.company ? ` (${project.company})` : ""} · ${project.draft ? "draft, not read yet" : `${project.status} · fit ${project.fit?.score ?? "-"}`}`,
    )
    .join("\n");
}

function applicationLines(application: Application, project: Project | null): string {
  const frozen = application.snapshot.project;
  return [
    `Project: ${project?.title ?? frozen.title}${(project?.company ?? frozen.company) ? ` (${project?.company ?? frozen.company})` : ""}`,
    `Sent: ${application.submittedAt.slice(0, 10)} by ${application.channel}`,
    `Status: ${project?.status ?? "project deleted"}`,
    application.followUpAt &&
      `Follow-up: ${application.followUpAt}${application.followUpNote ? ` (${application.followUpNote})` : ""}`,
    application.events.length > 0 &&
      `Activity:\n${application.events
        .slice(-6)
        .map((event) => `- ${event.at.slice(0, 10)} ${event.kind}: ${clip(event.text, 200)}`)
        .join("\n")}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Reads what the open page is about; everything is scoped to the signed-in person. */
export async function buildContext(
  account: Account,
  request: AssistantRequest,
): Promise<AssistantContext> {
  const { view, context } = request;
  const [profile, references] = await Promise.all([
    experience.findProfile(account.id),
    experience.listReferences(account.id),
  ]);
  const sections: AssistantContext["sections"] = [{ tag: "profile", text: profileLines(profile) }];
  const known = [profile?.email ?? "", profile?.phone ?? "", profile?.website ?? ""];
  let project: Project | null = null;

  const application =
    view.page === "application" && view.applicationId
      ? await applications.findApplication(account.id, view.applicationId)
      : null;
  const projectId = view.projectId ?? application?.projectId ?? null;
  if (projectId) {
    project = await projects.findProject(account.id, projectId);
  }

  if (application) {
    sections.push({ tag: "application", text: applicationLines(application, project) });
  }
  if (project) {
    // Listing facts come from a third party; the prompt treats them as data only.
    const view = project.assessment
      ? await viewOf(account.id, { ...project, assessment: project.assessment }).catch(() => null)
      : null;
    sections.push({ tag: "project", text: projectLines(project, view) });
    known.push(project.contactEmail);
  }
  if (["project", "cv", "experience", "import"].includes(view.page) || !project) {
    sections.push({
      tag: "references",
      text: referenceLines(references, view.page === "project" || view.page === "cv"),
    });
  }
  if (["dashboard", "projects", "new_project"].includes(view.page)) {
    sections.push({
      tag: "projects",
      text: projectListLines(await projects.listProjects(account.id)),
    });
  }
  if (context.email && view.page === "apply") {
    sections.push({
      tag: "email",
      text: `Subject: ${context.email.subject}\n\n${context.email.message}`,
    });
    known.push(context.email.subject, context.email.message);
  }
  if (context.progress && view.page === "progress") {
    sections.push({
      tag: "progress",
      text: progressLines(await listApplications(account), context.progress),
    });
  }
  if (context.summary !== null && view.page === "cv") {
    sections.push({ tag: "cv_summary", text: context.summary || "(empty)" });
    known.push(context.summary);
  }

  return {
    sections,
    page: PAGE_LINES[view.page],
    known: [
      ...known,
      request.message,
      ...request.history.filter((turn) => turn.role === "user").map((turn) => turn.content),
    ].filter(Boolean),
    project,
  };
}

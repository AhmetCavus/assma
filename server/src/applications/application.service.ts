import { randomUUID } from "node:crypto";
import {
  assessProject,
  summariseAssessment,
  APPLICATION_LIMITS,
  applicationChangeSchema,
  applicationInputSchema,
  eventInputSchema,
  looksLikePdf,
  profileInputSchema,
  type Application,
  type ApplicationEvent,
  type ApplicationSummary,
  type Project,
  type Snapshot,
} from "@assma/shared";
import { candidateOf } from "../assessment/assessment.service.js";
import * as experience from "../experience/experience.repository.js";
import * as preferences from "../preferences/preferences.repository.js";
import type { Account } from "../platform/access.js";
import { AssmaError, notFound } from "../platform/errors.js";
import { RateLimiter } from "../platform/rateLimit.js";
import * as projects from "../projects/project.repository.js";
import * as repository from "./application.repository.js";

const HOUR = 60 * 60 * 1000;
const submissionsPerAccount = new RateLimiter(60, HOUR);
/** A clock a little ahead of the server's still counts as "now". */
const FUTURE_TOLERANCE_MS = 10 * 60 * 1000;

async function owned(account: Account, id: string): Promise<Application> {
  const application = await repository.findApplication(account.id, id);
  if (!application) {
    throw notFound();
  }
  return application;
}

function summaryOf(application: Application, project: Project | undefined): ApplicationSummary {
  const frozen = application.snapshot.project;
  return {
    id: application.id,
    projectId: application.projectId,
    // The current title once the project was renamed; the frozen one if it was deleted.
    title: project?.title ?? frozen.title,
    company: project?.company ?? frozen.company,
    agency: project?.agency ?? frozen.agency,
    contact: project?.contact ?? frozen.contact,
    channel: application.channel,
    submittedAt: application.submittedAt,
    status: project?.status ?? null,
    archived: project?.archived ?? false,
    followUpAt: application.followUpAt,
    followUpNote: application.followUpNote,
    hasFile: application.file !== null,
    lastEvent: application.events.at(-1) ?? null,
  };
}

export async function listApplications(account: Account): Promise<ApplicationSummary[]> {
  const [applications, list] = await Promise.all([
    repository.listApplications(account.id),
    projects.listProjects(account.id),
  ]);
  const byId = new Map(list.map((project) => [project.id, project]));
  return applications.map((application) => summaryOf(application, byId.get(application.projectId)));
}

export const getApplication = owned;

/** "Mara-Linden_Aster-Care.pdf": no paths, no odd characters, always ".pdf". */
function safeFileName(name: string): string {
  const base = name
    .replace(/\.pdf$/i, "")
    .replace(/[^\p{L}\p{N}_. -]+/gu, "-")
    .replace(/^[-. ]+|[-. ]+$/g, "")
    .slice(0, APPLICATION_LIMITS.fileName - 4);
  return `${base || "CV"}.pdf`;
}

/**
 * Records a sent email or a portal submission. The listing, fit, profile, references and CV
 * choices are read from the stored data and frozen; the PDF is kept exactly as it was sent.
 */
/** The four dimensions frozen with a submission, evidenced against the CV that was sent. */
async function assessmentAtSubmission(
  account: Account,
  project: Project,
  cv: { summary: string; referenceIds: string[]; skills: string[] },
) {
  if (!project.assessment) {
    return null;
  }
  const [candidate, stored] = await Promise.all([
    candidateOf(account.id),
    preferences.findPreferences(account.id),
  ]);
  const view = assessProject({
    assessment: project.assessment,
    candidate,
    cv,
    conditions: project.conditions,
    preferences: stored.economic,
  });
  return summariseAssessment(view, project.assessment.assessedAt);
}

export async function createApplication(account: Account, input: unknown): Promise<Application> {
  const parsed = applicationInputSchema.parse(input);
  const project = await projects.findProject(account.id, parsed.projectId);
  if (!project) {
    throw notFound();
  }
  if (Date.parse(parsed.submittedAt) > Date.now() + FUTURE_TOLERANCE_MS) {
    throw new AssmaError(400, "submitted_in_future");
  }
  if ((await repository.countApplications(account.id)) >= APPLICATION_LIMITS.applications) {
    throw new AssmaError(409, "application_limit");
  }
  submissionsPerAccount.attempt(account.id);

  let file: { name: string; data: Buffer } | null = null;
  if (parsed.file) {
    const data = Buffer.from(parsed.file, "base64");
    if (data.length > APPLICATION_LIMITS.fileBytes) {
      throw new AssmaError(413, "too_large");
    }
    if (!looksLikePdf(data)) {
      throw new AssmaError(400, "invalid_file");
    }
    file = { name: safeFileName(parsed.fileName), data };
  }

  const [profile, references, images] = await Promise.all([
    experience.findProfile(account.id),
    experience.listReferences(account.id),
    parsed.cv.imageId ? experience.listImages(account.id) : Promise.resolve([]),
  ]);
  const byId = new Map(references.map((reference) => [reference.id, reference]));
  const selected = parsed.cv.referenceIds.map((id) => byId.get(id));
  if (selected.some((reference) => !reference)) {
    throw new AssmaError(400, "unknown_reference");
  }
  const photo = parsed.cv.imageId
    ? (images.find((image) => image.id === parsed.cv.imageId)?.dataUrl ?? null)
    : null;
  if (parsed.cv.imageId && !photo) {
    throw new AssmaError(400, "unknown_image");
  }

  const snapshot: Snapshot = {
    project: {
      title: project.title,
      company: project.company,
      agency: project.agency,
      contact: project.contact,
      contactEmail: project.contactEmail,
      sourceUrl: project.sourceUrl,
      brief: project.brief,
      tech: project.tech,
      required: project.required,
      preferred: project.preferred,
      terms: project.terms,
    },
    fit: project.fit,
    assessment: await assessmentAtSubmission(account, project, parsed.cv),
    profile: profile ?? { ...profileInputSchema.parse({}), updatedAt: null },
    references: selected.filter((reference) => reference !== undefined),
    allReferences: references,
    cv: {
      summary: parsed.cv.summary,
      skills: parsed.cv.skills,
      language: parsed.cv.language,
      design: parsed.cv.design,
      photo,
    },
  };

  const application = await repository.createApplication(
    account.id,
    {
      projectId: project.id,
      channel: parsed.channel,
      submittedAt: new Date(parsed.submittedAt),
      email: parsed.channel === "email" ? parsed.email : null,
      portal: parsed.channel === "portal" ? parsed.portal : null,
      file: null,
      snapshot,
    },
    file,
  );
  // The first application moves a captured project on; later stages stay as they are.
  if (project.status === "captured") {
    await projects.updateProject(account.id, project.id, { status: "applied" });
  }
  return application;
}

function event(
  fields: Partial<ApplicationEvent> & Pick<ApplicationEvent, "kind">,
): ApplicationEvent {
  return {
    id: randomUUID(),
    at: new Date().toISOString(),
    text: "",
    status: null,
    followUpAt: null,
    ...fields,
  };
}

/** A new status (kept on the project) or a new follow-up date, each logged as an event. */
export async function changeApplication(account: Account, id: string, input: unknown) {
  const change = applicationChangeSchema.parse(input);
  const application = await owned(account, id);
  let updated: Application | null = application;

  if (change.status !== undefined) {
    const project = await projects.updateProject(account.id, application.projectId, {
      status: change.status,
    });
    if (!project) {
      throw new AssmaError(409, "project_deleted");
    }
    updated = await repository.updateApplication(
      account.id,
      id,
      {},
      event({ kind: "status", status: change.status }),
    );
  }

  if (change.followUpAt !== undefined || change.followUpNote !== undefined) {
    const followUpAt =
      change.followUpAt !== undefined ? change.followUpAt : (updated?.followUpAt ?? null);
    const followUpNote =
      followUpAt === null ? "" : (change.followUpNote ?? updated?.followUpNote ?? "");
    updated = await repository.updateApplication(
      account.id,
      id,
      { followUpAt, followUpNote },
      event({ kind: "followUp", followUpAt, text: followUpNote }),
    );
  }
  if (!updated) {
    throw notFound();
  }
  return updated;
}

export async function addEvent(account: Account, id: string, input: unknown) {
  const { kind, text, at } = eventInputSchema.parse(input);
  const application = await owned(account, id);
  if (application.events.length >= APPLICATION_LIMITS.events) {
    throw new AssmaError(409, "event_limit");
  }
  if (Date.parse(at) > Date.now() + FUTURE_TOLERANCE_MS) {
    throw new AssmaError(400, "submitted_in_future");
  }
  const updated = await repository.updateApplication(account.id, id, {}, event({ kind, text, at }));
  if (!updated) {
    throw notFound();
  }
  return updated;
}

export async function removeEvent(account: Account, id: string, eventId: string) {
  const updated = await repository.removeEvent(account.id, id, eventId);
  if (!updated) {
    throw notFound();
  }
  return updated;
}

/** The exact PDF that was sent, base64 for the JSON boundary. */
export async function applicationFile(account: Account, id: string) {
  await owned(account, id);
  const file = await repository.findFile(account.id, id);
  if (!file) {
    throw notFound();
  }
  return { name: file.name, data: file.data.toString("base64") };
}

export async function deleteApplication(account: Account, id: string) {
  if (!(await repository.deleteApplication(account.id, id))) {
    throw notFound();
  }
  return { id };
}

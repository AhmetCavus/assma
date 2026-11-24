import {
  draftTitle,
  listingFetchRequestSchema,
  listingSuggestRequestSchema,
  PROJECT_LIMITS,
  projectChangeSchema,
  projectDraftRequestSchema,
  projectInputSchema,
  textDraftTitle,
  type ListingFetchResult,
  type ListingJob,
  type ListingSuggestions,
  type ProjectDraftResult,
} from "@assma/shared";
import * as applications from "../applications/application.repository.js";
import type { Account } from "../platform/access.js";
import { AssmaError, notFound } from "../platform/errors.js";
import { modelJobs, type JobView } from "../platform/modelJobs.js";
import { RateLimiter } from "../platform/rateLimit.js";
import { FetchRefused, safeFetch } from "../platform/safeFetch.js";
import { readListing } from "./listing.reader.js";
import { listingText } from "./listingText.js";
import * as repository from "./project.repository.js";

const HOUR = 60 * 60 * 1000;
const fetchesPerAccount = new RateLimiter(60, HOUR);
const suggestionsPerAccount = new RateLimiter(40, HOUR);
const KIND = "listing";

export const listProjects = (account: Account) => repository.listProjects(account.id);

export async function getProject(account: Account, id: string) {
  const project = await repository.findProject(account.id, id);
  if (!project) {
    throw notFound();
  }
  return project;
}

/** Without conditions in the input, the stored ones stay untouched. */
function withoutMissingConditions<T extends { conditions?: unknown }>(fields: T) {
  const { conditions, ...rest } = fields;
  return conditions === undefined ? rest : { ...rest, conditions };
}

export async function createProject(account: Account, input: unknown) {
  const fields = withoutMissingConditions(projectInputSchema.parse(input));
  if ((await repository.countProjects(account.id)) >= PROJECT_LIMITS.projects) {
    throw new AssmaError(409, "project_limit");
  }
  return repository.createProject(account.id, fields);
}

/**
 * Quick add: saves links or a pasted listing as drafts without reading them, so a listing
 * found on the go is not lost. Links are loaded when the draft is processed; text is read
 * directly. A link that is already a project is reported instead of added twice.
 */
export async function addDrafts(account: Account, input: unknown): Promise<ProjectDraftResult> {
  const request = projectDraftRequestSchema.parse(input);
  const drafts =
    "urls" in request
      ? request.urls.map((url) => ({ title: draftTitle(url), sourceUrl: url, brief: "" }))
      : [
          {
            title: textDraftTitle(request.text) || draftTitle(request.url),
            sourceUrl: request.url,
            brief: request.text,
          },
        ];
  const existing = await repository.existingSources(
    account.id,
    drafts.map((draft) => draft.sourceUrl).filter(Boolean),
  );
  const fresh = drafts.filter((draft) => !existing.includes(draft.sourceUrl));
  const count = await repository.countProjects(account.id);
  if (count + fresh.length > PROJECT_LIMITS.projects) {
    throw new AssmaError(409, "project_limit");
  }
  const created = [];
  for (const draft of fresh) {
    created.push(await repository.createProject(account.id, projectInputSchema.parse(draft), true));
  }
  return { created, existing };
}

/** Saving the full form also completes a draft. */
export async function updateProject(account: Account, id: string, input: unknown) {
  const updated = await repository.updateProject(account.id, id, {
    ...withoutMissingConditions(projectInputSchema.parse(input)),
    draft: false,
  });
  if (!updated) {
    throw notFound();
  }
  return updated;
}

/** Status and archive changes from the register's row menu. */
export async function changeProject(account: Account, id: string, input: unknown) {
  const updated = await repository.updateProject(account.id, id, projectChangeSchema.parse(input));
  if (!updated) {
    throw notFound();
  }
  return updated;
}

/** Deleting a project also deletes its applications and their files. */
export async function deleteProject(account: Account, id: string) {
  if (!(await repository.deleteProject(account.id, id))) {
    throw notFound();
  }
  await applications.deleteForProject(account.id, id);
  return { id };
}

/** Loads a public listing page as text. Gated portals and blocked addresses report a code. */
export async function fetchListing(account: Account, input: unknown): Promise<ListingFetchResult> {
  const { url } = listingFetchRequestSchema.parse(input);
  fetchesPerAccount.attempt(account.id);
  try {
    const page = await safeFetch(url);
    const text = listingText(page.body, page.contentType).slice(0, PROJECT_LIMITS.brief);
    if (text.length < PROJECT_LIMITS.minBrief) {
      throw new AssmaError(422, "listing_empty");
    }
    return { url: page.url, text };
  } catch (error) {
    if (error instanceof FetchRefused) {
      throw new AssmaError(422, `listing_${error.reason}`);
    }
    throw error;
  }
}

function toListingJob(view: JobView<ListingSuggestions>): ListingJob {
  return {
    id: view.id,
    state: view.state,
    position: view.position,
    startedAt: view.startedAt,
    suggestions: view.result,
    error: view.error,
  };
}

export async function suggest(account: Account, input: unknown) {
  const { text } = listingSuggestRequestSchema.parse(input);
  suggestionsPerAccount.attempt(account.id);
  return toListingJob(
    modelJobs.start(account.id, KIND, (signal, progress) => readListing(text, signal, progress)),
  );
}

export async function suggestion(account: Account, id: string) {
  return toListingJob(modelJobs.get<ListingSuggestions>(account.id, KIND, id));
}

export async function cancelSuggestion(account: Account, id: string) {
  return modelJobs.cancel(account.id, KIND, id);
}

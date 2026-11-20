import {
  listingFetchRequestSchema,
  listingSuggestRequestSchema,
  PROJECT_LIMITS,
  projectChangeSchema,
  projectInputSchema,
  type ListingFetchResult,
  type ListingJob,
  type ListingSuggestions,
} from "@assma/shared";
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

export async function createProject(account: Account, input: unknown) {
  const fields = projectInputSchema.parse(input);
  if ((await repository.countProjects(account.id)) >= PROJECT_LIMITS.projects) {
    throw new AssmaError(409, "project_limit");
  }
  return repository.createProject(account.id, fields);
}

export async function updateProject(account: Account, id: string, input: unknown) {
  const updated = await repository.updateProject(account.id, id, projectInputSchema.parse(input));
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

export async function deleteProject(account: Account, id: string) {
  if (!(await repository.deleteProject(account.id, id))) {
    throw notFound();
  }
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

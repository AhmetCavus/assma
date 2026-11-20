import {
  cvImportApplySchema,
  cvImportRequestSchema,
  EXPERIENCE_LIMITS,
  type CvImportApplied,
  type CvImportJob,
  type CvImportStatus,
  type CvSuggestions,
} from "@assma/shared";
import type { Account } from "../platform/access.js";
import { AssmaError } from "../platform/errors.js";
import { modelAvailable, ollamaSettings } from "../platform/ollama.js";
import { RateLimiter } from "../platform/rateLimit.js";
import { modelJobs, type JobView } from "../platform/modelJobs.js";
import { readCv } from "./cvImport.reader.js";
import * as repository from "./experience.repository.js";

const KIND = "cv";

function toCvJob(view: JobView<CvSuggestions>): CvImportJob {
  return {
    id: view.id,
    state: view.state,
    position: view.position,
    found: view.result ? view.result.references.length : view.progress.found,
    part: view.progress.part,
    parts: view.progress.parts,
    startedAt: view.startedAt,
    suggestions: view.result,
    error: view.error,
  };
}

const importsPerAccount = new RateLimiter(20, 60 * 60 * 1000);

export async function status(): Promise<CvImportStatus> {
  return { available: await modelAvailable(), model: ollamaSettings().model };
}

export async function start(account: Account, input: unknown) {
  const { text } = cvImportRequestSchema.parse(input);
  importsPerAccount.attempt(account.id);
  return toCvJob(
    modelJobs.start(account.id, KIND, (signal, progress) => readCv(text, signal, progress)),
  );
}

export async function job(account: Account, id: string) {
  return toCvJob(modelJobs.get<CvSuggestions>(account.id, KIND, id));
}

export async function cancel(account: Account, id: string) {
  return modelJobs.cancel(account.id, KIND, id);
}

/**
 * Saves the reviewed selection. Profile fields fill only what is still empty, so an import
 * never overwrites details the person already confirmed.
 */
export async function apply(account: Account, input: unknown): Promise<CvImportApplied> {
  const selection = cvImportApplySchema.parse(input);
  const existing = await repository.countReferences(account.id);
  if (existing + selection.references.length > EXPERIENCE_LIMITS.references) {
    throw new AssmaError(409, "reference_limit");
  }
  let profileFields: string[] = [];
  if (selection.profile) {
    const saved = await repository.findProfile(account.id);
    const fill = Object.fromEntries(
      Object.entries(selection.profile).filter(
        ([field, value]) => value && !saved?.[field as keyof typeof selection.profile],
      ),
    );
    profileFields = Object.keys(fill);
    if (profileFields.length > 0 || !saved) {
      await repository.saveProfile(account.id, {
        name: saved?.name ?? "",
        headline: saved?.headline ?? "",
        location: saved?.location ?? "",
        email: saved?.email ?? "",
        summary: saved?.summary ?? "",
        ...fill,
      });
    }
  }
  await repository.createReferences(account.id, selection.references);
  return { references: selection.references.length, profileFields };
}

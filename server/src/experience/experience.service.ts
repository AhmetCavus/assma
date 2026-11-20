import {
  EXPERIENCE_LIMITS,
  profileInputSchema,
  referenceInputSchema,
  sortReferences,
  type Experience,
} from "@assma/shared";
import type { Account } from "../platform/access.js";
import { AssmaError, notFound } from "../platform/errors.js";
import { findProfile as findAccountProfile } from "../account/account.repository.js";
import * as repository from "./experience.repository.js";

/**
 * The saved details, or a first draft from the account (name and a real address) so the
 * form does not start empty. `updatedAt: null` tells the page nothing has been saved yet.
 */
async function profileOrDraft(account: Account) {
  const saved = await repository.findProfile(account.id);
  if (saved) {
    return saved;
  }
  const yappioProfile = await findAccountProfile(account.id);
  const email = yappioProfile?.email ?? "";
  const draft = profileInputSchema.parse({
    name: (yappioProfile?.username ?? "").slice(0, EXPERIENCE_LIMITS.name),
    // The initial administrator's "email" is the name "admin", not an address.
    email: profileInputSchema.shape.email.safeParse(email).success ? email : "",
  });
  return { ...draft, updatedAt: null };
}

export async function experience(account: Account): Promise<Experience> {
  const [profile, references] = await Promise.all([
    profileOrDraft(account),
    repository.listReferences(account.id),
  ]);
  return { profile, references: sortReferences(references) };
}

export async function saveProfile(account: Account, input: unknown) {
  return repository.saveProfile(account.id, profileInputSchema.parse(input));
}

export async function createReference(account: Account, input: unknown) {
  const reference = referenceInputSchema.parse(input);
  if ((await repository.countReferences(account.id)) >= EXPERIENCE_LIMITS.references) {
    throw new AssmaError(409, "reference_limit");
  }
  return repository.createReference(account.id, reference);
}

export async function updateReference(account: Account, id: string, input: unknown) {
  const updated = await repository.updateReference(
    account.id,
    id,
    referenceInputSchema.parse(input),
  );
  if (!updated) {
    throw notFound();
  }
  return updated;
}

export async function deleteReference(account: Account, id: string) {
  if (!(await repository.deleteReference(account.id, id))) {
    throw notFound();
  }
  return { id };
}

import {
  cleanSkillUsage,
  confirmUsage,
  EXPERIENCE_LIMITS,
  skillFactsInputSchema,
  usageConfirmationSchema,
  profileImageUploadSchema,
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
  const [profile, references, images, skillFacts] = await Promise.all([
    profileOrDraft(account),
    repository.listReferences(account.id),
    repository.listImages(account.id),
    repository.listSkillFacts(account.id),
  ]);
  return { profile, references: sortReferences(references), images, skillFacts };
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

/**
 * Saving a reference keeps its confirmed skill usage when the form leaves it out. Usage of
 * skills that were removed, or periods that no longer fit changed dates, is dropped: the
 * person confirmed something else than what is now recorded.
 */
export async function updateReference(account: Account, id: string, input: unknown) {
  const fields = referenceInputSchema.parse(input);
  const current = await repository.findReference(account.id, id);
  if (!current) {
    throw notFound();
  }
  const usage = cleanSkillUsage(fields.skillUsage ?? current.skillUsage, fields.skills).filter(
    (entry) =>
      typeof entry.period === "string" ||
      (entry.period.start >= fields.start &&
        (fields.end === null || (entry.period.end !== null && entry.period.end <= fields.end))),
  );
  const updated = await repository.updateReference(account.id, id, {
    ...fields,
    skillUsage: usage,
  });
  if (!updated) {
    throw notFound();
  }
  return updated;
}

/** Confirms how several skills of one reference were used, by default for the whole engagement. */
export async function confirmReferenceUsage(account: Account, id: string, input: unknown) {
  const { skills, period } = usageConfirmationSchema.parse(input);
  const current = await repository.findReference(account.id, id);
  if (!current) {
    throw notFound();
  }
  if (
    typeof period !== "string" &&
    (period.start < current.start ||
      (current.end !== null && (period.end === null || period.end > current.end)))
  ) {
    throw new AssmaError(400, "usage_outside_engagement");
  }
  const updated = await repository.updateReference(account.id, id, {
    organization: current.organization,
    role: current.role,
    start: current.start,
    end: current.end,
    contribution: current.contribution,
    skills: current.skills,
    skillUsage: confirmUsage(current, skills, period),
  });
  if (!updated) {
    throw notFound();
  }
  return updated;
}

/** Replaces the statements about skills: complete experience, or none at all. */
export async function saveSkillFacts(account: Account, input: unknown) {
  return repository.saveSkillFacts(account.id, skillFactsInputSchema.parse(input).facts);
}

export async function deleteReference(account: Account, id: string) {
  if (!(await repository.deleteReference(account.id, id))) {
    throw notFound();
  }
  return { id };
}

const JPEG_START = Buffer.from([0xff, 0xd8, 0xff]);
const JPEG_END = Buffer.from([0xff, 0xd9]);

/**
 * Stores a profile photo. The browser crops and resizes it to a square JPEG; the API only
 * accepts what really is a complete JPEG within the size limit.
 */
export async function uploadImage(account: Account, input: unknown) {
  const { data } = profileImageUploadSchema.parse(input);
  const bytes = Buffer.from(data, "base64");
  const complete =
    bytes.subarray(0, 3).equals(JPEG_START) &&
    bytes.subarray(-2).equals(JPEG_END) &&
    bytes.length <= EXPERIENCE_LIMITS.imageBytes;
  if (!complete) {
    throw new AssmaError(400, "invalid_image");
  }
  if ((await repository.countImages(account.id)) >= EXPERIENCE_LIMITS.images) {
    throw new AssmaError(409, "image_limit");
  }
  return repository.createImage(account.id, bytes);
}

export async function deleteImage(account: Account, id: string) {
  if (!(await repository.deleteImage(account.id, id))) {
    throw notFound();
  }
  return { id };
}

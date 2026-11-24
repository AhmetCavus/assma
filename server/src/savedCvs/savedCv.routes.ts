import { Router } from "express";
import { identifier, SAVED_CV_LIMITS, savedCvInputSchema } from "@assma/shared";
import { accountOf } from "../platform/access.js";
import { endpoint } from "../platform/endpoint.js";
import { AssmaError, notFound } from "../platform/errors.js";
import * as repository from "./savedCv.repository.js";

/** The signed-in person's saved CV configurations; names are unique per account. */
export const savedCvRoutes = Router();

async function ensureUniqueName(ownerId: string, name: string, except: string | null) {
  const taken = (await repository.listSavedCvs(ownerId)).some(
    (saved) => saved.id !== except && saved.name.toLowerCase() === name.toLowerCase(),
  );
  if (taken) {
    throw new AssmaError(409, "name_taken");
  }
}

savedCvRoutes.get(
  "/",
  endpoint((_request, response) => repository.listSavedCvs(accountOf(response).id)),
);

savedCvRoutes.post(
  "/",
  endpoint(async (request, response) => {
    const ownerId = accountOf(response).id;
    const input = savedCvInputSchema.parse(request.body);
    if ((await repository.countSavedCvs(ownerId)) >= SAVED_CV_LIMITS.perAccount) {
      throw new AssmaError(409, "saved_cv_limit");
    }
    await ensureUniqueName(ownerId, input.name, null);
    return repository.createSavedCv(ownerId, input.name, input.cv);
  }),
);

savedCvRoutes.put(
  "/:id",
  endpoint(async (request, response) => {
    const ownerId = accountOf(response).id;
    const id = identifier.parse(request.params.id);
    const input = savedCvInputSchema.parse(request.body);
    await ensureUniqueName(ownerId, input.name, id);
    const saved = await repository.updateSavedCv(ownerId, id, input.name, input.cv);
    if (!saved) {
      throw notFound();
    }
    return saved;
  }),
);

savedCvRoutes.delete(
  "/:id",
  endpoint(async (request, response) => {
    const id = identifier.parse(request.params.id);
    if (!(await repository.deleteSavedCv(accountOf(response).id, id))) {
      throw notFound();
    }
    return { id };
  }),
);

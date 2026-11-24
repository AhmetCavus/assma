import { Router } from "express";
import { economicPreferencesSchema } from "@assma/shared";
import { accountOf } from "../platform/access.js";
import { endpoint } from "../platform/endpoint.js";
import * as repository from "./preferences.repository.js";

/**
 * The signed-in person's own preferences. Saving them starts no model run: Economic Fit is
 * computed from them whenever a project is shown.
 */
export const preferenceRoutes = Router();

preferenceRoutes.get(
  "/",
  endpoint((_request, response) => repository.findPreferences(accountOf(response).id)),
);
preferenceRoutes.put(
  "/economic",
  endpoint((request, response) =>
    repository.saveEconomic(accountOf(response).id, economicPreferencesSchema.parse(request.body)),
  ),
);

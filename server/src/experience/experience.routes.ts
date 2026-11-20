import { Router } from "express";
import { identifier } from "@assma/shared";
import { accountOf } from "../platform/access.js";
import { endpoint } from "../platform/endpoint.js";
import * as service from "./experience.service.js";

/** The signed-in person's own profile and references; every query is scoped to them. */
export const experienceRoutes = Router();

experienceRoutes.get(
  "/",
  endpoint((_request, response) => service.experience(accountOf(response))),
);
experienceRoutes.put(
  "/profile",
  endpoint((request, response) => service.saveProfile(accountOf(response), request.body)),
);
experienceRoutes.post(
  "/references",
  endpoint((request, response) => service.createReference(accountOf(response), request.body)),
);
experienceRoutes.put(
  "/references/:id",
  endpoint((request, response) =>
    service.updateReference(accountOf(response), identifier.parse(request.params.id), request.body),
  ),
);
experienceRoutes.delete(
  "/references/:id",
  endpoint((request, response) =>
    service.deleteReference(accountOf(response), identifier.parse(request.params.id)),
  ),
);

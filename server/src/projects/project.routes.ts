import { Router } from "express";
import { z } from "zod";
import { identifier } from "@assma/shared";
import { accountOf } from "../platform/access.js";
import { endpoint } from "../platform/endpoint.js";
import * as service from "./project.service.js";

const jobId = z.string().uuid();

/** The signed-in person's own projects; every query is scoped to them. */
export const projectRoutes = Router();

projectRoutes.get(
  "/",
  endpoint((_request, response) => service.listProjects(accountOf(response))),
);
projectRoutes.post(
  "/",
  endpoint((request, response) => service.createProject(accountOf(response), request.body)),
);

// Capturing from a link or text. Declared before "/:id" so the paths do not collide.
projectRoutes.post(
  "/listing/fetch",
  endpoint((request, response) => service.fetchListing(accountOf(response), request.body)),
);
projectRoutes.post(
  "/listing/suggest",
  endpoint((request, response) => service.suggest(accountOf(response), request.body)),
);
projectRoutes.get(
  "/listing/suggest/:id",
  endpoint((request, response) =>
    service.suggestion(accountOf(response), jobId.parse(request.params.id)),
  ),
);
projectRoutes.delete(
  "/listing/suggest/:id",
  endpoint((request, response) =>
    service.cancelSuggestion(accountOf(response), jobId.parse(request.params.id)),
  ),
);

projectRoutes.get(
  "/:id",
  endpoint((request, response) =>
    service.getProject(accountOf(response), identifier.parse(request.params.id)),
  ),
);
projectRoutes.put(
  "/:id",
  endpoint((request, response) =>
    service.updateProject(accountOf(response), identifier.parse(request.params.id), request.body),
  ),
);
projectRoutes.patch(
  "/:id",
  endpoint((request, response) =>
    service.changeProject(accountOf(response), identifier.parse(request.params.id), request.body),
  ),
);
projectRoutes.delete(
  "/:id",
  endpoint((request, response) =>
    service.deleteProject(accountOf(response), identifier.parse(request.params.id)),
  ),
);

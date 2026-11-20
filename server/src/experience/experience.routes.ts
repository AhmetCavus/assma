import { Router } from "express";
import { z } from "zod";
import { identifier } from "@assma/shared";

const jobId = z.string().uuid();
import { accountOf } from "../platform/access.js";
import { endpoint } from "../platform/endpoint.js";
import * as cvImport from "./cvImport.service.js";
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

// CV import: the browser sends extracted text; the model reads it in a background job.
experienceRoutes.get(
  "/import/status",
  endpoint(() => cvImport.status()),
);
experienceRoutes.post(
  "/import",
  endpoint((request, response) => cvImport.start(accountOf(response), request.body)),
);
experienceRoutes.post(
  "/import/apply",
  endpoint((request, response) => cvImport.apply(accountOf(response), request.body)),
);
experienceRoutes.get(
  "/import/:id",
  endpoint((request, response) =>
    cvImport.job(accountOf(response), jobId.parse(request.params.id)),
  ),
);
experienceRoutes.delete(
  "/import/:id",
  endpoint((request, response) =>
    cvImport.cancel(accountOf(response), jobId.parse(request.params.id)),
  ),
);

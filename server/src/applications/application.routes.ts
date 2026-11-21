import { Router } from "express";
import { z } from "zod";
import { identifier } from "@assma/shared";
import { accountOf } from "../platform/access.js";
import { endpoint } from "../platform/endpoint.js";
import * as service from "./application.service.js";

/** The signed-in person's own applications; every query is scoped to them. */
export const applicationRoutes = Router();

const idOf = (value: unknown) => identifier.parse(value);

applicationRoutes.get(
  "/",
  endpoint((_request, response) => service.listApplications(accountOf(response))),
);
applicationRoutes.post(
  "/",
  endpoint((request, response) => service.createApplication(accountOf(response), request.body)),
);
applicationRoutes.get(
  "/:id",
  endpoint((request, response) =>
    service.getApplication(accountOf(response), idOf(request.params.id)),
  ),
);
applicationRoutes.patch(
  "/:id",
  endpoint((request, response) =>
    service.changeApplication(accountOf(response), idOf(request.params.id), request.body),
  ),
);
applicationRoutes.delete(
  "/:id",
  endpoint((request, response) =>
    service.deleteApplication(accountOf(response), idOf(request.params.id)),
  ),
);
applicationRoutes.get(
  "/:id/file",
  endpoint((request, response) =>
    service.applicationFile(accountOf(response), idOf(request.params.id)),
  ),
);
applicationRoutes.post(
  "/:id/events",
  endpoint((request, response) =>
    service.addEvent(accountOf(response), idOf(request.params.id), request.body),
  ),
);
applicationRoutes.delete(
  "/:id/events/:eventId",
  endpoint((request, response) =>
    service.removeEvent(
      accountOf(response),
      idOf(request.params.id),
      z.string().uuid().parse(request.params.eventId),
    ),
  ),
);

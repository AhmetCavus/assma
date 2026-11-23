import { Router } from "express";
import { z } from "zod";
import { accountOf } from "../platform/access.js";
import { endpoint } from "../platform/endpoint.js";
import * as service from "./assistant.service.js";

const jobId = z.string().uuid();

/** The assma assistant: one question at a time per person, answered on the model queue. */
export const assistantRoutes = Router();

assistantRoutes.post(
  "/",
  endpoint((request, response) => service.ask(accountOf(response), request.body)),
);
assistantRoutes.get(
  "/:id",
  endpoint((request, response) => service.job(accountOf(response), jobId.parse(request.params.id))),
);
assistantRoutes.delete(
  "/:id",
  endpoint((request, response) =>
    service.cancel(accountOf(response), jobId.parse(request.params.id)),
  ),
);

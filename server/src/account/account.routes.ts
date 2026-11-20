import { Router } from "express";
import { accountOf } from "../platform/access.js";
import { endpoint } from "../platform/endpoint.js";
import { clientAddress } from "../platform/rateLimit.js";
import * as service from "./account.service.js";

/** Reachable without a session: signing in. */
export const accountPublicRoutes = Router();

accountPublicRoutes.post(
  "/login",
  endpoint((request) => service.login(request.body, clientAddress(request))),
);

/** The signed-in person's own account. */
export const accountRoutes = Router();

accountRoutes.get(
  "/",
  endpoint((_request, response) => service.accountInfo(accountOf(response))),
);

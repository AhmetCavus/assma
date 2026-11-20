import { Router } from "express";
import { endpoint } from "../platform/endpoint.js";
import { overview } from "./admin.service.js";

/** Mounted behind requireAccount(true): admins and root only. */
export const adminRoutes = Router();

adminRoutes.get(
  "/overview",
  endpoint(() => overview()),
);

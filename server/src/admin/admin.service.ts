import { Types } from "mongoose";
import type { AdminOverview } from "@assma/shared";
import { DATABASE_NAME } from "../config.js";
import { Profiles } from "../platform/yappio.js";
import { APP_VERSION } from "../platform/version.js";

const WEEK = 7 * 24 * 60 * 60 * 1000;

/** Account totals only; the admin panel never sees content. */
export async function overview(): Promise<AdminOverview> {
  const weekAgo = Types.ObjectId.createFromTime(Math.floor((Date.now() - WEEK) / 1000));
  const [users, admins, newUsersThisWeek] = await Promise.all([
    Profiles.model.countDocuments({}),
    Profiles.model.countDocuments({ role: { $in: ["admin", "root"] } }),
    Profiles.model.countDocuments({ _id: { $gte: weekAgo } }),
  ]);
  return {
    users,
    admins,
    newUsersThisWeek,
    system: { version: APP_VERSION, database: DATABASE_NAME },
  };
}

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/** The server package version, reported to Yappio's platform module and the admin overview. */
export const APP_VERSION = (require("../../package.json") as { version: string }).version;

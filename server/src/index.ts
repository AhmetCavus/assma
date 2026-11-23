import "dotenv/config";
import { configurationProblems, allowedOrigins, DEFAULT_PORT } from "./config.js";

process.env.DB_ENGINE ??= "mongodb";
process.env.MODELDIR ??= "models";
process.env.PORT ??= DEFAULT_PORT;
process.env.ENABLE_WEBSOCKET = "false";
process.env.ENABLE_OTP ??= "false";
const problems = configurationProblems(process.env);
if (problems.length > 0) {
  throw new Error(`assma configuration: ${problems.join("; ")}.`);
}

// The model provider is chosen once; every model task goes through it.
{
  const { inferenceSettings, createInferenceProvider, describeSettings } =
    await import("./platform/inference/config.js");
  const { useInferenceProvider } = await import("./platform/inference/provider.js");
  const { settings } = inferenceSettings(process.env);
  useInferenceProvider(createInferenceProvider(settings!));
  console.log(`assma model: ${describeSettings(settings!)}`);
}

// Yappio reads its configuration while loading, so it is imported after the checks above.
const express = (await import("express")).default;
const { Yappio } = await import("yappio");
const { installBoundaryFirst } = await import("./platform/boundary.js");
const { requireAccount } = await import("./platform/access.js");
const { accountPublicRoutes, accountRoutes } = await import("./account/account.routes.js");
const { adminRoutes } = await import("./admin/admin.routes.js");
const { experienceRoutes } = await import("./experience/experience.routes.js");
const { projectRoutes } = await import("./projects/project.routes.js");
const { assistantRoutes } = await import("./assistant/assistant.routes.js");
const { applicationRoutes } = await import("./applications/application.routes.js");
const { APP_VERSION } = await import("./platform/version.js");

const app = new Yappio({
  platform: {
    enabled: true,
    appId: "assma",
    appName: "assma",
    version: APP_VERSION,
    environment: process.env.NODE_ENV ?? "development",
    authAdmin: {
      enabled: true,
      rootAccessSupported: true,
      rootAccessEnabled: true,
      rootResetSupported: false,
      rootResetEnabled: false,
    },
  },
});

app.use((server) => {
  installBoundaryFirst(server, allowedOrigins(process.env.ALLOWED_ORIGINS));
  // Signing in works without a session, so it mounts first.
  server.use("/api/assma/account", express.json({ limit: "8kb" }), accountPublicRoutes);
  const api = express.Router();
  // Bodies are read only after the session check. A CV's text (100,000 characters, mostly
  // one to three bytes in UTF-8 plus JSON escapes) needs more room than everything else.
  const cvText = express.json({ limit: "512kb" });
  // A CV (100,000 characters) or a captured listing with its brief (30,000 characters).
  const large = (path: string) =>
    path === "/experience/import" || path === "/experience/images" || path.startsWith("/projects");
  const regular = express.json({ limit: "64kb" });
  // A recorded application carries the exact CV PDF (up to 3 MB, base64 in JSON).
  const submission = express.json({ limit: "4.5mb" });
  const bodyParser = (method: string, path: string) =>
    method === "POST" && path === "/applications" ? submission : large(path) ? cvText : regular;
  api.use(requireAccount(), (request, response, next) =>
    bodyParser(request.method, request.path)(request, response, next),
  );
  api.use("/account", accountRoutes);
  api.use("/experience", experienceRoutes);
  api.use("/projects", projectRoutes);
  api.use("/applications", applicationRoutes);
  api.use("/assistant", assistantRoutes);
  api.use("/admin", requireAccount(true), adminRoutes);
  server.use("/api/assma", api);
});

await app.start();
console.log("assma is running with Yappio.");

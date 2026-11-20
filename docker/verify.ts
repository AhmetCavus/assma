import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { access, cp, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parse } from "yaml";

const root = process.cwd();
const compose = parse(await readFile("docker/docker-compose.yml", "utf8"));
const manifest = parse(await readFile("yappai.host.yaml", "utf8"));
const routing = parse(await readFile("docker/traefik.yml", "utf8"));

const API_PORT = "4100";
const domains: Record<string, string> = {
  web: "assma.yappai.de",
  admin: "assma-admin.yappai.de",
  api: "assma-api.yappai.de",
};
const internalUrl = (name: string, container: string) =>
  `http://${container}:${name === "api" ? API_PORT : "80"}`;

assert.equal(manifest.id, "assma");
assert.equal(manifest.slug, "assma");
assert.equal(path.resolve(root, manifest.composeFile), path.resolve("docker/docker-compose.yml"));
assert.equal(manifest.composeEnvFile, ".env");
assert.deepEqual(Object.keys(compose.services).sort(), ["admin", "api", "web"]);
assert.equal(compose.networks["dev-proxy"].external, true);
for (const [name, domain] of Object.entries(domains)) {
  const service = compose.services[name];
  const registration = manifest.services.find((entry: { name: string }) => entry.name === name);
  assert.ok(registration, `manifest service ${name}`);
  assert.equal(registration.containerName, service.container_name);
  assert.equal(registration.containerName, `assma-${name}`);
  assert.equal(String(registration.port), name === "api" ? API_PORT : "80");
  assert.deepEqual(service.expose, [name === "api" ? API_PORT : "80"]);
  const router = routing.http.routers[`assma-${name}`];
  assert.equal(router.rule, `Host(\`${domain}\`)`);
  assert.deepEqual(router.entryPoints, ["web"]);
  assert.equal(
    routing.http.services[router.service].loadBalancer.servers[0].url,
    internalUrl(name, registration.containerName),
  );
  assert.equal(service.labels["traefik.enable"], "false");
  assert.ok(service.healthcheck);
  assert.ok(service.networks.includes("dev-proxy"));
}
// Health checks and the Yappio management URL point at the real API container and port.
const apiHealth = `http://assma-api:${API_PORT}/yappio/health`;
assert.equal(
  manifest.services.find((entry: { name: string }) => entry.name === "api").healthUrl,
  apiHealth,
);
assert.ok(
  manifest.healthChecks.some(
    (check: { type: string; url?: string }) => check.type === "http" && check.url === apiHealth,
  ),
);
for (const name of ["web", "admin"]) {
  assert.ok(
    manifest.healthChecks.some(
      (check: { type: string; containerName?: string }) =>
        check.type === "container" && check.containerName === `assma-${name}`,
    ),
  );
}
assert.ok(
  compose.services.api.healthcheck.test.join(" ").includes(`127.0.0.1:${API_PORT}/yappio/health`),
);
assert.equal(compose.services.api.environment.PORT, API_PORT);
assert.equal(manifest.yappio.managementUrl, `http://assma-api:${API_PORT}`);
assert.equal(manifest.yappio.serverUrl, `https://${domains.api}`);
assert.equal(manifest.database.type, "mongodb");
assert.equal(manifest.database.name, "assma");
assert.equal(manifest.database.connectionRef, "shared-mongo");
assert.equal(compose.services.api.environment.DBNAME, "assma");
assert.ok(compose.services.api.environment.DB_URI.includes("DB_URI_DOCKER"));
// The CV import reaches the shared Ollama container over dev-proxy, never the host port.
assert.ok(compose.services.api.environment.OLLAMA_URL.includes("OLLAMA_URL_DOCKER"));
assert.ok(compose.services.api.environment.OLLAMA_URL.includes("http://ollama:11434"));
const example = await readFile(".env.example", "utf8");
assert.match(example, /^DB_URI_DOCKER=mongodb:\/\/[^@]+@shared-mongo:27017\/assma\?/m);
// The API must accept both browser apps, and each image must build its own site.
assert.ok(compose.services.api.environment.ALLOWED_ORIGINS.includes("ASSMA_ADMIN_URL"));
assert.equal(compose.services.web.build.target, "runtime");
assert.equal(compose.services.admin.build.target, "admin");
console.log(
  "Compose, routers, ports, health checks, manifest and shared Mongo references: passed.",
);

let hasEnvironment = true;
try {
  await access(path.resolve(root, manifest.composeEnvFile));
} catch {
  hasEnvironment = false;
  console.log("No .env yet: run `npm run setup:environment` before starting assma in Yoster.");
}
if (hasEnvironment) {
  execFileSync(
    "docker",
    ["compose", "--env-file", ".env", "-f", "docker/docker-compose.yml", "config", "--quiet"],
    { stdio: "pipe" },
  );
  console.log("docker compose config with the real .env: passed.");
}

type Discovered = {
  id: string;
  rootPath: string;
  services: { name: string; containerName: string; port?: number; healthUrl?: string }[];
  database?: { type: string; name: string; connectionRef?: string };
  yappio?: { managementUrl?: string };
};
const discoveryPath =
  process.env.YOSTER_DISCOVERY_MODULE ||
  path.resolve(root, "../yappai-host/server/src/services/HostingManifestDiscoveryService.ts");
const { HostingManifestDiscoveryService } = await import(pathToFileURL(discoveryPath).href);

function assertResolved(project: Discovered) {
  assert.equal(project.id, "assma");
  assert.deepEqual(
    project.services.map((service) => [service.name, service.containerName, service.port]),
    [
      ["web", "assma-web", 80],
      ["admin", "assma-admin", 80],
      ["api", "assma-api", Number(API_PORT)],
    ],
  );
  assert.equal(project.database?.name, "assma");
  assert.equal(project.database?.connectionRef, "shared-mongo");
  assert.equal(project.yappio?.managementUrl, `http://assma-api:${API_PORT}`);
}

const fixtureRoot = await mkdtemp(path.join(tmpdir(), "assma-yoster-"));
try {
  const fixtureProject = path.join(fixtureRoot, "assma");
  await mkdir(path.join(fixtureProject, "docker"), { recursive: true });
  await cp("yappai.host.yaml", path.join(fixtureProject, "yappai.host.yaml"));
  await cp("docker/docker-compose.yml", path.join(fixtureProject, "docker/docker-compose.yml"));
  await cp(".env.example", path.join(fixtureProject, ".env"));
  execFileSync(
    "docker",
    ["compose", "--env-file", ".env", "-f", "docker/docker-compose.yml", "config", "--quiet"],
    { cwd: fixtureProject, stdio: "pipe" },
  );
  console.log("docker compose config with .env.example (isolated fixture): passed.");
  const discovery = new HostingManifestDiscoveryService(fixtureRoot);
  const projects: Discovered[] = await discovery.discover();
  assert.deepEqual(discovery.getWarnings(), [], "Yoster must not warn about the manifest");
  assert.equal(projects.length, 1, "Yoster must discover exactly one project");
  assertResolved(projects[0]!);
  console.log(
    "Yoster's HostingManifestDiscoveryService (isolated fixture): exactly one assma entry, services web, admin and api resolved.",
  );
} finally {
  await rm(fixtureRoot, { recursive: true, force: true });
}

const hostingRoot = process.env.YAPPAI_HOST_ROOT || path.dirname(root);
if (!hasEnvironment) {
  console.log(
    `Live registration under ${hostingRoot}: pending. Yoster needs the composeEnvFile, so run \`npm run setup:environment\` first.`,
  );
  process.exit(0);
}
const discovery = new HostingManifestDiscoveryService(hostingRoot);
const hosted: Discovered[] = await discovery.discover();
const matches = hosted.filter((project) => project.id === "assma");
assert.equal(matches.length, 1, `assma must be discoverable exactly once under ${hostingRoot}`);
assert.equal(matches[0]!.rootPath, root);
assertResolved(matches[0]!);
assert.ok(
  !discovery.getWarnings().some((warning: { path: string }) => warning.path.startsWith(root)),
  "Yoster must not warn about assma's manifest",
);
console.log(`assma is discoverable from the hosting root ${hostingRoot} with all three services.`);

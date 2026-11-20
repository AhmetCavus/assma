# assma

A local assistant for freelance project acquisition. The design and concept are in
[`docs/`](docs/README.md) ([concept](docs/assma-Concept.md), [brand](docs/brand),
[screens](docs/screens)).

**Iteration 1** brings the application up on the existing Yappio infrastructure. It
contains the landing page, sign-in and a minimal Dashboard, plus a role-protected admin
shell. assma is registered with Yoster. CVs, acquisition workflows, statistics and the
assistant follow in later iterations.

## Structure

The npm workspaces follow [ellma](https://github.com/AhmetCavus/ellma):

- `shared/`: contracts (zod), EN/DE copy and the `AssmaApi` client over `yappio-client`.
- `server/`: Yappio 1.3.1 bootstrap. `platform/` holds the CORS and platform boundary,
  the session and role gate (`requireAccount`), attempt limits and `yappio.ts` (the only
  file that reaches into Yappio's unexported services). `account/` serves sign-in and the
  signed-in account under `/api/assma/account`. `admin/` serves `/api/assma/admin`, for
  admin and root only.
- `web/`: React landing page (grape logo, light and dark theme, language, GitHub link),
  sign-in and sign-up, and the workspace with Dashboard as the first navigation item.
- `admin/`: separate React admin shell. It accepts only admin and root accounts, and
  the API checks the role again on every request.
- `docker/`: Compose stack, Dockerfiles, nginx, the Traefik file route, environment
  setup and infrastructure verification.

## Install

Requires Node.js 22 or later, Docker, and access to the internal Verdaccio registry
(`http://192.168.178.131:4873/`, set in `.npmrc`). The registry serves `yappio@1.3.1`
and `yappio-client@1.0.1` and proxies the public registry.

```bash
npm install
```

## Configure

```bash
npm run setup:environment
```

The setup:

- reads the shared-mongo administrator from `../infra/mongo/.env.mongo`;
- creates the database user `assma_…` with `readWrite` on the logical database
  `assma` (or verifies the existing one);
- writes `.env` with mode 0600;
- copies `docker/traefik.yml` to `../infra/traefik/dynamic/assma.yml`.

Running it again keeps the existing database credentials, `JWT_SECRET` and initial admin
password. `.env` is ignored by Git. `.env.example` lists every setting with placeholders.

The initial administrator signs in with the address **`admin`**, not
`INITIAL_ADMIN_USER`, and with `INITIAL_ADMIN_PASS` from `.env`. Yappio stores that
account with email `admin` and puts `INITIAL_ADMIN_USER` into its name.

## Run

The containers `assma-web`, `assma-admin` and `assma-api` (port 4100) join the existing
`dev-proxy` network and use `shared-mongo`. The shared Traefik routes them through its
file provider:

| Host                    | Container        |
| ----------------------- | ---------------- |
| `assma.yappai.de`       | `assma-web:80`   |
| `assma-admin.yappai.de` | `assma-admin:80` |
| `assma-api.yappai.de`   | `assma-api:4100` |

Start, stop and restart the stack from Yoster, or run it directly:

```bash
docker compose --env-file .env -f docker/docker-compose.yml up -d --build
```

For local development, run the API on 4100, the web app on 5182 and the admin shell on 5183. ellma uses 4000, 5180 and 5181, so both run side by side:

```bash
npm run dev
```

## Verify

```bash
npm run check                  # types for all workspaces and tests
npm test                       # unit tests (shared and server)
npm run build                  # production builds
npm run verify:infrastructure  # Compose, routing, manifest and Yoster discovery
```

`verify:infrastructure` checks that Compose, `docker/traefik.yml` and
`yappai.host.yaml` agree on:

- the container names, ports and health checks;
- the Yappio management URL;
- the `shared-mongo` database reference.

It then validates Compose with `.env.example` in a temporary hosting root and runs
Yoster's real `HostingManifestDiscoveryService` there. That must yield exactly one
`assma` entry with the services `web`, `admin` and `api`. When `.env` exists, it also
discovers assma from the real hosting root (`YAPPAI_HOST_ROOT`, default `..`). Yoster
needs `.env` as the manifest's `composeEnvFile`. Without it, assma is not listed.

Smoke check on the running stack, through the shared Traefik:

```bash
curl -H 'Host: assma-api.yappai.de' http://127.0.0.1/yappio/health
```

## Yoster registration

`yappai.host.yaml` registers id and slug `assma`:

- **Compose:** `docker/docker-compose.yml` with `.env`.
- **Services:** `web`, `admin` and `api`, with their health checks.
- **Yappio:** management URL `http://assma-api:4100`.
- **Database:** `mongodb` / `assma` on `shared-mongo`.

Yoster scans its hosting root (`/srv/yappai/hosting`) and lists assma once `.env` exists.

Public access also needs the Cloudflare tunnel to send `assma.yappai.de`,
`assma-admin.yappai.de` and `assma-api.yappai.de` to the shared Traefik, as for ellma.

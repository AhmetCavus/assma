# assma

A local assistant for freelance project acquisition. The design and concept are in
[`docs/`](docs/README.md) ([concept](docs/assma-Concept.md), [brand](docs/brand),
[screens](docs/screens)).

**Iteration 1** brings the application up on the existing Yappio infrastructure. It
contains the landing page, sign-in and a minimal Dashboard, plus a role-protected admin
shell. assma is registered with Yoster.

**Iteration 2** adds the **Experience** page: personal details (name, role, location,
email, summary) and project references (client, role, period, own contribution,
technologies). They are stored per account in Yappio and later feed the fit assessment and
the tailored CV.

**Iteration 3** adds the **CV import** (`/experience/import`). The browser extracts the text
of a PDF, Word (.docx) or text file (pdf.js and mammoth, loaded on demand), so the file never
leaves the device; pasted text works too. The API queues the text as a background job and
the shared Ollama container (`OLLAMA_MODEL`, default `qwen3.5:4b`, CPU) reads it into
suggestions with a JSON schema. The page polls the job, shows progress and then the source
next to the suggestions. Incomplete entries are flagged for editing, entries matching an
existing reference start unchecked, and personal details only fill empty fields. Nothing is
saved until the person applies the selection.

CVs of up to 100,000 characters are read in parts of about 12,000 characters (split at
paragraph breaks, with a small overlap) and the parts' suggestions are merged, so the prompt
always fits the model context. The page shows the part being read and an estimated duration.
On the shared CPU, reading runs at about 55 tokens/s and writing takes 10–12 seconds per
position: a short CV needs 1–2 minutes, 30,000 characters about 5–10 minutes. Jobs run one at
a time in memory, may take up to 15 minutes per part, are abandoned after 10 minutes without
a poll (browsers slow background tabs to about one request per minute) and expire 30 minutes
after they finish.

**Iteration 4** adds the **project register** (`/projects`): Active and Archive tabs, search
over title, end client and agency, status filters (captured, applied, in review, interview,
closed), a row menu for status, archive and delete, and the newest active projects in the
sidebar. A project is captured (`/projects/new`) from a link or listing text, where the local
model suggests title, end client, agency, contact, tech stack, required and preferred
experience and the working terms (about 30 seconds for a typical listing), or entered
manually. Suggestions only fill empty fields, and the original link and listing text are
kept as the source. Listing suggestions share the model queue with the CV import, so the CPU
runs one model task at a time.

"Load from link" fetches public pages only (`platform/safeFetch.ts`): http and https on
default ports, at most three redirects, 2 MB and 10 seconds, and every connection (each
redirect included) refuses private, loopback, link-local, shared, documentation and
multicast addresses in the socket's own DNS lookup, so a link cannot reach MongoDB, Ollama or
other containers. A schema.org JobPosting on the page is preferred over the page text. Pages
that need a login or JavaScript report that the text should be pasted instead.

**Iteration 5** adds the **experience fit** (`/projects/<id>`) and the **tailored CV**
(`/projects/<id>/cv`). The local model proposes, per required and preferred item, whether a
reference confirms it, partly supports it or nothing does, with the supporting references
(E01, …) and a one-sentence reason (about 30–60 seconds). The score itself is computed by
fixed rules, as in the concept: required items weigh 2 points, preferred 1; confirmed earns
the full weight, partial half, missing nothing; the result is scaled to 1–10 and a project
without requirements stays unscored. Claims without a known reference count as missing. Each
finding can be corrected by hand and the score is recomputed. The assessment stores a
fingerprint of the requirements and references, so the page marks it as out of date after
either changes. "Save and check fit" on the capture page opens the fit and starts the
assessment. The register shows the score.

The tailored CV starts from the profile summary and the references that support the fit,
ordered by weight. The person edits the short profile, selects and orders references and
saves the draft on the project. The preview, Markdown and PDF (pdf-lib, standard Helvetica,
generated in the browser) render the same document; letters Helvetica lacks lose their
accent (ş → s) or get a look-alike instead of breaking the export.

Applications (email and portal), statistics and the assistant follow in later iterations.

## Structure

The npm workspaces follow [ellma](https://github.com/AhmetCavus/ellma):

- `shared/`: contracts (zod), EN/DE copy and the `AssmaApi` client over `yappio-client`.
- `server/`: Yappio 1.3.1 bootstrap. `platform/` holds the CORS and platform boundary,
  the session and role gate (`requireAccount`), attempt limits and `yappio.ts` (the only
  file that reaches into Yappio's unexported services). `account/` serves sign-in and the
  signed-in account under `/api/assma/account`. `experience/` serves the signed-in
  person's profile and references under `/api/assma/experience`, and the CV import jobs
  under `/api/assma/experience/import`; every query is scoped to the account.
  `projects/` serves the project register, listing capture, fit assessment and CV draft
  under `/api/assma/projects`.
  `platform/ollama.ts` is the model client, `platform/modelJobs.ts` the shared model queue
  and `platform/safeFetch.ts` the guarded fetch for listing links. `admin/` serves `/api/assma/admin`, for admin and root only. The boundary
  seals the account-security and experience collections from Yappio's generic collection
  API, so not even admins read that content there.
- `web/`: React landing page (grape logo, light and dark theme, language, GitHub link),
  sign-in and sign-up, and the workspace with Dashboard as the first navigation item,
  followed by Experience.
- `admin/`: separate React admin shell. It accepts only admin and root accounts, and
  the API checks the role again on every request.
- `docker/`: Compose stack, Dockerfiles, nginx, the Traefik file route, environment
  setup and infrastructure verification.

## Install

Requires Node.js 22 or later, Docker, the shared `ollama` container on `dev-proxy` with
`qwen3.5:4b` installed (for the CV import), and access to the internal Verdaccio registry
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

The Cloudflare tunnel sends `assma.yappai.de`, `assma-admin.yappai.de` and
`assma-api.yappai.de` to the shared Traefik, as for ellma.

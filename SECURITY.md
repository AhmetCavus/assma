# Security

assma holds personal data: CVs, project histories, photos and applications. Please report
security problems privately, not as a public issue.

## Reporting a vulnerability

Use **[Report a vulnerability](https://github.com/AhmetCavus/assma/security/advisories/new)**
on the repository's Security tab. The report stays private until a fix is released.

Please include:

- what an attacker can do, and what they need for it (an account, a crafted listing, a link…);
- the steps to reproduce it, ideally against a local installation;
- the version or commit you tested.

You will get an answer within a week. Once the problem is fixed, the advisory is published,
and you are credited if you want to be.

## Scope

In scope is this repository: the API (`server/`), the web app (`web/`), the admin panel
(`admin/`), the shared contracts (`shared/`) and the Docker and Traefik configuration
(`docker/`). Typical examples:

- one account reading or changing another account's data;
- bypassing the sign-in, the role check or the attempt limits;
- reaching internal services through "Load from link" (server-side request forgery);
- script injection through listings, CV imports or model answers;
- model answers that make assma act outside the person's own suggestions (prompt injection
  with an effect beyond a wrong suggestion that the person still has to confirm).

Not in scope:

- the hosted instance's infrastructure beyond this code (please do not scan or load-test
  `*.yappai.de`);
- findings that need full control of the victim's device or browser;
- a self-hosted copy that was modified or configured against the documentation;
- missing hardening without a concrete way to exploit it, such as a header that is not set.

Please test only with accounts and data of your own.

## Supported versions

assma is in alpha. Only the latest commit on `master` receives fixes.

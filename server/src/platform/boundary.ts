import type { Express, RequestHandler } from "express";
import type { YappioServer } from "yappio";
import { requireAccount } from "./access.js";
import { clientAddress, RateLimiter } from "./rateLimit.js";

// Yappio's generic management API would expose every user's records; only admins may use it.
const PLATFORM_MANAGEMENT =
  /^\/(collection|collections|profile|token|channel|media|appsettings)(\/|$)/;
// Signing in calls this for any role, so it stays public; Yappio verifies the token itself.
const SESSION_INITIALIZATION = "/profile/initialize";
// Yappio's own recovery, mail-code and authenticator routes skip assma's checks (reset links
// to the wrong host, codes without attempt limits, passwordless sign-in). As in ellma they stay
// closed; assma signs in under /api/assma/account.
const CLOSED_PLATFORM_ROUTES = /^\/(password|otp|totp|email)(\/|$)|^\/authenticate\/totp\/?$/;
// Account security records hold secrets and experience records hold a person's CV data; not even
// admins read them through the generic API (the admin panel shows totals only, never content).
const SEALED_COLLECTIONS =
  /^\/collection\/(assmaaccountsecurity|assmaexperienceprofile|assmaexperiencereference|assmaproject|assmaprofileimage|assmaapplication|assmaapplicationfile)(\/|$)/i;
const PLATFORM_LOGIN = /^\/authenticate\/?$/;
const ASSMA_API = "/api/assma/";
const platformLogins = new RateLimiter(40, 15 * 60 * 1000);

export function installBoundaryFirst(server: YappioServer, allowedOrigins: string[]): void {
  const boundary: RequestHandler = (request, response, next) => {
    response.removeHeader("Access-Control-Allow-Origin");
    response.setHeader("Cache-Control", "no-store");
    response.vary("Origin");
    const origin = request.headers.origin;
    if (origin && !allowedOrigins.includes(origin)) {
      response.status(403).json({ success: false, error: "origin_denied" });
      return;
    }
    if (origin) {
      response.setHeader("Access-Control-Allow-Origin", origin);
    }
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (request.method === "OPTIONS") {
      response.sendStatus(204);
      return;
    }
    // Yappio's middleware runs later. Restore our exact-origin policy before headers are sent.
    const originalWriteHead = response.writeHead;
    response.writeHead = function (...args: Parameters<typeof originalWriteHead>) {
      response.removeHeader("Access-Control-Allow-Origin");
      if (origin) {
        response.setHeader("Access-Control-Allow-Origin", origin);
      }
      return originalWriteHead.apply(response, args);
    } as typeof originalWriteHead;

    if (CLOSED_PLATFORM_ROUTES.test(request.path) || SEALED_COLLECTIONS.test(request.path)) {
      response.status(404).json({ success: false, error: "not_found" });
      return;
    }
    if (
      request.method === "POST" &&
      PLATFORM_LOGIN.test(request.path) &&
      !platformLogins.allow(clientAddress(request))
    ) {
      response.status(429).json({ success: false, error: "too_many_attempts" });
      return;
    }
    if (request.path === SESSION_INITIALIZATION && request.method === "POST") {
      next();
      return;
    }
    if (PLATFORM_MANAGEMENT.test(request.path)) {
      requireAccount(true)(request, response, next);
      return;
    }
    next();
  };
  const app = server as Express;
  app.use(boundary);
  // Yappio installs wildcard CORS and its body parsers in its constructor, so move the boundary
  // to the front. Express 5 keeps no internal layers in the router stack (Express 4 had
  // `query` and `expressInit` at 0 and 1), so the front is index 0.
  const stack = app.router.stack as unknown[];
  stack.unshift(...stack.splice(-1));
  deferBodiesUnderAssma(stack);
}

type Layer = { name?: string; handle: RequestHandler };

/**
 * Yappio parses every JSON body first, with body-parser's default limit of 100 kB. assma's
 * routes parse their own bodies after the session check, with limits per route (a CV's text,
 * an application's PDF), so Yappio's parser steps aside for them.
 */
export function deferBodiesUnderAssma(stack: unknown[]): void {
  for (const layer of stack as Layer[]) {
    if (layer.name === "jsonParser" || layer.name === "urlencodedParser") {
      const parse = layer.handle;
      layer.handle = (request, response, next) =>
        request.path.startsWith(ASSMA_API) ? next() : parse(request, response, next);
    }
  }
}

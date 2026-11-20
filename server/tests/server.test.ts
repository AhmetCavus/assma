import assert from "node:assert/strict";
import { test } from "node:test";
import { allowedOrigins, configurationProblems } from "../src/config.ts";
import { RateLimiter } from "../src/platform/rateLimit.ts";
import { issuedBeforeCutoff, roleAllowed, sessionClaimsSchema } from "../src/platform/session.ts";

const valid = {
  DB_URI: "mongodb://user:secret@shared-mongo:27017/assma?authSource=assma",
  JWT_SECRET: "x".repeat(32),
  INITIAL_ADMIN_USER: "admin@example.test",
  INITIAL_ADMIN_PASS: "unit-test-password!#",
  NODE_ENV: "production",
};

test("a complete production configuration on the assma database is accepted", () => {
  assert.deepEqual(configurationProblems(valid), []);
});

test("missing or weak settings are named without their values", () => {
  const problems = configurationProblems({ JWT_SECRET: "short-secret-value" });
  assert.ok(problems.some((problem) => problem.startsWith("DB_URI")));
  assert.ok(problems.some((problem) => problem.startsWith("JWT_SECRET")));
  assert.ok(problems.some((problem) => problem.startsWith("INITIAL_ADMIN")));
  assert.ok(problems.every((problem) => !problem.includes("short-secret-value")));
});

test("production refuses any database other than assma", () => {
  const problems = configurationProblems({
    ...valid,
    DB_URI: "mongodb://user:secret@shared-mongo:27017/ellma?authSource=ellma",
  });
  assert.deepEqual(problems, ["Production must use the assma logical database on shared-mongo"]);
  assert.deepEqual(
    configurationProblems({
      ...valid,
      NODE_ENV: "development",
      DB_URI: valid.DB_URI.replace("/assma?", "/assma_dev?"),
    }),
    [],
  );
});

test("allowed origins are trimmed and lose trailing slashes", () => {
  assert.deepEqual(allowedOrigins(" https://assma.yappai.de/ , http://localhost:5182,"), [
    "https://assma.yappai.de",
    "http://localhost:5182",
  ]);
  assert.deepEqual(allowedOrigins(undefined), ["https://assma.yappai.de"]);
});

test("only full login tokens are session tokens", () => {
  const claims = { apiMode: true, _id: "a".repeat(24), role: "user", iat: 1_700_000_000 };
  assert.equal(sessionClaimsSchema.safeParse(claims).success, true);
  assert.equal(sessionClaimsSchema.safeParse({ ...claims, otp: "123456" }).success, false);
  assert.equal(sessionClaimsSchema.safeParse({ ...claims, uid: "device" }).success, false);
  assert.equal(sessionClaimsSchema.safeParse({ ...claims, apiMode: false }).success, false);
  assert.equal(sessionClaimsSchema.safeParse({ ...claims, role: "owner" }).success, false);
});

test("tokens issued before the session cutoff are refused", () => {
  const claims = sessionClaimsSchema.parse({
    apiMode: true,
    _id: "a".repeat(24),
    role: "user",
    iat: 1_700_000_000,
  });
  assert.equal(issuedBeforeCutoff(claims, null), false);
  assert.equal(issuedBeforeCutoff(claims, new Date(1_700_000_001_000)), true);
  assert.equal(issuedBeforeCutoff(claims, new Date(1_700_000_000_000)), false);
});

test("the admin area admits admin and root only", () => {
  assert.equal(roleAllowed("user", false), true);
  assert.equal(roleAllowed("user", true), false);
  assert.equal(roleAllowed("admin", true), true);
  assert.equal(roleAllowed("root", true), true);
});

test("the attempt limiter blocks after the limit and resets after the window", () => {
  const limiter = new RateLimiter(2, 1000);
  assert.equal(limiter.allow("k", 0), true);
  assert.equal(limiter.allow("k", 1), true);
  assert.equal(limiter.allow("k", 2), false);
  assert.equal(limiter.allow("k", 1001), true);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AssmaApiError,
  isAdministrator,
  LOCALES,
  loginRequestSchema,
  passwordProblems,
  preferredLocale,
  toApiError,
} from "../src/index.ts";

function keyPaths(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object") {
    return [prefix];
  }
  return Object.entries(value).flatMap(([key, child]) =>
    keyPaths(child, prefix ? `${prefix}.${key}` : key),
  );
}

test("English and German copy have the same keys", () => {
  assert.deepEqual(keyPaths(LOCALES.de).sort(), keyPaths(LOCALES.en).sort());
});

test("the preferred locale follows the browser and falls back to English", () => {
  assert.equal(preferredLocale(["de-DE", "en"]), "de");
  assert.equal(preferredLocale(["fr-FR"]), "en");
});

test("only admin and root count as administrators", () => {
  assert.equal(isAdministrator("admin"), true);
  assert.equal(isAdministrator("root"), true);
  assert.equal(isAdministrator("user"), false);
  assert.equal(isAdministrator(undefined), false);
});

test("password rules match ellma's", () => {
  assert.deepEqual(passwordProblems("short!#"), ["length"]);
  assert.deepEqual(passwordProblems("longenough1"), ["special"]);
  assert.deepEqual(passwordProblems("long-enough!"), []);
});

test("login input is trimmed and bounded", () => {
  assert.equal(loginRequestSchema.parse({ email: " a@b.de ", password: "x" }).email, "a@b.de");
  assert.equal(
    loginRequestSchema.safeParse({ email: "a@b.de", password: "x".repeat(73) }).success,
    false,
  );
});

test("API errors keep the HTTP status and server code", () => {
  const error = toApiError({ response: { status: 401, data: { error: "access_denied" } } });
  assert.ok(error instanceof AssmaApiError);
  assert.equal(error.isUnauthorized, true);
  assert.equal(error.code, "access_denied");
  assert.equal(toApiError(new Error("offline")).isNetwork, true);
});

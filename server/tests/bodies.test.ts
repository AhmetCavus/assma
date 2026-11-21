import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import express, { type Express } from "express";
import { deferBodiesUnderAssma } from "../src/platform/boundary.ts";

test("Yappio's 100 kB body parser steps aside for assma's routes, which set their own limits", async () => {
  // As in Yappio: a global JSON parser with the default limit, installed first.
  const app: Express = express();
  app.use(express.json());
  app.post("/collection/x", (request, response) => {
    response.json({ size: JSON.stringify(request.body).length });
  });
  app.post(
    "/api/assma/experience/import",
    express.json({ limit: "512kb" }),
    (request, response) => {
      response.json({ size: JSON.stringify(request.body).length });
    },
  );
  deferBodiesUnderAssma(app._router.stack as unknown[]);

  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  const post = (path: string, size: number) =>
    fetch(`http://127.0.0.1:${port}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "x".repeat(size) }),
    }).then((response) => response.status);
  try {
    assert.equal(await post("/api/assma/experience/import", 300_000), 200);
    assert.equal(await post("/api/assma/experience/import", 600_000), 413);
    assert.equal(await post("/collection/x", 300_000), 413);
    assert.equal(await post("/collection/x", 1000), 200);
  } finally {
    server.close();
  }
});

import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, test } from "node:test";
import { CV_IMPORT_LIMITS } from "@assma/shared";
import { readCv } from "../src/experience/cvImport.reader.ts";

/** A stand-in for Ollama's streaming /api/chat that answers per part. */
let server: Server;
const requests: { system: string; user: string; numCtx: number }[] = [];

before(async () => {
  server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => {
      const parsed = JSON.parse(body) as {
        messages: { content: string }[];
        options: { num_ctx: number };
      };
      requests.push({
        system: parsed.messages[0]!.content,
        user: parsed.messages[1]!.content,
        numCtx: parsed.options.num_ctx,
      });
      const part = requests.length;
      const answer = JSON.stringify({
        profile: {
          name: part === 1 ? "Mara Linden" : "",
          headline: "",
          location: part === 2 ? "Köln" : "",
          email: "",
          summary: "",
        },
        references: [
          // Every part sees the same position at the boundary (overlap), with more detail later.
          {
            organization: "Kite Transit AG",
            role: "Android Engineer",
            start: "2021-03",
            end: "2022-12",
            contribution: part === 1 ? "Short." : "TalkBack semantics and screen reader tests.",
            skills: part === 1 ? ["Kotlin"] : ["TalkBack"],
          },
          {
            organization: `Client ${part}`,
            role: "Developer",
            start: `201${part}`,
            end: `201${part}`,
            contribution: "Work.",
            skills: [],
          },
        ],
      });
      response.writeHead(200, { "Content-Type": "application/x-ndjson" });
      // Stream the JSON in two pieces, as Ollama does token by token.
      const middle = Math.floor(answer.length / 2);
      response.write(JSON.stringify({ message: { content: answer.slice(0, middle) } }) + "\n");
      response.end(
        JSON.stringify({ message: { content: answer.slice(middle) }, done: true }) + "\n",
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  process.env.OLLAMA_URL = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
});

after(() => server.close());

test("a long CV is read in parts within the context and merged", async () => {
  const paragraph = "Position\nDid things with Kotlin and Compose for a client.\n\n";
  const text = paragraph.repeat(Math.ceil(30_000 / paragraph.length));
  const updates: { found: number; part: number; parts: number }[] = [];
  const suggestions = await readCv(text, new AbortController().signal, (update) =>
    updates.push(update),
  );
  assert.equal(requests.length, 3);
  assert.ok(requests.every((request) => request.user.length <= CV_IMPORT_LIMITS.partChars + 20));
  assert.ok(requests.every((request) => request.numCtx * 3 >= request.user.length));
  assert.match(requests[1]!.system, /part 2 of 3/);
  assert.deepEqual(
    [...new Set(updates.map((update) => `${update.part}/${update.parts}`))],
    ["1/3", "2/3", "3/3"],
  );
  assert.equal(suggestions.profile.name, "Mara Linden");
  assert.equal(suggestions.profile.location, "Köln");
  const kite = suggestions.references.filter(
    (reference) => reference.organization === "Kite Transit AG",
  );
  assert.equal(kite.length, 1);
  assert.equal(kite[0]!.contribution, "TalkBack semantics and screen reader tests.");
  assert.deepEqual(kite[0]!.skills, ["Kotlin", "TalkBack"]);
  assert.equal(suggestions.references.length, 4);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import type { CvSuggestions } from "@assma/shared";
import { CvImportJobs, type CvReader } from "../src/experience/cvImport.jobs.ts";
import { contextFor } from "../src/experience/cvImport.prompt.ts";

const result: CvSuggestions = {
  profile: { name: "Mara", headline: "", location: "", email: "", summary: "" },
  references: [],
};

/** A reader the test finishes by hand. */
function controlledReader() {
  const calls: { text: string; signal: AbortSignal; finish: () => void; fail: () => void }[] = [];
  const read: CvReader = (text, signal, found) =>
    new Promise((resolve, reject) => {
      found({ found: 1, part: 1, parts: 1 });
      signal.addEventListener("abort", () => reject(new Error("aborted")));
      calls.push({
        text,
        signal,
        finish: () => resolve(result),
        fail: () => reject(new Error("unreadable")),
      });
    });
  return { read, calls };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

test("jobs run one at a time and report their queue position", async () => {
  const { read, calls } = controlledReader();
  const jobs = new CvImportJobs(read);
  const first = jobs.start("a", "cv a");
  const second = jobs.start("b", "cv b");
  assert.equal(calls.length, 1);
  assert.equal(jobs.get("a", first.id).state, "reading");
  assert.equal(jobs.get("a", first.id).found, 1);
  assert.equal(jobs.get("b", second.id).state, "queued");
  assert.equal(jobs.get("b", second.id).position, 1);
  calls[0]!.finish();
  await settle();
  const done = jobs.get("a", first.id);
  assert.equal(done.state, "done");
  assert.deepEqual(done.suggestions, result);
  assert.equal(calls.length, 2);
  assert.equal(calls[1]!.text, "cv b");
});

test("a job belongs to the person who started it", () => {
  const { read } = controlledReader();
  const jobs = new CvImportJobs(read);
  const job = jobs.start("a", "cv");
  assert.throws(() => jobs.get("b", job.id), /not_found/);
  assert.throws(() => jobs.cancel("b", job.id), /not_found/);
  assert.equal(jobs.get("a", job.id).state, "reading");
});

test("starting again or cancelling aborts the running read", async () => {
  const { read, calls } = controlledReader();
  const jobs = new CvImportJobs(read);
  const first = jobs.start("a", "first");
  const second = jobs.start("a", "second");
  assert.equal(calls[0]!.signal.aborted, true);
  assert.throws(() => jobs.get("a", first.id), /not_found/);
  await settle();
  assert.equal(calls.length, 2);
  jobs.cancel("a", second.id);
  assert.equal(calls[1]!.signal.aborted, true);
  assert.throws(() => jobs.get("a", second.id), /not_found/);
});

test("unpolled jobs are abandoned and finished results expire", async () => {
  let now = 0;
  const { read, calls } = controlledReader();
  const jobs = new CvImportJobs(
    read,
    { timeoutMs: 60_000, abandonAfterMs: 1000, keepResultMs: 5000 },
    () => now,
  );
  const abandoned = jobs.start("a", "cv");
  now = 1500;
  jobs.sweep();
  assert.equal(calls[0]!.signal.aborted, true);
  assert.throws(() => jobs.get("a", abandoned.id), /not_found/);
  await settle();
  const kept = jobs.start("b", "cv");
  await settle();
  calls.at(-1)!.finish();
  await settle();
  now = 6000;
  assert.equal(jobs.get("b", kept.id).state, "done");
  now = 12_000;
  assert.throws(() => jobs.get("b", kept.id), /not_found/);
});

test("a failed read reports a code, not the error", async () => {
  const { read, calls } = controlledReader();
  const jobs = new CvImportJobs(read);
  const job = jobs.start("a", "cv");
  calls[0]!.fail();
  await settle();
  const failed = jobs.get("a", job.id);
  assert.equal(failed.state, "failed");
  assert.equal(failed.error, "unreadable");
});

test("the model context always fits one part, so Ollama never cuts the prompt", () => {
  assert.equal(contextFor("x".repeat(100)), 6144);
  const part = "x".repeat(12_000);
  assert.ok(contextFor(part) >= 12_000 / 3 + 4500);
});

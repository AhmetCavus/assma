import assert from "node:assert/strict";
import { test } from "node:test";
import { ModelJobs, type ModelTask } from "../src/platform/modelJobs.ts";
import { contextFor } from "../src/platform/inference/ollama.ts";

/** Tasks the test finishes by hand. */
function controlled() {
  const calls: { label: string; signal: AbortSignal; finish: () => void; fail: () => void }[] = [];
  const task =
    (label: string): ModelTask<string> =>
    (signal, progress) =>
      new Promise((resolve, reject) => {
        progress({ found: 1, part: 1, parts: 2 });
        signal.addEventListener("abort", () => reject(new Error("aborted")));
        calls.push({
          label,
          signal,
          finish: () => resolve(`result ${label}`),
          fail: () => reject(new Error("unreadable")),
        });
      });
  return { task, calls };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

test("jobs run one at a time and report their queue position", async () => {
  const { task, calls } = controlled();
  const jobs = new ModelJobs();
  const first = jobs.start("a", "cv", task("a"));
  const second = jobs.start("b", "listing", task("b"));
  assert.equal(calls.length, 1);
  const running = jobs.get("a", "cv", first.id);
  assert.equal(running.state, "reading");
  assert.deepEqual(running.progress, { found: 1, part: 1, parts: 2 });
  assert.equal(jobs.get("b", "listing", second.id).state, "queued");
  assert.equal(jobs.get("b", "listing", second.id).position, 1);
  calls[0]!.finish();
  await settle();
  const done = jobs.get<string>("a", "cv", first.id);
  assert.equal(done.state, "done");
  assert.equal(done.result, "result a");
  assert.equal(calls.length, 2);
  assert.equal(calls[1]!.label, "b");
});

test("a job belongs to the person and kind it was started for", () => {
  const { task } = controlled();
  const jobs = new ModelJobs();
  const job = jobs.start("a", "cv", task("a"));
  assert.throws(() => jobs.get("b", "cv", job.id), /not_found/);
  assert.throws(() => jobs.get("a", "listing", job.id), /not_found/);
  assert.throws(() => jobs.cancel("b", "cv", job.id), /not_found/);
  assert.equal(jobs.get("a", "cv", job.id).state, "reading");
});

test("starting the same kind again replaces the earlier job; other kinds stay", async () => {
  const { task, calls } = controlled();
  const jobs = new ModelJobs();
  const cv = jobs.start("a", "cv", task("cv"));
  const listing = jobs.start("a", "listing", task("listing"));
  assert.equal(jobs.get("a", "listing", listing.id).state, "queued");
  const second = jobs.start("a", "listing", task("listing 2"));
  assert.throws(() => jobs.get("a", "listing", listing.id), /not_found/);
  assert.equal(jobs.get("a", "cv", cv.id).state, "reading");
  jobs.cancel("a", "cv", cv.id);
  assert.equal(calls[0]!.signal.aborted, true);
  await settle();
  assert.equal(calls.at(-1)!.label, "listing 2");
  assert.equal(jobs.get("a", "listing", second.id).state, "reading");
});

test("unpolled jobs are abandoned and finished results expire", async () => {
  let now = 0;
  const { task, calls } = controlled();
  const jobs = new ModelJobs(
    { timeoutMs: 60_000, abandonAfterMs: 1000, keepResultMs: 5000 },
    () => now,
  );
  const abandoned = jobs.start("a", "cv", task("a"));
  now = 1500;
  jobs.sweep();
  assert.equal(calls[0]!.signal.aborted, true);
  assert.throws(() => jobs.get("a", "cv", abandoned.id), /not_found/);
  await settle();
  const kept = jobs.start("b", "cv", task("b"));
  await settle();
  calls.at(-1)!.finish();
  await settle();
  now = 6000;
  assert.equal(jobs.get("b", "cv", kept.id).state, "done");
  now = 12_000;
  assert.throws(() => jobs.get("b", "cv", kept.id), /not_found/);
});

test("a failed task reports a code, not the error", async () => {
  const { task, calls } = controlled();
  const jobs = new ModelJobs();
  const job = jobs.start("a", "cv", task("a"));
  calls[0]!.fail();
  await settle();
  const failed = jobs.get("a", "cv", job.id);
  assert.equal(failed.state, "failed");
  assert.equal(failed.error, "unreadable");
});

test("the model context always fits one part, so Ollama never cuts the prompt", () => {
  const ask = (text: string) => [
    { role: "system" as const, content: "instructions ".repeat(400) },
    { role: "user" as const, content: text },
  ];
  // The instructions are covered by the fixed margin, so short requests share one size.
  assert.equal(contextFor(ask("x".repeat(100))), 6144);
  assert.ok(contextFor(ask("x".repeat(12_000))) >= 12_000 / 3 + 4500);
});

import { randomUUID } from "node:crypto";
import { notFound } from "./errors.js";
import { ModelError } from "./inference/provider.js";

export type JobProgress = { found: number; part: number; parts: number };

/** One model task. Reports progress as it goes and stops when `signal` aborts. */
export type ModelTask<T> = (
  signal: AbortSignal,
  progress: (update: JobProgress) => void,
) => Promise<T>;

export type JobState = "queued" | "reading" | "done" | "failed";

export type JobView<T> = {
  id: string;
  state: JobState;
  /** Jobs ahead of this one while queued. */
  position: number;
  progress: JobProgress;
  startedAt: string;
  result: T | null;
  error: string | null;
};

type Job = {
  id: string;
  ownerId: string;
  kind: string;
  state: JobState;
  progress: JobProgress;
  startedAt: Date;
  /** Dropped once it has run, so the text it holds (a CV, a listing) is released. */
  task: ModelTask<unknown> | null;
  result: unknown;
  error: string | null;
  finishedAt: number | null;
  lastSeen: number;
  controller: AbortController;
};

const MINUTE = 60_000;

/**
 * In-memory queue for everything the local model does (CV imports, listing suggestions).
 * The CPU-bound model works on one task at a time; assma runs as one API process, so memory
 * is enough. Browsers slow timers in background tabs to about one per minute, so a job is
 * abandoned only after ten minutes without a poll. Results are forgotten 30 minutes after
 * they finish. Tasks limit their own steps; the job timeout is only a safety net.
 */
export class ModelJobs {
  private readonly jobs = new Map<string, Job>();
  private readonly queue: Job[] = [];
  private running: Job | null = null;

  constructor(
    private readonly limits = {
      timeoutMs: 60 * MINUTE,
      abandonAfterMs: 10 * MINUTE,
      keepResultMs: 30 * MINUTE,
    },
    private readonly now = () => Date.now(),
  ) {}

  /** Queues a task; an earlier unfinished job of the same person and kind is cancelled. */
  start<T>(ownerId: string, kind: string, task: ModelTask<T>): JobView<T> {
    this.sweep();
    for (const job of this.jobs.values()) {
      if (job.ownerId === ownerId && job.kind === kind) {
        this.remove(job, "replaced");
      }
    }
    const job: Job = {
      id: randomUUID(),
      ownerId,
      kind,
      state: "queued",
      progress: { found: 0, part: 0, parts: 1 },
      startedAt: new Date(this.now()),
      task,
      result: null,
      error: null,
      finishedAt: null,
      lastSeen: this.now(),
      controller: new AbortController(),
    };
    this.jobs.set(job.id, job);
    this.queue.push(job);
    this.pump();
    return this.view<T>(job);
  }

  /** Another person's job, or one of another kind, behaves like an unknown one. */
  get<T>(ownerId: string, kind: string, id: string): JobView<T> {
    this.sweep();
    const job = this.owned(ownerId, kind, id);
    job.lastSeen = this.now();
    return this.view<T>(job);
  }

  cancel(ownerId: string, kind: string, id: string): { id: string } {
    this.remove(this.owned(ownerId, kind, id), "cancelled");
    return { id };
  }

  /** Drops abandoned and expired jobs. Also runs on a timer in production. */
  sweep(): void {
    const now = this.now();
    for (const job of [...this.jobs.values()]) {
      const unfinished = job.state === "queued" || job.state === "reading";
      if (unfinished && now - job.lastSeen > this.limits.abandonAfterMs) {
        this.remove(job, "abandoned");
      } else if (job.finishedAt !== null && now - job.finishedAt > this.limits.keepResultMs) {
        this.jobs.delete(job.id);
      }
    }
  }

  private owned(ownerId: string, kind: string, id: string): Job {
    const job = this.jobs.get(id);
    if (!job || job.ownerId !== ownerId || job.kind !== kind) {
      throw notFound();
    }
    return job;
  }

  private remove(job: Job, reason: string): void {
    job.controller.abort(reason);
    job.task = null;
    this.jobs.delete(job.id);
    const index = this.queue.indexOf(job);
    if (index >= 0) {
      this.queue.splice(index, 1);
    }
  }

  private view<T>(job: Job): JobView<T> {
    const index = this.queue.indexOf(job);
    return {
      id: job.id,
      state: job.state,
      position: index < 0 ? 0 : index + (this.running ? 1 : 0),
      progress: { ...job.progress },
      startedAt: job.startedAt.toISOString(),
      result: job.result as T | null,
      error: job.error,
    };
  }

  private pump(): void {
    if (this.running) {
      return;
    }
    const job = this.queue.shift();
    if (!job) {
      return;
    }
    this.running = job;
    void this.run(job).finally(() => {
      this.running = null;
      this.pump();
    });
  }

  private async run(job: Job): Promise<void> {
    job.state = "reading";
    const signal = AbortSignal.any([
      job.controller.signal,
      AbortSignal.timeout(this.limits.timeoutMs),
    ]);
    try {
      job.result = await job.task!(signal, (update) => {
        job.progress = update;
      });
      job.state = "done";
    } catch (error) {
      if (error instanceof ModelError && !job.controller.signal.aborted) {
        // The operator's view: what failed and what to check, never the request's content.
        console.warn(`assma model task ${job.kind.split(":")[0]} failed: ${error.describe()}`);
      }
      job.state = "failed";
      job.error = job.controller.signal.aborted
        ? "cancelled"
        : signal.aborted || (error instanceof Error && error.name === "TimeoutError")
          ? "timeout"
          : error instanceof Error && error.message.startsWith("model_unavailable")
            ? "model_unavailable"
            : "unreadable";
    } finally {
      job.task = null;
      job.finishedAt = this.now();
    }
  }
}

/** The one queue the API process shares between CV imports and listing suggestions. */
export const modelJobs = new ModelJobs();
setInterval(() => modelJobs.sweep(), 15_000).unref();

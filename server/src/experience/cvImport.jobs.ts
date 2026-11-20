import { randomUUID } from "node:crypto";
import type { CvImportJob, CvSuggestions } from "@assma/shared";
import { notFound } from "../platform/errors.js";

export type CvProgress = { found: number; part: number; parts: number };

/** Reads one CV. Reports progress as it goes and stops when `signal` aborts. */
export type CvReader = (
  text: string,
  signal: AbortSignal,
  progress: (update: CvProgress) => void,
) => Promise<CvSuggestions>;

type Job = {
  id: string;
  ownerId: string;
  state: CvImportJob["state"];
  found: number;
  part: number;
  parts: number;
  startedAt: Date;
  /** Kept only until the model has read it. */
  text: string | null;
  suggestions: CvSuggestions | null;
  error: string | null;
  finishedAt: number | null;
  lastSeen: number;
  controller: AbortController;
};

const MINUTE = 60_000;

/**
 * In-memory queue for CV imports. The CPU-bound model reads one CV at a time; assma runs as
 * one API process, so memory is enough. Browsers slow timers in background tabs to about one
 * per minute, so a job is abandoned only after ten minutes without a poll. Results are
 * forgotten 30 minutes after they finish. The reader limits each part's time itself; the job
 * timeout is only a safety net.
 */
export class CvImportJobs {
  private readonly jobs = new Map<string, Job>();
  private readonly queue: Job[] = [];
  private running: Job | null = null;

  constructor(
    private readonly read: CvReader,
    private readonly limits = {
      timeoutMs: 60 * MINUTE,
      abandonAfterMs: 10 * MINUTE,
      keepResultMs: 30 * MINUTE,
    },
    private readonly now = () => Date.now(),
  ) {}

  /** Starts an import; an earlier unfinished import of the same person is cancelled. */
  start(ownerId: string, text: string): CvImportJob {
    this.sweep();
    for (const job of this.jobs.values()) {
      if (job.ownerId === ownerId) {
        this.remove(job, "replaced");
      }
    }
    const job: Job = {
      id: randomUUID(),
      ownerId,
      state: "queued",
      found: 0,
      part: 0,
      parts: 1,
      startedAt: new Date(this.now()),
      text,
      suggestions: null,
      error: null,
      finishedAt: null,
      lastSeen: this.now(),
      controller: new AbortController(),
    };
    this.jobs.set(job.id, job);
    this.queue.push(job);
    this.pump();
    return this.view(job);
  }

  /** Another person's job id behaves like an unknown one. */
  get(ownerId: string, id: string): CvImportJob {
    this.sweep();
    const job = this.owned(ownerId, id);
    job.lastSeen = this.now();
    return this.view(job);
  }

  cancel(ownerId: string, id: string): { id: string } {
    this.remove(this.owned(ownerId, id), "cancelled");
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

  private owned(ownerId: string, id: string): Job {
    const job = this.jobs.get(id);
    if (!job || job.ownerId !== ownerId) {
      throw notFound();
    }
    return job;
  }

  private remove(job: Job, reason: string): void {
    job.controller.abort(reason);
    job.text = null;
    this.jobs.delete(job.id);
    const index = this.queue.indexOf(job);
    if (index >= 0) {
      this.queue.splice(index, 1);
    }
  }

  private view(job: Job): CvImportJob {
    const index = this.queue.indexOf(job);
    return {
      id: job.id,
      state: job.state,
      position: index < 0 ? 0 : index + (this.running ? 1 : 0),
      found: job.found,
      part: job.part,
      parts: job.parts,
      startedAt: job.startedAt.toISOString(),
      suggestions: job.suggestions,
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
      const suggestions = await this.read(job.text ?? "", signal, (update) => {
        job.found = update.found;
        job.part = update.part;
        job.parts = update.parts;
      });
      job.suggestions = suggestions;
      job.found = suggestions.references.length;
      job.state = "done";
    } catch (error) {
      job.state = "failed";
      job.error = job.controller.signal.aborted
        ? "cancelled"
        : signal.aborted || (error instanceof Error && error.name === "TimeoutError")
          ? "timeout"
          : error instanceof Error && error.message.startsWith("model_unavailable")
            ? "model_unavailable"
            : "unreadable";
    } finally {
      job.text = null;
      job.finishedAt = this.now();
    }
  }
}

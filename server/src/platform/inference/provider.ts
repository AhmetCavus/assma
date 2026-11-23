/**
 * assma's own interface to a language model. CV import, listing extraction, fit assessment
 * and the status check depend only on this file; each adapter keeps its SDK, its
 * authentication, its streaming format and its runtime options to itself.
 */

/** One message of a request, in assma's own terms. */
export type InferenceMessage = { role: "system" | "user" | "assistant"; content: string };

/** A standard JSON Schema object describing the answer. */
export type JsonSchema = { readonly [key: string]: unknown };

export type StructuredRequest = {
  messages: readonly InferenceMessage[];
  /** The answer must be one JSON value that matches this schema. */
  schema: JsonSchema;
};

export interface InferenceProvider {
  /** The configured model, as the provider names it. */
  readonly modelId: string;
  /** Whether the provider answers and serves that model. Never throws. */
  modelAvailable(signal?: AbortSignal): Promise<boolean>;
  /**
   * Streams the answer as JSON text fragments; joined, they form one JSON value. Throws a
   * `ModelError` when the provider fails, and the signal's own reason when it aborts.
   */
  streamStructured(request: StructuredRequest, signal?: AbortSignal): AsyncIterable<string>;
}

/** Problems the operator can act on; none of them depends on the request's content. */
export type ModelErrorCode =
  /** The server cannot be reached (address, port, firewall, not running). */
  | "unreachable"
  /** The key is missing, wrong or not allowed to use the model, or billing blocks it. */
  | "auth"
  /** The provider does not serve the configured model. */
  | "model_not_found"
  /** Too many requests or a spend limit; it may work again later. */
  | "rate_limited"
  /** The provider failed on its side (5xx, overloaded, a stream error). */
  | "provider_error"
  /** Prompt plus answer do not fit the model's context window. */
  | "context_length"
  /** The provider rejected the request for another reason. */
  | "bad_request"
  /** The answer stopped at the output limit, so its JSON is incomplete. */
  | "truncated"
  /** The model declined to answer. */
  | "refused"
  /** The model got stuck repeating whitespace instead of finishing the JSON. */
  | "repetition";

const UNAVAILABLE: ReadonlySet<ModelErrorCode> = new Set([
  "unreachable",
  "auth",
  "model_not_found",
  "rate_limited",
  "provider_error",
]);

export class ModelError extends Error {
  override readonly name = "ModelError";

  constructor(
    readonly code: ModelErrorCode,
    /** What the operator should check. Never contains prompt or answer text. */
    readonly hint: string,
    /** The provider's own short message, for the log. */
    readonly detail = "",
  ) {
    // The job queue reports "model_unavailable" for problems of the setup and "unreadable"
    // for an answer that could not be used.
    super(`${UNAVAILABLE.has(code) ? "model_unavailable" : "model_failed"}: ${code}`);
  }

  /** One line for the server log. */
  describe(): string {
    return [this.message, this.hint, this.detail && `provider said: ${this.detail}`]
      .filter(Boolean)
      .join(" | ");
  }
}

/** Throws the signal's own reason, so a timeout stays a timeout and a cancel a cancel. */
export function rethrowIfAborted(signal: AbortSignal | undefined, error: unknown): void {
  if (signal?.aborted) {
    throw signal.reason ?? error;
  }
}

/** A provider message shortened for the log. */
export function shortDetail(value: unknown): string {
  const text = value instanceof Error ? value.message : typeof value === "string" ? value : "";
  return text.replace(/\s+/g, " ").trim().slice(0, 240);
}

const CONTEXT_MESSAGE =
  /context[ _]length|context window|maximum context|prompt is too long|too many tokens/i;

/** Whether a provider's rejection says that prompt and answer exceed the context. */
export function mentionsContextLength(message: string): boolean {
  return CONTEXT_MESSAGE.test(message);
}

/**
 * Structured decoding allows any whitespace between JSON tokens, and some local models,
 * once their answer is complete, keep producing it instead of closing the object, until the
 * context is full. More than this many whitespace characters in a row ends the request.
 */
export const RUNAWAY_WHITESPACE = 400;

const trailingWhitespace = (text: string) => text.length - text.trimEnd().length;

/** Ends a stream that only produces whitespace any more; works for every provider. */
export function guardRunaway(provider: InferenceProvider): InferenceProvider {
  return {
    modelId: provider.modelId,
    modelAvailable: (signal) => provider.modelAvailable(signal),
    async *streamStructured(request, signal) {
      const stop = new AbortController();
      const combined = signal ? AbortSignal.any([signal, stop.signal]) : stop.signal;
      let blank = 0;
      try {
        for await (const fragment of provider.streamStructured(request, combined)) {
          blank = fragment.trim() ? trailingWhitespace(fragment) : blank + fragment.length;
          if (blank > RUNAWAY_WHITESPACE) {
            stop.abort();
            throw new ModelError(
              "repetition",
              `${provider.modelId} kept writing whitespace instead of finishing its answer; a stronger model, or a server option that forbids free whitespace in JSON, helps.`,
            );
          }
          yield fragment;
        }
      } catch (error) {
        if (stop.signal.aborted && !signal?.aborted && !(error instanceof ModelError)) {
          throw new ModelError("repetition", "The model got stuck and was stopped.");
        }
        throw error;
      } finally {
        stop.abort();
      }
    },
  };
}

let active: InferenceProvider | null = null;

/** Called once at startup with the configured provider (tests pass their own). */
export function useInferenceProvider(provider: InferenceProvider): void {
  active = guardRunaway(provider);
}

export function inference(): InferenceProvider {
  if (!active) {
    throw new Error("No inference provider configured; call useInferenceProvider at startup.");
  }
  return active;
}

let availability: { provider: InferenceProvider; at: number; available: boolean } | null = null;

/** The provider's availability, checked at most every 30 seconds. */
export async function cachedAvailability(now = Date.now()): Promise<boolean> {
  const provider = inference();
  if (availability && availability.provider === provider && now - availability.at < 30_000) {
    return availability.available;
  }
  const available = await provider.modelAvailable(AbortSignal.timeout(5000));
  availability = { provider, at: now, available };
  return available;
}

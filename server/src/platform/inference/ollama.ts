import { z } from "zod";
import {
  ModelError,
  mentionsContextLength,
  rethrowIfAborted,
  shortDetail,
  type InferenceMessage,
  type InferenceProvider,
  type StructuredRequest,
} from "./provider.js";

export type OllamaOptions = {
  /** For example http://ollama:11434, without /api. */
  baseUrl: string;
  model: string;
  /** How long Ollama keeps the model loaded after a request. */
  keepAlive: string;
  /** Sent as a bearer token, for an Ollama behind an authenticating proxy. */
  apiKey?: string;
  fetch?: typeof fetch;
};

/**
 * Ollama allocates exactly `num_ctx` tokens and silently drops the start of a longer prompt.
 * The context therefore covers the request's text (at most a 12,000-character CV part, under
 * 4,000 tokens even for dense text) plus room for the instructions and a long answer, in
 * steps of 1024 so most requests share one size and the model is not reloaded.
 */
export function contextFor(messages: readonly InferenceMessage[]): number {
  const text = messages
    .filter((message) => message.role !== "system")
    .map((message) => message.content)
    .join("\n");
  const estimate = Math.ceil(text.length / 3) + 4500;
  return Math.max(6144, Math.ceil(estimate / 1024) * 1024);
}

const chunkSchema = z.object({
  message: z.object({ content: z.string().optional() }).optional(),
  done: z.boolean().optional(),
  done_reason: z.string().optional(),
  error: z.string().optional(),
});

/** Native Ollama (`/api/chat`), with Ollama's own runtime options. */
export class OllamaProvider implements InferenceProvider {
  readonly modelId: string;
  private readonly baseUrl: string;
  private readonly fetch: typeof fetch;

  constructor(private readonly options: OllamaOptions) {
    this.modelId = options.model;
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.fetch = options.fetch ?? fetch;
  }

  private headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      ...(this.options.apiKey ? { Authorization: `Bearer ${this.options.apiKey}` } : {}),
    };
  }

  async modelAvailable(signal?: AbortSignal): Promise<boolean> {
    try {
      const response = await this.fetch(`${this.baseUrl}/api/tags`, {
        headers: this.headers(),
        signal: signal ?? AbortSignal.timeout(3000),
      });
      const tags = z
        .object({ models: z.array(z.object({ name: z.string() })) })
        .safeParse(await response.json());
      return (
        response.ok &&
        tags.success &&
        tags.data.models.some(
          (entry) => entry.name === this.modelId || entry.name === `${this.modelId}:latest`,
        )
      );
    } catch {
      return false;
    }
  }

  async *streamStructured(
    { messages, schema }: StructuredRequest,
    signal?: AbortSignal,
  ): AsyncGenerator<string, void> {
    let response: Response;
    try {
      response = await this.fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          model: this.modelId,
          messages,
          format: schema,
          stream: true,
          think: false,
          keep_alive: this.options.keepAlive,
          options: { temperature: 0, num_ctx: contextFor(messages) },
        }),
        signal,
      });
    } catch (error) {
      rethrowIfAborted(signal, error);
      throw new ModelError(
        "unreachable",
        `Ollama does not answer at ${this.baseUrl}; check LLM_BASE_URL (or OLLAMA_URL) and that Ollama runs.`,
        shortDetail(error),
      );
    }
    if (!response.ok || !response.body) {
      throw await this.failure(response);
    }

    const decoder = new TextDecoder();
    const reader = response.body.getReader();
    let buffer = "";
    let finished: string | undefined;
    const lines = (text: string) => text.split("\n").filter((line) => line.trim());
    const handle = function* (line: string): Generator<string> {
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        return;
      }
      const chunk = chunkSchema.safeParse(parsed);
      if (!chunk.success) {
        return;
      }
      if (chunk.data.error) {
        throw new ModelError(
          mentionsContextLength(chunk.data.error) ? "context_length" : "provider_error",
          "Ollama reported an error while answering; see its log.",
          shortDetail(chunk.data.error),
        );
      }
      if (chunk.data.message?.content) {
        yield chunk.data.message.content;
      }
      if (chunk.data.done) {
        finished = chunk.data.done_reason ?? "stop";
      }
    };
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const complete = buffer.split("\n");
        buffer = complete.pop() ?? "";
        for (const line of complete.filter((entry) => entry.trim())) {
          yield* handle(line);
        }
      }
      buffer += decoder.decode();
      for (const line of lines(buffer)) {
        yield* handle(line);
      }
    } catch (error) {
      rethrowIfAborted(signal, error);
      if (error instanceof ModelError) {
        throw error;
      }
      throw new ModelError(
        "unreachable",
        "The connection to Ollama broke off while it was answering.",
        shortDetail(error),
      );
    } finally {
      reader.releaseLock();
    }
    rethrowIfAborted(signal, null);
    if (finished === "length") {
      throw new ModelError(
        "truncated",
        "Ollama stopped at its output limit; the answer is incomplete.",
      );
    }
  }

  private async failure(response: Response): Promise<ModelError> {
    const body = await response.text().catch(() => "");
    let detail = body;
    try {
      detail = (JSON.parse(body) as { error?: string }).error ?? body;
    } catch {
      // A plain-text error body.
    }
    if (response.status === 404) {
      return new ModelError(
        "model_not_found",
        `Ollama has no model "${this.modelId}"; run \`ollama pull ${this.modelId}\` or change LLM_MODEL.`,
        shortDetail(detail),
      );
    }
    if (response.status === 401 || response.status === 403) {
      return new ModelError(
        "auth",
        "The server in front of Ollama refused the request; check LLM_API_KEY.",
      );
    }
    if (mentionsContextLength(detail)) {
      return new ModelError(
        "context_length",
        "The request does not fit Ollama's context.",
        shortDetail(detail),
      );
    }
    return new ModelError(
      response.status >= 500 ? "provider_error" : "bad_request",
      `Ollama answered with HTTP ${response.status}.`,
      shortDetail(detail),
    );
  }
}

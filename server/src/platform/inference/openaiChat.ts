import OpenAI from "openai";
import type { ChatCompletionCreateParamsStreaming } from "openai/resources/chat/completions";
import {
  ModelError,
  mentionsContextLength,
  rethrowIfAborted,
  shortDetail,
  type InferenceProvider,
  type StructuredRequest,
} from "./provider.js";
import { strictSchema } from "./schema.js";

export type OpenAIChatOptions = {
  /** Names the server in hints, for example "OpenAI" or "the OpenAI-compatible server". */
  label: string;
  model: string;
  apiKey: string;
  /** The setting that holds the key, named in hints. */
  keySetting: string;
  /** Leave out for api.openai.com; for vLLM, for example http://192.168.1.20:8000/v1. */
  baseURL?: string;
  /** Upper limit for the answer; left out, the server decides (for vLLM: what is left). */
  maxOutputTokens?: number;
  /** The field the server reads that limit from. */
  limitField?: "max_completion_tokens" | "max_tokens";
  /** Runtime-specific request fields of an adapter built on this transport. */
  extraBody?: Record<string, unknown>;
  maxRetries?: number;
  fetch?: typeof fetch;
};

/**
 * The Chat Completions transport: streaming with a JSON-schema response format. Hosted
 * OpenAI uses it as it is; the local adapter adds its server's own fields (`extraBody`).
 */
export class OpenAIChatProvider implements InferenceProvider {
  readonly modelId: string;
  private readonly client: OpenAI;

  constructor(private readonly options: OpenAIChatOptions) {
    this.modelId = options.model;
    this.client = new OpenAI({
      apiKey: options.apiKey,
      ...(options.baseURL ? { baseURL: options.baseURL } : {}),
      maxRetries: options.maxRetries ?? 2,
      // assma's own per-task timeouts end a request; this only catches a hung connection.
      timeout: 60 * 60 * 1000,
      ...(options.fetch ? { fetch: options.fetch } : {}),
    });
  }

  async modelAvailable(signal?: AbortSignal): Promise<boolean> {
    try {
      // The list, not models/{id}: vLLM serves only the list, and its ids contain slashes.
      for await (const model of this.client.models.list({ signal: signal ?? null })) {
        if (model.id === this.modelId) {
          return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  async *streamStructured(
    { messages, schema }: StructuredRequest,
    signal?: AbortSignal,
  ): AsyncGenerator<string, void> {
    const params: ChatCompletionCreateParamsStreaming = {
      model: this.modelId,
      messages: messages.map((message) => ({ role: message.role, content: message.content })),
      stream: true,
      response_format: {
        type: "json_schema",
        json_schema: { name: "assma_answer", schema: strictSchema(schema), strict: true },
      },
    };
    if (this.options.maxOutputTokens) {
      Object.assign(params, {
        [this.options.limitField ?? "max_completion_tokens"]: this.options.maxOutputTokens,
      });
    }
    Object.assign(params, this.options.extraBody);

    let finish: string | null = null;
    try {
      const stream = await this.client.chat.completions.create(params, { signal: signal ?? null });
      for await (const chunk of stream) {
        const choice = chunk.choices[0];
        if (!choice) {
          continue;
        }
        if (choice.delta?.refusal) {
          throw new ModelError("refused", `The model declined to answer (${this.options.label}).`);
        }
        if (choice.delta?.content) {
          yield choice.delta.content;
        }
        finish = choice.finish_reason ?? finish;
      }
    } catch (error) {
      rethrowIfAborted(signal, error);
      throw this.translate(error);
    }
    // The SDK ends an aborted stream quietly; the caller must still learn why it stopped.
    rethrowIfAborted(signal, null);
    if (finish === "length") {
      throw new ModelError(
        "truncated",
        `The answer reached the output limit of ${this.options.label}; raise LLM_MAX_OUTPUT_TOKENS or the server's context length.`,
      );
    }
    if (finish === "content_filter") {
      throw new ModelError("refused", `${this.options.label} filtered the answer.`);
    }
  }

  private translate(error: unknown): ModelError {
    const { label, keySetting } = this.options;
    const detail = shortDetail(error);
    if (error instanceof ModelError) {
      return error;
    }
    if (error instanceof OpenAI.APIConnectionError) {
      return new ModelError(
        "unreachable",
        `${label} does not answer at ${this.options.baseURL ?? "api.openai.com"}; check the address, the port and the firewall.`,
        detail,
      );
    }
    if (
      error instanceof OpenAI.AuthenticationError ||
      error instanceof OpenAI.PermissionDeniedError
    ) {
      return new ModelError("auth", `${label} refused the key; check ${keySetting}.`, detail);
    }
    if (error instanceof OpenAI.NotFoundError) {
      return new ModelError(
        "model_not_found",
        `${label} does not serve the model "${this.modelId}"; check LLM_MODEL against its model list.`,
        detail,
      );
    }
    if (error instanceof OpenAI.RateLimitError) {
      return new ModelError(
        "rate_limited",
        `${label} limits the requests or the account's quota is used up; try again later or check billing.`,
        detail,
      );
    }
    if (
      error instanceof OpenAI.BadRequestError ||
      error instanceof OpenAI.UnprocessableEntityError
    ) {
      const code = (error as { code?: string | null }).code;
      if (code === "context_length_exceeded" || mentionsContextLength(detail)) {
        return new ModelError(
          "context_length",
          `Prompt and answer exceed the context of "${this.modelId}"; use shorter input, a model with a larger context, or raise the server's maximum length.`,
          detail,
        );
      }
      return new ModelError("bad_request", `${label} rejected the request.`, detail);
    }
    return new ModelError(
      "provider_error",
      `${label} failed while answering; it may work again shortly.`,
      detail,
    );
  }
}

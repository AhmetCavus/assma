import Anthropic from "@anthropic-ai/sdk";
import {
  ModelError,
  mentionsContextLength,
  rethrowIfAborted,
  shortDetail,
  type InferenceProvider,
  type StructuredRequest,
} from "./provider.js";
import { strictSchema } from "./schema.js";

export type ClaudeOptions = {
  model: string;
  apiKey: string;
  /** Room for the answer, including the model's thinking. */
  maxOutputTokens: number;
  maxRetries?: number;
  fetch?: typeof fetch;
};

/** Anthropic's Messages API with structured outputs (`output_config.format`). */
export class ClaudeProvider implements InferenceProvider {
  readonly modelId: string;
  private readonly client: Anthropic;

  constructor(private readonly options: ClaudeOptions) {
    this.modelId = options.model;
    this.client = new Anthropic({
      apiKey: options.apiKey,
      maxRetries: options.maxRetries ?? 2,
      // assma's own per-task timeouts end a request; this only catches a hung connection.
      timeout: 60 * 60 * 1000,
      ...(options.fetch ? { fetch: options.fetch } : {}),
    });
  }

  async modelAvailable(signal?: AbortSignal): Promise<boolean> {
    try {
      await this.client.models.retrieve(this.modelId, {}, { signal: signal ?? null });
      return true;
    } catch {
      return false;
    }
  }

  async *streamStructured(
    { messages, schema }: StructuredRequest,
    signal?: AbortSignal,
  ): AsyncGenerator<string, void> {
    const system = messages
      .filter((message) => message.role === "system")
      .map((message) => message.content)
      .join("\n\n");
    const conversation = messages
      .filter((message) => message.role !== "system")
      .map((message) => ({
        role: message.role as "user" | "assistant",
        content: message.content,
      }));

    let stopReason: string | null = null;
    try {
      const stream = this.client.messages.stream(
        {
          model: this.modelId,
          max_tokens: this.options.maxOutputTokens,
          ...(system ? { system } : {}),
          messages: conversation,
          output_config: { format: { type: "json_schema", schema: strictSchema(schema) } },
        },
        { signal: signal ?? null },
      );
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          yield event.delta.text;
        } else if (event.type === "message_delta") {
          stopReason = event.delta.stop_reason ?? stopReason;
        }
      }
    } catch (error) {
      rethrowIfAborted(signal, error);
      throw this.translate(error);
    }
    rethrowIfAborted(signal, null);
    if (stopReason === "max_tokens") {
      throw new ModelError(
        "truncated",
        `The answer reached max_tokens (${this.options.maxOutputTokens}); raise LLM_MAX_OUTPUT_TOKENS.`,
      );
    }
    if (stopReason === "refusal") {
      throw new ModelError("refused", "Claude declined to answer this request.");
    }
  }

  private translate(error: unknown): ModelError {
    const detail = shortDetail(error);
    if (error instanceof ModelError) {
      return error;
    }
    if (error instanceof Anthropic.APIConnectionError) {
      return new ModelError(
        "unreachable",
        "The Anthropic API does not answer; check the server's internet access and proxy.",
        detail,
      );
    }
    if (
      error instanceof Anthropic.AuthenticationError ||
      error instanceof Anthropic.PermissionDeniedError ||
      error instanceof Anthropic.PaymentRequiredError
    ) {
      return new ModelError(
        "auth",
        "Anthropic refused the key or the account cannot use the model; check ANTHROPIC_API_KEY and billing.",
        detail,
      );
    }
    if (error instanceof Anthropic.NotFoundError) {
      return new ModelError(
        "model_not_found",
        `Anthropic has no model "${this.modelId}" for this account; check LLM_MODEL.`,
        detail,
      );
    }
    if (error instanceof Anthropic.RateLimitError) {
      return new ModelError(
        "rate_limited",
        "Anthropic limits the requests or a spend limit is reached; try again later.",
        detail,
      );
    }
    if (
      error instanceof Anthropic.BadRequestError ||
      error instanceof Anthropic.ContentTooLargeError
    ) {
      if (mentionsContextLength(detail) || error instanceof Anthropic.ContentTooLargeError) {
        return new ModelError(
          "context_length",
          `The request is too large for "${this.modelId}".`,
          detail,
        );
      }
      return new ModelError("bad_request", "Anthropic rejected the request.", detail);
    }
    return new ModelError(
      "provider_error",
      "Anthropic failed while answering (overloaded or a server error); it may work again shortly.",
      detail,
    );
  }
}

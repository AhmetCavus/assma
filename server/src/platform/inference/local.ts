import type { InferenceSettings } from "./config.js";
import { OllamaProvider } from "./ollama.js";
import { OpenAIChatProvider } from "./openaiChat.js";
import type { InferenceProvider } from "./provider.js";

type LocalSettings = Extract<InferenceSettings, { provider: "local" }>;

/**
 * Self-hosted models on this machine or in the LAN: native Ollama, or a server that speaks
 * the Chat Completions protocol (vLLM, llama.cpp), reusing the OpenAI transport.
 */
export function createLocalProvider(
  settings: LocalSettings,
  overrides: { fetch?: typeof fetch; maxRetries?: number } = {},
): InferenceProvider {
  if (settings.protocol === "ollama") {
    return new OllamaProvider({
      baseUrl: settings.baseUrl,
      model: settings.model,
      keepAlive: settings.keepAlive,
      ...(settings.apiKey ? { apiKey: settings.apiKey } : {}),
      ...(overrides.fetch ? { fetch: overrides.fetch } : {}),
    });
  }
  return new OpenAIChatProvider({
    label: "The OpenAI-compatible server",
    model: settings.model,
    // The SDK needs a key; a server started without --api-key ignores it.
    apiKey: settings.apiKey ?? "not-set",
    keySetting: "LLM_API_KEY",
    baseURL: settings.baseUrl,
    limitField: "max_tokens",
    ...(settings.maxOutputTokens ? { maxOutputTokens: settings.maxOutputTokens } : {}),
    extraBody: {
      temperature: 0,
      // Qwen3 and similar models think first unless the chat template is told not to; the
      // thoughts would use up a small context and come before the JSON.
      chat_template_kwargs: { enable_thinking: false },
    },
    ...overrides,
  });
}

import { ClaudeProvider } from "./claude.js";
import { createLocalProvider } from "./local.js";
import { OpenAIChatProvider } from "./openaiChat.js";
import type { InferenceProvider } from "./provider.js";

export const LLM_PROVIDERS = ["openai", "local", "claude"] as const;
export const LOCAL_PROTOCOLS = ["ollama", "openai-compatible"] as const;

export type InferenceSettings =
  | { provider: "openai"; model: string; apiKey: string; maxOutputTokens?: number }
  | { provider: "claude"; model: string; apiKey: string; maxOutputTokens: number }
  | {
      provider: "local";
      protocol: "ollama";
      baseUrl: string;
      model: string;
      apiKey?: string;
      keepAlive: string;
    }
  | {
      provider: "local";
      protocol: "openai-compatible";
      baseUrl: string;
      model: string;
      apiKey?: string;
      maxOutputTokens?: number;
    };

/** Room Claude gets for an answer, thinking included, unless LLM_MAX_OUTPUT_TOKENS says otherwise. */
export const CLAUDE_DEFAULT_OUTPUT_TOKENS = 32_000;

const value = (env: NodeJS.ProcessEnv, name: string) => env[name]?.trim() || undefined;

function isHttpUrl(text: string): boolean {
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Reads the model settings. Without LLM_PROVIDER, assma uses the local Ollama from OLLAMA_*
 * as before. Problems name settings only, never their values, so they are safe to log.
 */
export function inferenceSettings(env: NodeJS.ProcessEnv): {
  settings: InferenceSettings | null;
  problems: string[];
} {
  const problems: string[] = [];
  const provider = value(env, "LLM_PROVIDER") ?? "local";
  const model = value(env, "LLM_MODEL");
  const maxText = value(env, "LLM_MAX_OUTPUT_TOKENS");
  const maxOutputTokens = maxText === undefined ? undefined : Number(maxText);
  if (
    maxOutputTokens !== undefined &&
    !(Number.isInteger(maxOutputTokens) && maxOutputTokens > 0)
  ) {
    problems.push("LLM_MAX_OUTPUT_TOKENS must be a positive whole number");
  }
  const limit = problems.length === 0 ? maxOutputTokens : undefined;

  if (!(LLM_PROVIDERS as readonly string[]).includes(provider)) {
    problems.push(`LLM_PROVIDER must be one of ${LLM_PROVIDERS.join(", ")}`);
    return { settings: null, problems };
  }

  if (provider === "openai" || provider === "claude") {
    const keyName = provider === "openai" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY";
    const apiKey = value(env, keyName);
    if (!model) {
      problems.push(`LLM_MODEL is required for LLM_PROVIDER=${provider}`);
    }
    if (!apiKey) {
      problems.push(`${keyName} is required for LLM_PROVIDER=${provider}`);
    }
    if (!model || !apiKey || problems.length > 0) {
      return { settings: null, problems };
    }
    return {
      settings:
        provider === "openai"
          ? { provider, model, apiKey, ...(limit ? { maxOutputTokens: limit } : {}) }
          : { provider, model, apiKey, maxOutputTokens: limit ?? CLAUDE_DEFAULT_OUTPUT_TOKENS },
      problems,
    };
  }

  const protocol = (value(env, "LLM_LOCAL_PROTOCOL") ??
    "ollama") as (typeof LOCAL_PROTOCOLS)[number];
  if (!(LOCAL_PROTOCOLS as readonly string[]).includes(protocol)) {
    problems.push(`LLM_LOCAL_PROTOCOL must be one of ${LOCAL_PROTOCOLS.join(", ")}`);
    return { settings: null, problems };
  }
  const apiKey = value(env, "LLM_API_KEY");
  if (protocol === "ollama") {
    const baseUrl =
      value(env, "LLM_BASE_URL") ?? value(env, "OLLAMA_URL") ?? "http://127.0.0.1:11434";
    if (!isHttpUrl(baseUrl)) {
      problems.push("LLM_BASE_URL (or OLLAMA_URL) must be an http or https address");
      return { settings: null, problems };
    }
    return {
      settings: {
        provider: "local",
        protocol,
        baseUrl,
        model: model ?? value(env, "OLLAMA_MODEL") ?? "qwen3.5:4b",
        keepAlive: value(env, "OLLAMA_KEEP_ALIVE") ?? "30m",
        ...(apiKey ? { apiKey } : {}),
      },
      problems,
    };
  }
  const baseUrl = value(env, "LLM_BASE_URL");
  if (!baseUrl || !isHttpUrl(baseUrl)) {
    problems.push(
      "LLM_BASE_URL must be the server's http address, ending in /v1, for LLM_LOCAL_PROTOCOL=openai-compatible",
    );
  }
  if (!model) {
    problems.push("LLM_MODEL is required for LLM_LOCAL_PROTOCOL=openai-compatible");
  }
  if (!baseUrl || !model || problems.length > 0) {
    return { settings: null, problems };
  }
  return {
    settings: {
      provider: "local",
      protocol,
      baseUrl,
      model,
      ...(apiKey ? { apiKey } : {}),
      ...(limit ? { maxOutputTokens: limit } : {}),
    },
    problems,
  };
}

/** Builds the configured provider; `fetch` is for tests. */
export function createInferenceProvider(
  settings: InferenceSettings,
  overrides: { fetch?: typeof fetch; maxRetries?: number } = {},
): InferenceProvider {
  switch (settings.provider) {
    case "openai":
      return new OpenAIChatProvider({
        label: "OpenAI",
        model: settings.model,
        apiKey: settings.apiKey,
        keySetting: "OPENAI_API_KEY",
        ...(settings.maxOutputTokens ? { maxOutputTokens: settings.maxOutputTokens } : {}),
        ...overrides,
      });
    case "claude":
      return new ClaudeProvider({
        model: settings.model,
        apiKey: settings.apiKey,
        maxOutputTokens: settings.maxOutputTokens,
        ...overrides,
      });
    case "local":
      return createLocalProvider(settings, overrides);
  }
}

/** Where the model runs, for the startup log: no keys. */
export function describeSettings(settings: InferenceSettings): string {
  switch (settings.provider) {
    case "openai":
      return `openai (${settings.model})`;
    case "claude":
      return `claude (${settings.model})`;
    case "local":
      return `local ${settings.protocol} at ${new URL(settings.baseUrl).host} (${settings.model})`;
  }
}

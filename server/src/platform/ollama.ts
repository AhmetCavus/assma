import { z } from "zod";

/** Settings for the shared Ollama container (same variables as ellma). */
export function ollamaSettings() {
  return {
    url: (process.env.OLLAMA_URL ?? "http://127.0.0.1:11434").replace(/\/$/, ""),
    model: process.env.OLLAMA_MODEL ?? "qwen3.5:4b",
    keepAlive: process.env.OLLAMA_KEEP_ALIVE ?? "30m",
  };
}

export class ModelUnavailable extends Error {
  constructor(reason: string) {
    super(`model_unavailable: ${reason}`);
  }
}

const chunkSchema = z.object({
  message: z.object({ content: z.string().optional() }).optional(),
  done: z.boolean().optional(),
  error: z.string().optional(),
});

export type ChatMessage = { role: "system" | "user"; content: string };

/**
 * Streams one structured completion from the local model. `format` is a JSON schema Ollama
 * constrains the output to. Yields text deltas; the caller joins and parses them.
 */
export async function* streamStructured(
  messages: ChatMessage[],
  format: Record<string, unknown>,
  options: { numCtx: number },
  signal: AbortSignal,
): AsyncGenerator<string, void> {
  const { url, model, keepAlive } = ollamaSettings();
  let response: Response;
  try {
    response = await fetch(`${url}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        format,
        stream: true,
        think: false,
        keep_alive: keepAlive,
        options: { temperature: 0, num_ctx: options.numCtx },
      }),
      signal,
    });
  } catch (error) {
    if (signal.aborted) {
      throw error;
    }
    throw new ModelUnavailable("unreachable");
  }
  if (!response.ok || !response.body) {
    throw new ModelUnavailable(`status_${response.status}`);
  }
  const decoder = new TextDecoder();
  let buffer = "";
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }
      const chunk = chunkSchema.safeParse(parsed);
      if (!chunk.success) {
        continue;
      }
      if (chunk.data.error) {
        throw new ModelUnavailable("model_error");
      }
      if (chunk.data.message?.content) {
        yield chunk.data.message.content;
      }
    }
  }
}

let cachedAvailability: { at: number; available: boolean } | null = null;

/** Whether Ollama answers and has the configured model installed; cached for 30 seconds. */
export async function modelAvailable(now = Date.now()): Promise<boolean> {
  if (cachedAvailability && now - cachedAvailability.at < 30_000) {
    return cachedAvailability.available;
  }
  const { url, model } = ollamaSettings();
  let available = false;
  try {
    const response = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(3000) });
    const tags = z
      .object({ models: z.array(z.object({ name: z.string() })) })
      .safeParse(await response.json());
    available =
      response.ok &&
      tags.success &&
      tags.data.models.some((entry) => entry.name === model || entry.name === `${model}:latest`);
  } catch {
    available = false;
  }
  cachedAvailability = { at: now, available };
  return available;
}

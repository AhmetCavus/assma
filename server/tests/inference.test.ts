import assert from "node:assert/strict";
import { test } from "node:test";
import { normaliseFindings, normaliseListing } from "@assma/shared";
import { CV_SCHEMA, cvMessages } from "../src/experience/cvImport.prompt.ts";
import { readCv } from "../src/experience/cvImport.reader.ts";
import {
  createInferenceProvider,
  inferenceSettings,
  type InferenceSettings,
} from "../src/platform/inference/config.ts";
import {
  ModelError,
  useInferenceProvider,
  type InferenceProvider,
  type JsonSchema,
} from "../src/platform/inference/provider.ts";
import { strictSchema } from "../src/platform/inference/schema.ts";
import { ModelJobs } from "../src/platform/modelJobs.ts";
import { FIT_SCHEMA, fitMessages } from "../src/projects/fit.prompt.ts";
import { LISTING_SCHEMA, listingMessages } from "../src/projects/listing.prompt.ts";
import { readListing } from "../src/projects/listing.reader.ts";

// ---------------------------------------------------------------------------------------
// A fetch stand-in: records each request and answers with a byte stream cut into awkward
// pieces (in the middle of lines, events and multi-byte characters), as networks do.

type Sent = { url: string; method: string; headers: Headers; body: Record<string, unknown> };
type Reply = {
  status?: number;
  contentType?: string;
  /** Text sent as the body, cut into `pieces` byte slices. */
  body: string;
  pieces?: number;
  /** Keeps the stream open after the body until the request is aborted. */
  hang?: boolean;
};

function mockFetch(answer: (sent: Sent) => Reply) {
  const sent: Sent[] = [];
  const fetcher = async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const text = typeof init.body === "string" ? init.body : "";
    const request: Sent = {
      url,
      method: init.method ?? "GET",
      headers: new Headers(init.headers),
      body: text ? (JSON.parse(text) as Record<string, unknown>) : {},
    };
    sent.push(request);
    const signal = init.signal ?? undefined;
    signal?.throwIfAborted();
    const reply = answer(request);
    const bytes = new TextEncoder().encode(reply.body);
    const pieces = Math.max(1, reply.pieces ?? 1);
    const size = Math.ceil(bytes.length / pieces) || 1;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let at = 0; at < bytes.length; at += size) {
          controller.enqueue(bytes.slice(at, at + size));
        }
        if (!reply.hang) {
          controller.close();
          return;
        }
        signal?.addEventListener("abort", () => controller.error(signal.reason), { once: true });
      },
    });
    return new Response(stream, {
      status: reply.status ?? 200,
      headers: { "content-type": reply.contentType ?? "application/json" },
    });
  };
  return { fetch: fetcher as typeof fetch, sent };
}

const refused = (async () => {
  throw new TypeError("fetch failed: connect ECONNREFUSED 192.168.178.50:8000");
}) as typeof fetch;

/** Joins what a provider streams, counting the fragments. */
async function collect(provider: InferenceProvider, schema: JsonSchema, signal?: AbortSignal) {
  const fragments: string[] = [];
  for await (const fragment of provider.streamStructured(
    { messages: listingMessages("Senior Android (Kotlin), Düsseldorf, remote"), schema },
    signal,
  )) {
    fragments.push(fragment);
  }
  return { text: fragments.join(""), fragments: fragments.length };
}

async function failure(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  assert.fail("expected the request to fail");
}

async function modelError(promise: Promise<unknown>): Promise<ModelError> {
  const error = await failure(promise);
  assert.ok(error instanceof ModelError, `expected a ModelError, got ${String(error)}`);
  return error;
}

/** Splits text into `count` roughly equal parts. */
function split(text: string, count: number): string[] {
  const size = Math.ceil(text.length / count);
  const parts: string[] = [];
  for (let at = 0; at < text.length; at += size) {
    parts.push(text.slice(at, at + size));
  }
  return parts;
}

// Answers that match assma's real schemas, with non-ASCII text so byte cuts split characters.
const LISTING_ANSWER = JSON.stringify({
  title: "Senior Android Engineer",
  company: "Aster Care",
  agency: "Northline Talent",
  contact: "Jonas Klein",
  contactEmail: "jonas.klein@northline.example",
  tech: ["Kotlin", "Jetpack Compose"],
  required: ["Kotlin und Jetpack Compose", "Barrierefreiheit mit TalkBack"],
  preferred: ["FHIR R4"],
  terms: "Düsseldorf · 80 % remote · ab März",
});
const CV_ANSWER = JSON.stringify({
  profile: {
    name: "Mara Linden",
    headline: "Android Engineer",
    location: "Köln",
    email: "",
    phone: "",
    address: "",
    website: "",
    summary: "",
    certificates: [],
    languages: [{ name: "Deutsch", level: "Muttersprache" }],
    education: [],
    hobbies: [],
  },
  references: [
    {
      organization: "Kite Transit AG",
      role: "Android Engineer",
      start: "2021-03",
      end: "2022-12",
      contribution: "TalkBack-Semantik für den Ticketkauf.",
      skills: ["Kotlin", "TalkBack"],
    },
  ],
});
const FIT_ANSWER = JSON.stringify({
  findings: [
    { requirement: 1, status: "confirmed", references: ["E01"], note: "Kotlin in E01." },
    { requirement: 2, status: "missing", references: [], note: "" },
  ],
});

// Wire formats of the three providers.
const ollamaStream = (answer: string, doneReason = "stop") =>
  split(answer, 5)
    .map((content) => JSON.stringify({ message: { content } }))
    .concat(JSON.stringify({ message: { content: "" }, done: true, done_reason: doneReason }))
    .join("\n") + "\n";

const openAIStream = (answer: string, finish = "stop") =>
  split(answer, 6)
    .map((content, index): object => ({
      id: "chatcmpl-1",
      object: "chat.completion.chunk",
      created: 1,
      model: "m",
      choices: [
        {
          index: 0,
          delta: index === 0 ? { role: "assistant", content } : { content },
          finish_reason: null,
        },
      ],
    }))
    .concat({
      id: "chatcmpl-1",
      object: "chat.completion.chunk",
      created: 1,
      model: "m",
      choices: [{ index: 0, delta: {}, finish_reason: finish as "stop" }],
    })
    .map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`)
    .join("") + "data: [DONE]\n\n";

const sse = (events: { type: string; [key: string]: unknown }[]) =>
  events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join("");

const claudeStream = (answer: string, stopReason = "end_turn") =>
  sse([
    {
      type: "message_start",
      message: {
        id: "msg_1",
        type: "message",
        role: "assistant",
        model: "claude-opus-5-5",
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 0 },
      },
    },
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    ...split(answer, 6).map((text) => ({
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text },
    })),
    { type: "content_block_stop", index: 0 },
    {
      type: "message_delta",
      delta: { stop_reason: stopReason, stop_sequence: null },
      usage: { output_tokens: 42 },
    },
    { type: "message_stop" },
  ]);

const SSE = "text/event-stream";
const openaiSettings: InferenceSettings = {
  provider: "openai",
  model: "gpt-test",
  apiKey: "sk-test",
};
const vllmSettings: InferenceSettings = {
  provider: "local",
  protocol: "openai-compatible",
  baseUrl: "http://192.168.178.50:8000/v1",
  model: "Qwen/Qwen3-14B-AWQ",
};
const ollamaSettings: InferenceSettings = {
  provider: "local",
  protocol: "ollama",
  baseUrl: "http://ollama:11434",
  model: "qwen3.5:4b",
  keepAlive: "30m",
};
const claudeSettings: InferenceSettings = {
  provider: "claude",
  model: "claude-opus-5-5",
  apiKey: "sk-ant-test",
  maxOutputTokens: 32_000,
};
const build = (settings: InferenceSettings, fetcher: typeof fetch) =>
  createInferenceProvider(settings, { fetch: fetcher, maxRetries: 0 });

// ---------------------------------------------------------------------------------------
// Schemas

test("assma's extraction schemas meet the strict structured-output rules", () => {
  const allowed = new Set([
    "type",
    "properties",
    "required",
    "items",
    "enum",
    "additionalProperties",
  ]);
  const visit = (node: Record<string, unknown>, path: string) => {
    for (const key of Object.keys(node)) {
      assert.ok(allowed.has(key), `${path}: unsupported keyword ${key}`);
    }
    if (node.type === "object") {
      const properties = node.properties as Record<string, Record<string, unknown>>;
      assert.equal(node.additionalProperties, false, `${path} must be closed`);
      assert.deepEqual(
        [...(node.required as string[])].sort(),
        Object.keys(properties).sort(),
        `${path}: every property must be required`,
      );
      for (const [name, child] of Object.entries(properties)) {
        visit(child, `${path}.${name}`);
      }
    }
    if (node.type === "array") {
      visit(node.items as Record<string, unknown>, `${path}[]`);
    }
  };
  for (const [name, schema] of Object.entries({ CV_SCHEMA, LISTING_SCHEMA, FIT_SCHEMA })) {
    const strict = strictSchema(schema);
    visit(strict, name);
    // The originals stay as they are; Ollama receives them unchanged.
    assert.ok(!("additionalProperties" in schema), `${name} itself is not modified`);
  }
});

// ---------------------------------------------------------------------------------------
// Ollama

test("ollama: joins a fragmented stream and keeps its runtime options to itself", async () => {
  const { fetch: fetcher, sent } = mockFetch(() => ({
    body: ollamaStream(LISTING_ANSWER),
    pieces: 9,
    contentType: "application/x-ndjson",
  }));
  const provider = build(ollamaSettings, fetcher);
  const { text, fragments } = await collect(provider, LISTING_SCHEMA);
  assert.equal(text, LISTING_ANSWER);
  assert.ok(fragments >= 5);
  const body = sent[0]!.body;
  assert.equal(sent[0]!.url, "http://ollama:11434/api/chat");
  assert.equal(body.think, false);
  assert.equal(body.keep_alive, "30m");
  assert.deepEqual(body.format, LISTING_SCHEMA);
  assert.equal((body.options as { num_ctx: number }).num_ctx, 6144);
  assert.equal(normaliseListing(JSON.parse(text)).company, "Aster Care");
});

test("ollama: errors name what to check", async () => {
  const missing = build(
    ollamaSettings,
    mockFetch(() => ({ status: 404, body: '{"error":"model \\"qwen3.5:4b\\" not found"}' })).fetch,
  );
  const notFound = await modelError(collect(missing, LISTING_SCHEMA));
  assert.equal(notFound.code, "model_not_found");
  assert.match(notFound.message, /^model_unavailable: /);
  assert.match(notFound.hint, /ollama pull qwen3\.5:4b/);

  const down = await modelError(collect(build(ollamaSettings, refused), LISTING_SCHEMA));
  assert.equal(down.code, "unreachable");
  assert.match(down.hint, /LLM_BASE_URL/);

  const midStream = build(
    ollamaSettings,
    mockFetch(() => ({ body: '{"message":{"content":"{\\"ti"}}\n{"error":"out of memory"}\n' }))
      .fetch,
  );
  assert.equal((await modelError(collect(midStream, LISTING_SCHEMA))).code, "provider_error");

  const cut = build(ollamaSettings, mockFetch(() => ({ body: ollamaStream("{", "length") })).fetch);
  const truncated = await modelError(collect(cut, LISTING_SCHEMA));
  assert.equal(truncated.code, "truncated");
  assert.match(truncated.message, /^model_failed: /);
});

test("ollama: availability comes from the installed models", async () => {
  const tags = mockFetch(() => ({ body: '{"models":[{"name":"qwen3.5:4b"}]}' }));
  assert.equal(await build(ollamaSettings, tags.fetch).modelAvailable(), true);
  assert.equal(tags.sent[0]!.url, "http://ollama:11434/api/tags");
  const other = mockFetch(() => ({ body: '{"models":[{"name":"llama3:8b"}]}' }));
  assert.equal(await build(ollamaSettings, other.fetch).modelAvailable(), false);
  assert.equal(await build(ollamaSettings, refused).modelAvailable(), false);
});

// ---------------------------------------------------------------------------------------
// OpenAI (hosted)

test("openai: streams JSON-schema output from Chat Completions", async () => {
  const { fetch: fetcher, sent } = mockFetch(() => ({
    body: openAIStream(LISTING_ANSWER),
    pieces: 11,
    contentType: SSE,
  }));
  const { text } = await collect(build(openaiSettings, fetcher), LISTING_SCHEMA);
  assert.equal(text, LISTING_ANSWER);
  const request = sent[0]!;
  assert.equal(request.url, "https://api.openai.com/v1/chat/completions");
  assert.equal(request.headers.get("authorization"), "Bearer sk-test");
  assert.equal(request.body.stream, true);
  const format = request.body.response_format as {
    type: string;
    json_schema: { strict: boolean; schema: Record<string, unknown> };
  };
  assert.equal(format.type, "json_schema");
  assert.equal(format.json_schema.strict, true);
  assert.deepEqual(format.json_schema.schema, strictSchema(LISTING_SCHEMA));
  // Nothing of the local runtimes reaches the hosted API.
  for (const field of ["think", "keep_alive", "options", "chat_template_kwargs", "temperature"]) {
    assert.ok(!(field in request.body), `unexpected ${field}`);
  }
  assert.deepEqual(
    (request.body.messages as { role: string }[]).map((m) => m.role),
    ["system", "user"],
  );
});

test("openai: errors and stop reasons become actionable ModelErrors", async () => {
  const status = (code: number, body: object) =>
    build(openaiSettings, mockFetch(() => ({ status: code, body: JSON.stringify(body) })).fetch);
  const auth = await modelError(
    collect(
      status(401, { error: { message: "Incorrect API key", type: "invalid_request_error" } }),
      LISTING_SCHEMA,
    ),
  );
  assert.equal(auth.code, "auth");
  assert.match(auth.hint, /OPENAI_API_KEY/);
  assert.equal(
    (
      await modelError(
        collect(
          status(404, { error: { message: "model gpt-test does not exist" } }),
          LISTING_SCHEMA,
        ),
      )
    ).code,
    "model_not_found",
  );
  assert.equal(
    (
      await modelError(
        collect(status(429, { error: { message: "Rate limit reached" } }), LISTING_SCHEMA),
      )
    ).code,
    "rate_limited",
  );
  assert.equal(
    (
      await modelError(
        collect(
          status(400, {
            error: {
              message: "too long",
              code: "context_length_exceeded",
              type: "invalid_request_error",
            },
          }),
          LISTING_SCHEMA,
        ),
      )
    ).code,
    "context_length",
  );
  assert.equal(
    (await modelError(collect(status(500, { error: { message: "server error" } }), LISTING_SCHEMA)))
      .code,
    "provider_error",
  );
  const long = build(
    openaiSettings,
    mockFetch(() => ({ body: openAIStream('{"ti', "length"), contentType: SSE })).fetch,
  );
  assert.equal((await modelError(collect(long, LISTING_SCHEMA))).code, "truncated");
  const refusal = `data: ${JSON.stringify({
    id: "c",
    object: "chat.completion.chunk",
    created: 1,
    model: "m",
    choices: [{ index: 0, delta: { refusal: "I can't help with that." }, finish_reason: null }],
  })}\n\ndata: [DONE]\n\n`;
  const declined = build(
    openaiSettings,
    mockFetch(() => ({ body: refusal, contentType: SSE })).fetch,
  );
  assert.equal((await modelError(collect(declined, LISTING_SCHEMA))).code, "refused");
});

// ---------------------------------------------------------------------------------------
// Local, OpenAI-compatible (vLLM)

test("vllm: reuses the OpenAI transport with the local server's own fields", async () => {
  const { fetch: fetcher, sent } = mockFetch(() => ({
    body: openAIStream(FIT_ANSWER),
    pieces: 7,
    contentType: SSE,
  }));
  const provider = build(vllmSettings, fetcher);
  const fragments: string[] = [];
  const messages = fitMessages(
    [
      { requirement: "Kotlin", kind: "required" as const },
      { requirement: "FHIR R4", kind: "preferred" as const },
    ],
    [
      {
        id: "a".repeat(24),
        organization: "Juniper Health",
        role: "Mobile Engineer",
        start: "2023-01",
        end: null,
        contribution: "Kotlin.",
        skills: ["Kotlin"],
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
      },
    ],
  );
  for await (const fragment of provider.streamStructured({ messages, schema: FIT_SCHEMA })) {
    fragments.push(fragment);
  }
  const request = sent[0]!;
  assert.equal(request.url, "http://192.168.178.50:8000/v1/chat/completions");
  assert.equal(request.body.model, "Qwen/Qwen3-14B-AWQ");
  assert.equal(request.body.temperature, 0);
  assert.deepEqual(request.body.chat_template_kwargs, { enable_thinking: false });
  // No output limit: vLLM then uses what is left of its context, so short requests fit 4,096.
  assert.ok(!("max_tokens" in request.body) && !("max_completion_tokens" in request.body));
  for (const field of ["think", "keep_alive", "options"]) {
    assert.ok(!(field in request.body), `unexpected ${field}`);
  }
  const findings = normaliseFindings(
    JSON.parse(fragments.join("")),
    [
      { requirement: "Kotlin", kind: "required" as const },
      { requirement: "FHIR R4", kind: "preferred" as const },
    ],
    new Map([["E01", "a".repeat(24)]]),
  );
  assert.deepEqual(
    findings.map((finding) => finding.status),
    ["confirmed", "missing"],
  );
});

test("vllm: a request beyond the 4,096-token context and an unreachable notebook are reported", async () => {
  const tooLong = build(
    vllmSettings,
    mockFetch(() => ({
      status: 400,
      body: JSON.stringify({
        object: "error",
        message:
          "This model's maximum context length is 4096 tokens. However, you requested 5210 tokens (5210 in the messages, 0 in the completion).",
        type: "BadRequestError",
        code: 400,
      }),
    })).fetch,
  );
  const context = await modelError(collect(tooLong, LISTING_SCHEMA));
  assert.equal(context.code, "context_length");
  assert.match(context.detail, /4096 tokens/);

  const down = await modelError(collect(build(vllmSettings, refused), LISTING_SCHEMA));
  assert.equal(down.code, "unreachable");
  assert.match(down.hint, /192\.168\.178\.50:8000/);
});

test("vllm: the output limit uses max_tokens and availability reads the model list", async () => {
  const { fetch: fetcher, sent } = mockFetch((request) =>
    request.url.endsWith("/models")
      ? {
          body: JSON.stringify({
            object: "list",
            data: [{ id: "Qwen/Qwen3-14B-AWQ", object: "model", created: 1, owned_by: "vllm" }],
          }),
        }
      : { body: openAIStream("{}"), contentType: SSE },
  );
  const provider = build({ ...vllmSettings, maxOutputTokens: 1024 }, fetcher);
  assert.equal(await provider.modelAvailable(), true);
  assert.equal(sent[0]!.url, "http://192.168.178.50:8000/v1/models");
  await collect(provider, LISTING_SCHEMA);
  assert.equal(sent[1]!.body.max_tokens, 1024);
  const other = build(
    { ...vllmSettings, model: "Qwen/Qwen3-8B" },
    mockFetch(() => ({
      body: JSON.stringify({
        object: "list",
        data: [{ id: "Qwen/Qwen3-14B-AWQ", object: "model", created: 1, owned_by: "vllm" }],
      }),
    })).fetch,
  );
  assert.equal(await other.modelAvailable(), false);
});

// ---------------------------------------------------------------------------------------
// Claude

test("claude: streams structured output from the Messages API", async () => {
  const { fetch: fetcher, sent } = mockFetch(() => ({
    body: claudeStream(LISTING_ANSWER),
    pieces: 13,
    contentType: SSE,
  }));
  const { text } = await collect(build(claudeSettings, fetcher), LISTING_SCHEMA);
  assert.equal(text, LISTING_ANSWER);
  const request = sent[0]!;
  assert.equal(request.url, "https://api.anthropic.com/v1/messages");
  assert.equal(request.headers.get("authorization"), "Bearer sk-ant-test");
  assert.equal(request.body.model, "claude-opus-5-5");
  assert.equal(request.body.max_tokens, 32_000);
  assert.equal(request.body.stream, true);
  assert.match(String(request.body.system), /freelance project listing/);
  assert.deepEqual(
    (request.body.messages as { role: string }[]).map((m) => m.role),
    ["user"],
  );
  assert.deepEqual(request.body.output_config, {
    format: { type: "json_schema", schema: strictSchema(LISTING_SCHEMA) },
  });
  for (const field of ["temperature", "think", "keep_alive", "response_format"]) {
    assert.ok(!(field in request.body), `unexpected ${field}`);
  }
});

test("claude: errors and stop reasons become actionable ModelErrors", async () => {
  const status = (code: number, type: string, message: string) =>
    build(
      claudeSettings,
      mockFetch(() => ({
        status: code,
        body: JSON.stringify({ type: "error", error: { type, message } }),
      })).fetch,
    );
  const auth = await modelError(
    collect(status(401, "authentication_error", "invalid x-api-key"), LISTING_SCHEMA),
  );
  assert.equal(auth.code, "auth");
  assert.match(auth.hint, /ANTHROPIC_API_KEY/);
  assert.equal(
    (await modelError(collect(status(404, "not_found_error", "model: claude-x"), LISTING_SCHEMA)))
      .code,
    "model_not_found",
  );
  assert.equal(
    (await modelError(collect(status(429, "rate_limit_error", "slow down"), LISTING_SCHEMA))).code,
    "rate_limited",
  );
  assert.equal(
    (await modelError(collect(status(529, "overloaded_error", "Overloaded"), LISTING_SCHEMA))).code,
    "provider_error",
  );
  assert.equal(
    (
      await modelError(
        collect(
          status(
            400,
            "invalid_request_error",
            "prompt is too long: 1200000 tokens > 1000000 maximum",
          ),
          LISTING_SCHEMA,
        ),
      )
    ).code,
    "context_length",
  );
  const midStream =
    claudeStream('{"ti').split("event: content_block_stop")[0] +
    sse([{ type: "error", error: { type: "overloaded_error", message: "Overloaded" } }]);
  const broken = build(
    claudeSettings,
    mockFetch(() => ({ body: midStream, contentType: SSE })).fetch,
  );
  assert.equal((await modelError(collect(broken, LISTING_SCHEMA))).code, "provider_error");
  const cut = build(
    claudeSettings,
    mockFetch(() => ({ body: claudeStream('{"ti', "max_tokens"), contentType: SSE })).fetch,
  );
  const truncated = await modelError(collect(cut, LISTING_SCHEMA));
  assert.equal(truncated.code, "truncated");
  assert.match(truncated.hint, /LLM_MAX_OUTPUT_TOKENS/);
  const declined = build(
    claudeSettings,
    mockFetch(() => ({ body: claudeStream("", "refusal"), contentType: SSE })).fetch,
  );
  assert.equal((await modelError(collect(declined, LISTING_SCHEMA))).code, "refused");
  const down = await modelError(collect(build(claudeSettings, refused), LISTING_SCHEMA));
  assert.equal(down.code, "unreachable");
});

test("claude: availability asks the Models API for the configured model", async () => {
  const { fetch: fetcher, sent } = mockFetch(() => ({
    body: JSON.stringify({
      id: "claude-opus-5-5",
      type: "model",
      display_name: "Claude Opus 5.5",
      created_at: "2026-01-01T00:00:00Z",
    }),
  }));
  assert.equal(await build(claudeSettings, fetcher).modelAvailable(), true);
  assert.equal(sent[0]!.url, "https://api.anthropic.com/v1/models/claude-opus-5-5");
  const missing = mockFetch(() => ({
    status: 404,
    body: '{"type":"error","error":{"type":"not_found_error","message":"no"}}',
  }));
  assert.equal(await build(claudeSettings, missing.fetch).modelAvailable(), false);
});

// ---------------------------------------------------------------------------------------
// Cancellation: the signal's own reason comes back, so the queue tells a timeout from a cancel.

for (const [name, settings, body] of [
  [
    "ollama",
    ollamaSettings,
    ollamaStream(LISTING_ANSWER).split("\n").slice(0, 2).join("\n") + "\n",
  ],
  [
    "openai",
    openaiSettings,
    openAIStream(LISTING_ANSWER).split("\n\n").slice(0, 2).join("\n\n") + "\n\n",
  ],
  [
    "vllm",
    vllmSettings,
    openAIStream(LISTING_ANSWER).split("\n\n").slice(0, 2).join("\n\n") + "\n\n",
  ],
  [
    "claude",
    claudeSettings,
    claudeStream(LISTING_ANSWER).split("\n\n").slice(0, 4).join("\n\n") + "\n\n",
  ],
] as const) {
  test(`${name}: aborting mid-stream ends the request with the signal's reason`, async () => {
    const { fetch: fetcher } = mockFetch(() => ({ body, hang: true, contentType: SSE }));
    const provider = build(settings, fetcher);
    const controller = new AbortController();
    const received: string[] = [];
    const reading = (async () => {
      for await (const fragment of provider.streamStructured(
        { messages: listingMessages("x"), schema: LISTING_SCHEMA },
        controller.signal,
      )) {
        received.push(fragment);
        if (received.length === 1) {
          controller.abort(new DOMException("part timed out", "TimeoutError"));
        }
      }
    })();
    const error = await failure(reading);
    assert.ok(received.length >= 1, "fragments arrive before the abort");
    assert.ok(error instanceof DOMException && error.name === "TimeoutError", String(error));

    const early = new AbortController();
    early.abort("cancelled");
    assert.equal(
      await failure(
        (async () => {
          for await (const _ of provider.streamStructured(
            { messages: listingMessages("x"), schema: LISTING_SCHEMA },
            early.signal,
          )) {
            // Nothing arrives.
          }
        })(),
      ),
      "cancelled",
    );
  });
}

// ---------------------------------------------------------------------------------------
// The readers and the queue work the same with every provider.

test("listing and CV readers produce valid suggestions through each provider", async () => {
  for (const [settings, wire, contentType] of [
    [ollamaSettings, ollamaStream, "application/x-ndjson"],
    [openaiSettings, openAIStream, SSE],
    [vllmSettings, openAIStream, SSE],
    [claudeSettings, claudeStream, SSE],
  ] as const) {
    const answers = [LISTING_ANSWER, CV_ANSWER];
    const { fetch: fetcher } = mockFetch(() => ({
      body: wire(answers.shift()!),
      pieces: 17,
      contentType,
    }));
    useInferenceProvider(build(settings, fetcher));
    const listing = await readListing("Listing", new AbortController().signal, () => {});
    assert.equal(listing.terms, "Düsseldorf · 80 % remote · ab März", settings.provider);
    const updates: number[] = [];
    const cv = await readCv("Mara Linden, Köln", new AbortController().signal, (update) =>
      updates.push(update.found),
    );
    assert.equal(cv.references[0]!.organization, "Kite Transit AG");
    assert.equal(cv.profile.location, "Köln");
    assert.ok(updates.includes(1), "progress counts references while the answer streams");
  }
  assert.ok(cvMessages("x").length === 2 && CV_SCHEMA.type === "object");
});

test("the queue reports setup problems as model_unavailable and broken answers as unreadable", async () => {
  const jobs = new ModelJobs();
  const outcome = async (error: unknown) => {
    const job = jobs.start("a", "cv", async () => {
      throw error;
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    return jobs.get("a", "cv", job.id).error;
  };
  const warn = console.warn;
  const logged: string[] = [];
  console.warn = (line: string) => logged.push(line);
  try {
    assert.equal(
      await outcome(new ModelError("auth", "check OPENAI_API_KEY")),
      "model_unavailable",
    );
    assert.equal(await outcome(new ModelError("context_length", "shorter input")), "unreadable");
    assert.equal(await outcome(new DOMException("t", "TimeoutError")), "timeout");
  } finally {
    console.warn = warn;
  }
  assert.equal(logged.length, 2);
  assert.match(logged[0]!, /model_unavailable: auth \| check OPENAI_API_KEY/);
});

// ---------------------------------------------------------------------------------------
// Configuration

test("configuration selects the provider, and OLLAMA_* alone still means Ollama", () => {
  const legacy = inferenceSettings({
    OLLAMA_URL: "http://ollama:11434",
    OLLAMA_MODEL: "qwen3.5:4b",
    OLLAMA_KEEP_ALIVE: "10m",
  });
  assert.deepEqual(legacy, {
    settings: {
      provider: "local",
      protocol: "ollama",
      baseUrl: "http://ollama:11434",
      model: "qwen3.5:4b",
      keepAlive: "10m",
    },
    problems: [],
  });
  assert.deepEqual(inferenceSettings({}).settings, {
    provider: "local",
    protocol: "ollama",
    baseUrl: "http://127.0.0.1:11434",
    model: "qwen3.5:4b",
    keepAlive: "30m",
  });

  const notebook = inferenceSettings({
    LLM_PROVIDER: "local",
    LLM_LOCAL_PROTOCOL: "openai-compatible",
    LLM_BASE_URL: "http://192.168.178.50:8000/v1",
    LLM_MODEL: "Qwen/Qwen3-14B-AWQ",
    // Left over from the Ollama setup; ignored for this protocol.
    OLLAMA_URL: "http://ollama:11434",
  });
  assert.deepEqual(notebook, { settings: vllmSettings, problems: [] });

  assert.deepEqual(
    inferenceSettings({
      LLM_PROVIDER: "claude",
      LLM_MODEL: "claude-opus-5-5",
      ANTHROPIC_API_KEY: "k",
    }).settings,
    { provider: "claude", model: "claude-opus-5-5", apiKey: "k", maxOutputTokens: 32_000 },
  );
  assert.deepEqual(
    inferenceSettings({
      LLM_PROVIDER: "openai",
      LLM_MODEL: "gpt-x",
      OPENAI_API_KEY: "k",
      LLM_MAX_OUTPUT_TOKENS: "4000",
    }).settings,
    { provider: "openai", model: "gpt-x", apiKey: "k", maxOutputTokens: 4000 },
  );

  const problems = (env: NodeJS.ProcessEnv) => inferenceSettings(env).problems.join("; ");
  assert.match(problems({ LLM_PROVIDER: "gemini" }), /LLM_PROVIDER must be one of/);
  assert.match(
    problems({ LLM_PROVIDER: "claude", LLM_MODEL: "m" }),
    /ANTHROPIC_API_KEY is required/,
  );
  assert.match(
    problems({ LLM_PROVIDER: "openai", OPENAI_API_KEY: "secret-value" }),
    /LLM_MODEL is required/,
  );
  assert.doesNotMatch(
    problems({ LLM_PROVIDER: "openai", OPENAI_API_KEY: "secret-value" }),
    /secret-value/,
  );
  assert.match(
    problems({ LLM_PROVIDER: "local", LLM_LOCAL_PROTOCOL: "openai-compatible", LLM_MODEL: "m" }),
    /LLM_BASE_URL must be/,
  );
  assert.match(
    problems({ LLM_PROVIDER: "local", LLM_LOCAL_PROTOCOL: "grpc" }),
    /LLM_LOCAL_PROTOCOL/,
  );
  assert.match(problems({ LLM_MAX_OUTPUT_TOKENS: "lots" }), /positive whole number/);
});

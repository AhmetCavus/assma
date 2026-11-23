import {
  APPLICATION_LIMITS,
  ASSISTANT_LIMITS,
  FIT_LIMITS,
  assistantRequestSchema,
  cleanLine,
  cleanText,
  unexpectedContacts,
  type AssistantAction,
  type AssistantAnswer,
  type AssistantJob,
  type AssistantRequest,
  type NavigationTarget,
} from "@assma/shared";
import type { Account } from "../platform/access.js";
import { inference, ModelError } from "../platform/inference/provider.js";
import { modelJobs, type JobProgress, type JobView } from "../platform/modelJobs.js";
import { RateLimiter } from "../platform/rateLimit.js";
import { buildContext, type AssistantContext } from "./assistant.context.js";
import { answerSchema, assistantMessages, targetsFor } from "./assistant.prompt.js";

// Talking means many short requests.
const questionsPerAccount = new RateLimiter(120, 60 * 60 * 1000);
const ANSWER_TIMEOUT_MS = 4 * 60 * 1000;
/** One conversation per person; a new question replaces an unanswered one. */
const KIND = "assistant";

/**
 * The value of the top-level "reply" field as far as it has been written, so the page can
 * show it while the model is still working. Partial escapes at the end are left out.
 */
export function partialReply(json: string): string {
  const start = /"reply"\s*:\s*"/.exec(json);
  if (!start) {
    return "";
  }
  let text = "";
  for (let index = start.index + start[0].length; index < json.length; index += 1) {
    const character = json[index]!;
    if (character === '"') {
      break;
    }
    if (character !== "\\") {
      text += character;
      continue;
    }
    const next = json[index + 1];
    if (next === undefined) {
      break;
    }
    if (next === "u") {
      const hex = json.slice(index + 2, index + 6);
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
        break;
      }
      text += String.fromCharCode(parseInt(hex, 16));
      index += 5;
      continue;
    }
    text += { n: "\n", t: " ", r: "", b: "", f: "" }[next] ?? next;
    index += 1;
  }
  return text;
}

/** Turns the model's JSON into an answer the page can act on. Model output is untrusted. */
export function normaliseAnswer(
  raw: unknown,
  request: AssistantRequest,
  context: Pick<AssistantContext, "known">,
  targets: readonly NavigationTarget[],
): AssistantAnswer | null {
  const data = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const reply = cleanText(data.reply, ASSISTANT_LIMITS.reply);
  const offered = new Set<string>(request.services);
  const kind = typeof data.action === "string" ? data.action : "none";
  let action: AssistantAction = { kind: "none" };

  if (kind === "navigate" && targets.includes(data.target as NavigationTarget)) {
    action = { kind: "navigate", target: data.target as NavigationTarget };
  } else if (kind === "revise_email" && offered.has(kind)) {
    const subject = cleanLine(data.subject, APPLICATION_LIMITS.subject);
    const message = cleanText(data.message, APPLICATION_LIMITS.message);
    if (message) {
      action = {
        kind,
        // An empty subject keeps the person's own.
        subject: subject || request.context.email?.subject || "",
        message,
        unexpected: unexpectedContacts(`${subject}\n${message}`, context.known),
      };
    }
  } else if (kind === "revise_summary" && offered.has(kind)) {
    const summary = cleanText(data.summary, FIT_LIMITS.summary);
    if (summary) {
      action = { kind, summary, unexpected: unexpectedContacts(summary, context.known) };
    }
  } else if (kind === "assess_fit" && offered.has(kind)) {
    action = { kind };
  } else if (kind === "add_note" && offered.has(kind)) {
    const text = cleanText(data.note, APPLICATION_LIMITS.eventText);
    if (text) {
      action = { kind, text };
    }
  }
  if (!reply && action.kind === "none") {
    return null;
  }
  return { reply, action };
}

/** The model step for a request whose context has been read. */
export async function respond(
  request: AssistantRequest,
  context: AssistantContext,
  signal: AbortSignal,
  progress: (update: JobProgress) => void,
): Promise<AssistantAnswer> {
  const targets = targetsFor(context.project !== null);
  let output = "";
  let shown = "";
  try {
    for await (const delta of inference().streamStructured(
      {
        messages: assistantMessages(request, context, targets),
        schema: answerSchema(request.services, targets),
      },
      AbortSignal.any([signal, AbortSignal.timeout(ANSWER_TIMEOUT_MS)]),
    )) {
      output += delta;
      const reply = partialReply(output);
      if (reply !== shown) {
        shown = reply;
        progress({ found: 0, part: 0, parts: 1, text: reply });
      }
    }
  } catch (error) {
    // A model stuck after its last field usually has everything that matters.
    if (!(error instanceof ModelError && error.code === "repetition")) {
      throw error;
    }
    output = `${output.trimEnd().replace(/,$/, "")}}`;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(output);
  } catch {
    throw new Error("unreadable");
  }
  const result = normaliseAnswer(raw, request, context, targets);
  if (!result) {
    throw new Error("unreadable");
  }
  return result;
}

function toJob(view: JobView<AssistantAnswer>): AssistantJob {
  return {
    id: view.id,
    state: view.state,
    position: view.position,
    startedAt: view.startedAt,
    partial: view.progress.text ?? "",
    answer: view.result,
    error: view.error,
  };
}

export async function ask(account: Account, input: unknown): Promise<AssistantJob> {
  const request = assistantRequestSchema.parse(input);
  questionsPerAccount.attempt(account.id);
  return toJob(
    modelJobs.start(account.id, KIND, async (signal, progress) =>
      respond(request, await buildContext(account, request), signal, progress),
    ),
  );
}

export async function job(account: Account, id: string): Promise<AssistantJob> {
  return toJob(modelJobs.get<AssistantAnswer>(account.id, KIND, id));
}

export async function cancel(account: Account, id: string) {
  return modelJobs.cancel(account.id, KIND, id);
}

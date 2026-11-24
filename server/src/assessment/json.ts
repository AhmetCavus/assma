import { inference, ModelError, type StructuredRequest } from "../platform/inference/provider.js";

/**
 * Closes JSON the model stopped writing in the middle: open strings, arrays and objects are
 * closed and a dangling comma or key is dropped. The result may still be invalid; callers
 * parse it and handle failure.
 */
export function closeJson(text: string): string {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (const character of text) {
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
    } else if (character === "{" || character === "[") {
      stack.push(character === "{" ? "}" : "]");
    } else if (character === "}" || character === "]") {
      stack.pop();
    }
  }
  let result = text.trimEnd();
  if (inString) {
    result += '"';
  }
  // A trailing comma, colon or key without value cannot be completed sensibly.
  result = result.replace(/,\s*("[^"]*"\s*:?\s*)?$/, "").replace(/:\s*$/, ': ""');
  return result + stack.reverse().join("");
}

/**
 * Streams one structured answer and parses it. A model stuck after its answer (repeated
 * whitespace) still yields what it wrote. Returns null when the answer cannot be read;
 * model errors such as an unreachable model are thrown.
 */
export async function structuredAnswer(
  request: StructuredRequest,
  signal: AbortSignal,
): Promise<unknown | null> {
  let output = "";
  try {
    for await (const delta of inference().streamStructured(request, signal)) {
      output += delta;
    }
  } catch (error) {
    if (!(error instanceof ModelError && error.code === "repetition")) {
      throw error;
    }
  }
  for (const candidate of [output, closeJson(output)]) {
    try {
      return JSON.parse(candidate) as unknown;
    } catch {
      // Try the next repair.
    }
  }
  return null;
}

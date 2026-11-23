import type { JsonSchema } from "./provider.js";

/**
 * The schema in the strict form that OpenAI's and Anthropic's structured outputs require:
 * every object closes with `additionalProperties: false`. assma's schemas already list every
 * property as required. The input is not changed.
 */
export function strictSchema(schema: JsonSchema): Record<string, unknown> {
  return close(schema) as Record<string, unknown>;
}

function close(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map(close);
  }
  if (node === null || typeof node !== "object") {
    return node;
  }
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    result[key] =
      key === "properties" && value && typeof value === "object"
        ? Object.fromEntries(Object.entries(value).map(([name, child]) => [name, close(child)]))
        : key === "items"
          ? close(value)
          : value;
  }
  if (result.type === "object" && !("additionalProperties" in result)) {
    result.additionalProperties = false;
  }
  return result;
}

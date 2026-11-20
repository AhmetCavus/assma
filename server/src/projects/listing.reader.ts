import { normaliseListing, type ListingSuggestions } from "@assma/shared";
import { contextFor } from "../experience/cvImport.prompt.js";
import type { JobProgress } from "../platform/modelJobs.js";
import { streamStructured } from "../platform/ollama.js";
import { LISTING_SCHEMA, listingMessages } from "./listing.prompt.js";

const LISTING_TIMEOUT_MS = 10 * 60 * 1000;

/** Reads one listing (at most 30,000 characters) in a single pass. */
export async function readListing(
  text: string,
  signal: AbortSignal,
  progress: (update: JobProgress) => void,
): Promise<ListingSuggestions> {
  progress({ found: 0, part: 1, parts: 1 });
  let output = "";
  for await (const delta of streamStructured(
    listingMessages(text),
    LISTING_SCHEMA,
    { numCtx: contextFor(text) },
    AbortSignal.any([signal, AbortSignal.timeout(LISTING_TIMEOUT_MS)]),
  )) {
    output += delta;
  }
  try {
    return normaliseListing(JSON.parse(output));
  } catch {
    throw new Error("unreadable");
  }
}

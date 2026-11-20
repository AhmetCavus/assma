import {
  mergeSuggestions,
  normaliseSuggestions,
  splitCvText,
  type CvSuggestions,
} from "@assma/shared";
import { streamStructured } from "../platform/ollama.js";
import type { JobProgress } from "../platform/modelJobs.js";

export type CvReader = (
  text: string,
  signal: AbortSignal,
  progress: (update: JobProgress) => void,
) => Promise<CvSuggestions>;
import { contextFor, CV_SCHEMA, cvMessages } from "./cvImport.prompt.js";

/**
 * One part may take this long. Writing dominates (about 10–12 seconds per position on the
 * shared CPU), so a 12,000-character part dense with short positions can need 7–10 minutes.
 */
const PART_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * Reads the CV part by part, streaming the model's JSON and counting references as they
 * appear, then merges the parts. A part the model cannot answer as JSON is skipped unless it
 * is the only one.
 */
export const readCv: CvReader = async (text, signal, progress) => {
  const parts = splitCvText(text);
  const results: CvSuggestions[] = [];
  let found = 0;
  for (const [index, part] of parts.entries()) {
    progress({ found, part: index + 1, parts: parts.length });
    const partSignal = AbortSignal.any([signal, AbortSignal.timeout(PART_TIMEOUT_MS)]);
    let output = "";
    for await (const delta of streamStructured(
      cvMessages(part, index + 1, parts.length),
      CV_SCHEMA,
      { numCtx: contextFor(part) },
      partSignal,
    )) {
      output += delta;
      const current = (output.match(/"organization"\s*:/g) ?? []).length;
      progress({ found: found + current, part: index + 1, parts: parts.length });
    }
    try {
      results.push(normaliseSuggestions(JSON.parse(output)));
    } catch {
      continue;
    }
    found = mergeSuggestions(results).references.length;
  }
  if (results.length === 0) {
    throw new Error("unreadable");
  }
  return mergeSuggestions(results);
};

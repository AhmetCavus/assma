/**
 * Checks the configured model end to end, with the same settings and code path as the API:
 *
 *   docker exec assma-api node dist/scripts/inferenceSmoke.js
 *
 * Settings can be overridden per run with `docker exec -e LLM_PROVIDER=… assma-api …`.
 * It sends one short sample listing (no personal data), streams the answer and validates it
 * like a real listing capture. Exit code 0 means the provider works for assma.
 */
import { normaliseListing } from "@assma/shared";
import {
  createInferenceProvider,
  describeSettings,
  inferenceSettings,
} from "../platform/inference/config.js";
import { ModelError } from "../platform/inference/provider.js";
import { LISTING_SCHEMA, listingMessages } from "../projects/listing.prompt.js";

const SAMPLE = `Senior Android Engineer (m/w/d) – Freelance
Für unseren Kunden Aster Care suchen wir ab März einen Android-Entwickler.
Muss: Kotlin und Jetpack Compose, Offline-first. Wünschenswert: FHIR R4.
Düsseldorf, 80 % remote, 6 Monate. Kontakt: Jonas Klein, jonas.klein@northline.example`;

const fail = (message: string): never => {
  console.error(`FAILED: ${message}`);
  process.exit(1);
};

const { settings, problems } = inferenceSettings(process.env);
if (!settings) {
  fail(`configuration: ${problems.join("; ")}`);
}
const provider = createInferenceProvider(settings!);
console.log(`provider: ${describeSettings(settings!)}`);

const available = await provider.modelAvailable(AbortSignal.timeout(10_000));
console.log(`model listed: ${available ? "yes" : "no"}`);

const started = Date.now();
let firstAt = 0;
let fragments = 0;
let output = "";
try {
  for await (const fragment of provider.streamStructured(
    { messages: listingMessages(SAMPLE), schema: LISTING_SCHEMA },
    AbortSignal.timeout(5 * 60 * 1000),
  )) {
    firstAt ||= Date.now();
    fragments += 1;
    output += fragment;
  }
} catch (error) {
  fail(error instanceof ModelError ? error.describe() : String(error));
}
const done = Date.now();
console.log(
  `streamed: ${fragments} fragments, first after ${firstAt ? firstAt - started : "-"} ms, all after ${done - started} ms`,
);

let listing: ReturnType<typeof normaliseListing>;
try {
  listing = normaliseListing(JSON.parse(output));
} catch {
  fail(`the answer is not valid listing JSON: ${output.slice(0, 300)}`);
}
console.log(JSON.stringify(listing!, null, 2));
if (!listing!.title || listing!.required.length === 0) {
  fail("the JSON is valid but title or requirements are empty");
}
if (!available) {
  console.warn("warning: the answer works, but the model list does not name LLM_MODEL exactly");
}
console.log("OK: the provider answers with schema-valid JSON.");

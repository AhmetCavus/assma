/**
 * Turns a fetched listing page into plain text for the model and the saved brief. Job sites
 * often embed a schema.org JobPosting as JSON-LD; when present it is the cleanest source.
 */

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  auml: "ä",
  ouml: "ö",
  uuml: "ü",
  Auml: "Ä",
  Ouml: "Ö",
  Uuml: "Ü",
  szlig: "ß",
  euro: "€",
  ndash: "–",
  mdash: "—",
  bull: "•",
  middot: "·",
  hellip: "…",
  laquo: "«",
  raquo: "»",
  bdquo: "„",
  ldquo: "“",
  rdquo: "”",
  lsquo: "‘",
  rsquo: "’",
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const code =
        entity[1]?.toLowerCase() === "x"
          ? parseInt(entity.slice(2), 16)
          : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : match;
    }
    return ENTITIES[entity] ?? match;
  });
}

/** Block elements become line breaks, list items get a dash, everything else is dropped. */
export function htmlToText(html: string): string {
  const text = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(
      /<(script|style|noscript|svg|template|iframe|head|nav|footer|form)\b[\s\S]*?<\/\1\s*>/gi,
      " ",
    )
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(
      /<\/?(p|div|section|article|header|main|aside|h[1-6]|ul|ol|li|tr|table|dl|dt|dd|blockquote|pre)\b[^>]*>/gi,
      "\n",
    )
    .replace(/<[^>]+>/g, " ");
  return tidy(decodeEntities(text));
}

export function tidy(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t ​]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

type JobPosting = Record<string, unknown>;

function findPosting(value: unknown, depth = 0): JobPosting | null {
  if (!value || typeof value !== "object" || depth > 4) {
    return null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findPosting(item, depth + 1);
      if (found) {
        return found;
      }
    }
    return null;
  }
  const record = value as Record<string, unknown>;
  const type = record["@type"];
  if (type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"))) {
    return record;
  }
  return findPosting(record["@graph"], depth + 1);
}

const str = (value: unknown) => (typeof value === "string" ? value : "");

function placeOf(posting: JobPosting): string {
  const locations = Array.isArray(posting.jobLocation)
    ? posting.jobLocation
    : [posting.jobLocation];
  return locations
    .map((location) => {
      const address = (location as { address?: Record<string, unknown> } | undefined)?.address;
      return address
        ? [str(address.addressLocality), str(address.addressCountry)].filter(Boolean).join(", ")
        : "";
    })
    .filter(Boolean)
    .join("; ");
}

/** The JobPosting embedded as JSON-LD, as readable text, or null when there is none. */
export function jobPostingText(html: string): string | null {
  const scripts = html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const [, json] of scripts) {
    let posting: JobPosting | null = null;
    try {
      posting = findPosting(JSON.parse(json!.trim()));
    } catch {
      continue;
    }
    if (!posting) {
      continue;
    }
    const organization = posting.hiringOrganization as Record<string, unknown> | undefined;
    const lines = [
      str(posting.title),
      organization ? str(organization.name) : "",
      placeOf(posting),
      posting.jobLocationType === "TELECOMMUTE" ? "Remote" : "",
      str(posting.employmentType),
      "",
      htmlToText(decodeEntities(str(posting.description))),
      str(posting.skills) ? `\nSkills: ${str(posting.skills)}` : "",
    ];
    const text = tidy(lines.join("\n"));
    if (text.length >= 40) {
      return text;
    }
  }
  return null;
}

/** The listing's text: the JobPosting if the page has one, otherwise the main content. */
export function listingText(body: string, contentType: string): string {
  if (/^text\/plain/i.test(contentType)) {
    return tidy(body);
  }
  const posting = jobPostingText(body);
  if (posting) {
    return posting;
  }
  const main =
    /<main\b[\s\S]*?<\/main>/i.exec(body)?.[0] ?? /<article\b[\s\S]*?<\/article>/i.exec(body)?.[0];
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(body)?.[1];
  const text = htmlToText(main ?? /<body\b[\s\S]*<\/body>/i.exec(body)?.[0] ?? body);
  return tidy([title ? decodeEntities(title) : "", text].join("\n\n"));
}

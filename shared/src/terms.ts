/**
 * Matching of skill and requirement terms written in different ways: case, accents,
 * punctuation and a few common aliases. Matching is deliberately conservative — a miss leads
 * to "unverified" or "unknown", never to a false "fulfilled".
 */

const ALIASES: Record<string, string> = {
  k8s: "kubernetes",
  js: "javascript",
  ts: "typescript",
  golang: "go",
  postgres: "postgresql",
  "node js": "node",
  nodejs: "node",
  "react js": "react",
  reactjs: "react",
  "vue js": "vue",
  vuejs: "vue",
  "c sharp": "c#",
  "gitlab ci cd": "gitlab ci",
  "github action": "github actions",
  "ci cd": "ci/cd",
  cicd: "ci/cd",
  "amazon web services": "aws",
  "google cloud platform": "gcp",
  "google cloud": "gcp",
  "microsoft azure": "azure",
};

/** Lower case, no accents, punctuation as spaces except the characters that name things (#, +, /). */
export function foldTerm(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}#+/]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The canonical form of a term, with aliases resolved. */
export function canonicalTerm(value: string): string {
  const folded = foldTerm(value);
  return ALIASES[folded] ?? folded;
}

/** Same thing, written differently. */
export function sameTerm(a: string, b: string): boolean {
  const left = canonicalTerm(a);
  return left !== "" && left === canonicalTerm(b);
}

/**
 * Whether `text` mentions `term` as whole words: "GitLab CI/CD" mentions "GitLab", but
 * "JavaScript" does not mention "Java".
 */
export function mentionsTerm(text: string, term: string): boolean {
  const needle = canonicalTerm(term);
  if (!needle) {
    return false;
  }
  const haystack = ` ${foldTerm(text)} `;
  const variants = new Set([needle, foldTerm(term)]);
  for (const [alias, canonical] of Object.entries(ALIASES)) {
    if (canonical === needle) {
      variants.add(alias);
    }
  }
  return [...variants].some((variant) => variant && haystack.includes(` ${variant} `));
}

/** Whether a listed skill stands for the term: the same, or the term as whole words of it. */
export function skillMatches(skill: string, term: string): boolean {
  return sameTerm(skill, term) || mentionsTerm(skill, term);
}

// ---------------------------------------------------------------------------------------
// Spoken languages.

const LANGUAGE_CODES: Record<string, string> = {
  deutsch: "de",
  german: "de",
  englisch: "en",
  english: "en",
  franzosisch: "fr",
  french: "fr",
  francais: "fr",
  spanisch: "es",
  spanish: "es",
  espanol: "es",
  italienisch: "it",
  italian: "it",
  niederlandisch: "nl",
  dutch: "nl",
  hollandisch: "nl",
  polnisch: "pl",
  polish: "pl",
  turkisch: "tr",
  turkish: "tr",
  russisch: "ru",
  russian: "ru",
  portugiesisch: "pt",
  portuguese: "pt",
  arabisch: "ar",
  arabic: "ar",
  chinesisch: "zh",
  chinese: "zh",
  mandarin: "zh",
  japanisch: "ja",
  japanese: "ja",
};

/** "Deutsch", "German" and "deutsch (Muttersprache)" all name the same language. */
export function sameLanguage(a: string, b: string): boolean {
  const code = (value: string) => {
    const folded = foldTerm(value).split(" ")[0] ?? "";
    return LANGUAGE_CODES[folded] ?? folded;
  };
  const left = code(a);
  return left !== "" && left === code(b);
}

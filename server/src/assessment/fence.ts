/**
 * Puts third-party or personal text between tags so the model treats it as data. Tags in
 * the text itself are neutralised, so a listing cannot close its own section or open one
 * of ours.
 */
const ANY_TAG = /<\s*\/?\s*[a-z_][a-z0-9_-]*\b[^>]*>/gi;

export function fenced(tag: string, text: string): string {
  const neutral = text.replace(ANY_TAG, (match) => match.replace(/</g, "‹").replace(/>/g, "›"));
  return `<${tag}>\n${neutral}\n</${tag}>`;
}

import assert from "node:assert/strict";
import { test } from "node:test";
import { markdownPlainText, parseInline, parseMarkdown, toMarkdown } from "../src/index.ts";

test("paragraphs, line breaks and lists", () => {
  const blocks = parseMarkdown(
    "Led the **check-in** rewrite.\nShipped in 3 months.\n\n- Kotlin and *Compose*\n- Offline sync\n  with retries\n\n1. Plan\n2. Build",
  );
  assert.deepEqual(blocks, [
    {
      type: "paragraph",
      inlines: [
        { text: "Led the " },
        { text: "check-in", bold: true },
        { text: " rewrite.\nShipped in 3 months." },
      ],
    },
    {
      type: "list",
      ordered: false,
      start: 1,
      items: [
        [{ text: "Kotlin and " }, { text: "Compose", italic: true }],
        [{ text: "Offline sync\nwith retries" }],
      ],
    },
    { type: "list", ordered: true, start: 1, items: [[{ text: "Plan" }], [{ text: "Build" }]] },
  ]);
});

test("plain text stays plain", () => {
  for (const text of ["2 * 3 = 6", "snake_case_name", "a * b * c", "#hashtag", "<b>x</b>"]) {
    assert.equal(markdownPlainText(text), text);
  }
});

test("links only for web addresses", () => {
  assert.deepEqual(parseInline("see [the app](https://juniper.example/app)"), [
    { text: "see " },
    { text: "the app", href: "https://juniper.example/app" },
  ]);
  assert.deepEqual(parseInline("[x](javascript:alert(1))"), [{ text: "[x](javascript:alert(1))" }]);
  assert.deepEqual(parseInline("`a*b*`"), [{ text: "a*b*", code: true }]);
});

test("normalised markdown escapes what is not supported", () => {
  const source = "<b>Title</b> with **bold** and [link](https://a.example)\n\n- one\n- *two*";
  assert.equal(
    toMarkdown(parseMarkdown(source)),
    "\\<b\\>Title\\</b\\> with **bold** and [link](<https://a.example>)\n\n- one\n- *two*",
  );
  assert.equal(markdownPlainText(toMarkdown(parseMarkdown(source))), markdownPlainText(source));
});

test("headings up to three levels", () => {
  const blocks = parseMarkdown("# Project\nIntro\n## **Scope** ##\n#### Details");
  assert.deepEqual(blocks, [
    { type: "heading", level: 1, inlines: [{ text: "Project" }] },
    { type: "paragraph", inlines: [{ text: "Intro" }] },
    { type: "heading", level: 2, inlines: [{ text: "Scope", bold: true }] },
    { type: "heading", level: 3, inlines: [{ text: "Details" }] },
  ]);
  assert.equal(toMarkdown(blocks), "# Project\n\nIntro\n\n## **Scope**\n\n### Details");
  assert.equal(markdownPlainText("## Scope\n- a"), "Scope\n\n- a");
});

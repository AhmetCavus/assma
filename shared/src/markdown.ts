/**
 * The small Markdown subset of free-text fields such as a reference's contribution:
 * headings (#, ##, ###), paragraphs, bullet and numbered lists, **bold**, *italic*, `code`
 * and [links](https://…). Everything else (HTML, images, tables) stays plain text, so the same text
 * renders the same in the app, the Markdown export and the PDF, and nothing in it can
 * inject markup.
 */

export type MarkdownInline = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  /** Only http(s) addresses become links. */
  href?: string;
};

export type MarkdownBlock =
  | { type: "heading"; level: 1 | 2 | 3; inlines: MarkdownInline[] }
  | { type: "paragraph"; inlines: MarkdownInline[] }
  | { type: "list"; ordered: boolean; start: number; items: MarkdownInline[][] };

/** Deeper headings (####…) are shown as the smallest level. */
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/;
const BULLET = /^\s{0,3}[-*+]\s+(.*)$/;
const NUMBERED = /^\s{0,3}(\d{1,3})[.)]\s+(.*)$/;

type Style = Pick<MarkdownInline, "bold" | "italic">;

function push(out: MarkdownInline[], text: string, style: Style & { code?: boolean; href?: string }) {
  if (!text) {
    return;
  }
  const last = out[out.length - 1];
  const inline: MarkdownInline = { text };
  if (style.bold) inline.bold = true;
  if (style.italic) inline.italic = true;
  if (style.code) inline.code = true;
  if (style.href) inline.href = style.href;
  if (
    last &&
    !last.code &&
    !inline.code &&
    last.bold === inline.bold &&
    last.italic === inline.italic &&
    last.href === inline.href
  ) {
    last.text += text;
  } else {
    out.push(inline);
  }
}

function safeHref(url: string): string | undefined {
  const trimmed = url.trim().replace(/^<|>$/g, "");
  return /^https?:\/\/[^\s/?#@]+\.[^\s]+$/i.test(trimmed) ? trimmed : undefined;
}

/** Inline emphasis, code and links of one line or list item. */
export function parseInline(source: string, style: Style = {}, href?: string): MarkdownInline[] {
  const out: MarkdownInline[] = [];
  let buffer = "";
  const flush = () => {
    push(out, buffer, { ...style, href });
    buffer = "";
  };
  let index = 0;
  while (index < source.length) {
    const character = source[index]!;
    const rest = source.slice(index);
    if (character === "\\" && index + 1 < source.length && /[\\`*_[\]()#+\-.!<>|]/.test(source[index + 1]!)) {
      buffer += source[index + 1];
      index += 2;
      continue;
    }
    if (character === "`") {
      const end = source.indexOf("`", index + 1);
      if (end > index + 1) {
        flush();
        push(out, source.slice(index + 1, end), { ...style, code: true, href });
        index = end + 1;
        continue;
      }
    }
    if (character === "[" && !href) {
      const link = /^\[([^\]\n]+)\]\(\s*(<[^>\s]+>|[^)\s]+)\s*\)/.exec(rest);
      const target = link ? safeHref(link[2]!) : undefined;
      if (link && target) {
        flush();
        out.push(...parseInline(link[1]!, style, target));
        index += link[0].length;
        continue;
      }
    }
    const marker = /^(\*\*|__|\*|_)/.exec(rest)?.[1];
    if (marker) {
      const strong = marker.length === 2;
      const open = rest.slice(marker.length);
      // `snake_case` and `2 * 3` are text: emphasis needs a closing marker and no space inside.
      const wordInside =
        marker[0] === "_" && index > 0 && /\w/.test(source[index - 1]!);
      const close = open.indexOf(marker, 1);
      if (
        !wordInside &&
        close > 0 &&
        !/^\s/.test(open) &&
        !/\s$/.test(open.slice(0, close)) &&
        (strong ? !style.bold : !style.italic)
      ) {
        flush();
        out.push(
          ...parseInline(
            open.slice(0, close),
            strong ? { ...style, bold: true } : { ...style, italic: true },
            href,
          ),
        );
        index += marker.length + close + marker.length;
        continue;
      }
    }
    buffer += character;
    index += 1;
  }
  flush();
  return out;
}

/** Joins the lines of one paragraph or item: a single line break is kept. */
function inlineLines(lines: string[]): MarkdownInline[] {
  const out: MarkdownInline[] = [];
  lines.forEach((line, index) => {
    if (index > 0) {
      push(out, "\n", {});
    }
    for (const inline of parseInline(line.trim())) {
      out.push(inline);
    }
  });
  // Merge again across the line breaks.
  return out.reduce<MarkdownInline[]>((merged, inline) => {
    push(merged, inline.text, inline);
    return merged;
  }, []);
}

export function parseMarkdown(source: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; start: number; items: string[][] } | null = null;
  const end = () => {
    if (paragraph.length > 0) {
      blocks.push({ type: "paragraph", inlines: inlineLines(paragraph) });
      paragraph = [];
    }
    if (list) {
      blocks.push({
        type: "list",
        ordered: list.ordered,
        start: list.start,
        items: list.items.map(inlineLines),
      });
      list = null;
    }
  };
  for (const line of source.replace(/\r\n?/g, "\n").split("\n")) {
    if (!line.trim()) {
      end();
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      end();
      const inlines = inlineLines([heading[2]!]);
      if (inlines.length > 0) {
        blocks.push({
          type: "heading",
          level: Math.min(heading[1]!.length, 3) as 1 | 2 | 3,
          inlines,
        });
      }
      continue;
    }
    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      if (paragraph.length > 0 || (list && list.ordered !== ordered)) {
        end();
      }
      if (!list) {
        list = { ordered, start: numbered ? Number(numbered[1]) : 1, items: [] };
      }
      list.items.push([(bullet ? bullet[1] : numbered![2])!]);
      continue;
    }
    if (list && /^\s+\S/.test(line)) {
      // An indented line continues the item above it.
      list.items[list.items.length - 1]!.push(line);
      continue;
    }
    if (list) {
      end();
    }
    paragraph.push(line);
  }
  end();
  return blocks.filter((block) =>
    block.type === "list" ? block.items.length > 0 : block.inlines.length > 0,
  );
}

/** The text without any formatting, e.g. for search, previews or assessment prompts. */
export function markdownPlainText(source: string): string {
  return parseMarkdown(source)
    .map((block) =>
      block.type !== "list"
        ? block.inlines.map((inline) => inline.text).join("")
        : block.items
            .map(
              (item, index) =>
                `${block.ordered ? `${block.start + index}.` : "-"} ${item.map((inline) => inline.text).join("")}`,
            )
            .join("\n"),
    )
    .join("\n\n");
}

const escapeText = (text: string) => text.replace(/([\\`*_[\]#|<>])/g, "\\$1");

function inlineMarkdown(inlines: MarkdownInline[]): string {
  return inlines
    .map((inline) => {
      if (inline.code) {
        const body = `\`${inline.text.replace(/`/g, "")}\``;
        return inline.href ? `[${body}](<${inline.href}>)` : body;
      }
      let body = inline.text
        .split("\n")
        .map(escapeText)
        .join("  \n");
      // Emphasis markers around surrounding spaces would not close; keep spaces outside.
      const [, lead, core, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(body)!;
      body = core!;
      if (body && inline.italic) body = `*${body}*`;
      if (body && inline.bold) body = `**${body}**`;
      if (body && inline.href) body = `[${body}](<${inline.href}>)`;
      return `${lead}${body}${trail}`;
    })
    .join("");
}

/** Normalised Markdown of the supported subset, with everything else escaped. */
export function toMarkdown(blocks: MarkdownBlock[]): string {
  return blocks
    .map((block) =>
      block.type === "heading"
        ? `${"#".repeat(block.level)} ${inlineMarkdown(block.inlines).replace(/ {2}\n/g, " ")}`
        : block.type === "paragraph"
        ? inlineMarkdown(block.inlines)
        : block.items
            .map(
              (item, index) =>
                `${block.ordered ? `${block.start + index}.` : "-"} ${inlineMarkdown(item).replace(/ {2}\n/g, "  \n   ")}`,
            )
            .join("\n"),
    )
    .join("\n\n");
}

import { Fragment, type ReactNode } from "react";
import { parseMarkdown, type MarkdownInline } from "@assma/shared";

function Inline({ inline }: { inline: MarkdownInline }) {
  let node: ReactNode = inline.text.split("\n").map((part, index) => (
    <Fragment key={index}>
      {index > 0 && <br />}
      {part}
    </Fragment>
  ));
  if (inline.code) node = <code>{node}</code>;
  if (inline.italic) node = <em>{node}</em>;
  if (inline.bold) node = <strong>{node}</strong>;
  if (inline.href) {
    node = (
      <a href={inline.href} target="_blank" rel="noreferrer noopener">
        {node}
      </a>
    );
  }
  return <>{node}</>;
}

function Inlines({ inlines }: { inlines: MarkdownInline[] }) {
  return (
    <>
      {inlines.map((inline, index) => (
        <Inline key={index} inline={inline} />
      ))}
    </>
  );
}

function HeadingTag({ level, children }: { level: 1 | 2 | 3; children: ReactNode }) {
  const Tag = (["h4", "h5", "h6"] as const)[level - 1]!;
  return <Tag className={`markdown-h${level}`}>{children}</Tag>;
}

/** Renders the Markdown subset of `@assma/shared` as React elements, never as raw HTML. */
export function Markdown({ text, className }: { text: string; className?: string }) {
  return (
    <div className={className ? `markdown ${className}` : "markdown"}>
      {parseMarkdown(text).map((block, index) =>
        block.type === "heading" ? (
          // Inside a card or CV entry, so below the page's own headings.
          <HeadingTag key={index} level={block.level}>
            <Inlines inlines={block.inlines} />
          </HeadingTag>
        ) : block.type === "paragraph" ? (
          <p key={index}>
            <Inlines inlines={block.inlines} />
          </p>
        ) : block.ordered ? (
          <ol key={index} start={block.start}>
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex}>
                <Inlines inlines={item} />
              </li>
            ))}
          </ol>
        ) : (
          <ul key={index}>
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex}>
                <Inlines inlines={item} />
              </li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}

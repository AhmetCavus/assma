import { useId, useLayoutEffect, useRef, useState } from "react";
import type { Copy } from "@assma/shared";
import { Markdown } from "./Markdown";

type Labels = Copy["experience"]["markdown"];

/**
 * A textarea for the Markdown subset, with buttons that insert the syntax and a preview.
 * It is not wrapped in a <label>: the label would forward clicks to the first button.
 */
export function MarkdownField({
  label,
  hint,
  error,
  value,
  maxLength,
  rows = 12,
  labels,
  onChange,
}: {
  label: string;
  hint?: string;
  error?: string;
  value: string;
  maxLength: number;
  rows?: number;
  labels: Labels;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const area = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState(false);
  /** The selection to restore once React has rendered an inserted snippet. */
  const pending = useRef<[number, number] | null>(null);
  useLayoutEffect(() => {
    const element = area.current;
    if (element && pending.current) {
      element.focus();
      element.setSelectionRange(...pending.current);
      pending.current = null;
    }
  }, [value]);

  /** Replaces the selection and selects `select` (offsets within the inserted text). */
  const replace = (build: (selected: string) => { text: string; select: [number, number] }) => {
    const element = area.current;
    if (!element) {
      return;
    }
    const { selectionStart: start, selectionEnd: end } = element;
    const { text, select } = build(value.slice(start, end));
    const next = value.slice(0, start) + text + value.slice(end);
    if (next.length > maxLength) {
      return;
    }
    pending.current = [start + select[0], start + select[1]];
    onChange(next);
  };

  const wrap = (marker: string, placeholder: string) =>
    replace((selected) => {
      const body = selected || placeholder;
      return {
        text: `${marker}${body}${marker}`,
        select: [marker.length, marker.length + body.length],
      };
    });

  const list = (ordered: boolean) => {
    const element = area.current;
    if (!element) {
      return;
    }
    // Whole lines: extend the selection to the start of its first line.
    const lineStart = value.lastIndexOf("\n", element.selectionStart - 1) + 1;
    element.setSelectionRange(lineStart, element.selectionEnd);
    replace((selected) => {
      const lines = (selected || "").split("\n");
      const text = lines
        .map((line, index) => `${ordered ? `${index + 1}.` : "-"} ${line.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "")}`)
        .join("\n");
      return { text, select: [text.length, text.length] };
    });
  };

  const link = () =>
    replace((selected) => {
      const body = selected || labels.linkText;
      const text = `[${body}](https://)`;
      // Leaves the cursor where the address goes.
      return { text, select: [text.length - 1, text.length - 1] };
    });

  const tools: { label: string; glyph: string; run: () => void; className?: string }[] = [
    { label: labels.bold, glyph: "B", run: () => wrap("**", labels.bold), className: "is-bold" },
    { label: labels.italic, glyph: "I", run: () => wrap("*", labels.italic), className: "is-italic" },
    { label: labels.bullets, glyph: "•", run: () => list(false) },
    { label: labels.numbered, glyph: "1.", run: () => list(true) },
    { label: labels.link, glyph: "↗", run: link },
  ];

  return (
    <div className="markdown-field">
      <div className="markdown-field-head">
        <label htmlFor={id}>{label}</label>
        <div className="markdown-tabs" role="group">
          <button
            type="button"
            className={preview ? undefined : "is-active"}
            aria-pressed={!preview}
            onClick={() => setPreview(false)}
          >
            {labels.write}
          </button>
          <button
            type="button"
            className={preview ? "is-active" : undefined}
            aria-pressed={preview}
            onClick={() => setPreview(true)}
          >
            {labels.preview}
          </button>
        </div>
      </div>
      <div className={error ? "markdown-box is-invalid" : "markdown-box"}>
        {preview ? (
          value.trim() ? (
            <Markdown text={value} className="markdown-preview" />
          ) : (
            <p className="markdown-preview muted">{labels.empty}</p>
          )
        ) : (
          <>
            <div className="markdown-toolbar" role="toolbar" aria-label={labels.toolbar}>
              {tools.map((tool) => (
                <button
                  key={tool.label}
                  type="button"
                  className={tool.className}
                  title={tool.label}
                  aria-label={tool.label}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={tool.run}
                >
                  {tool.glyph}
                </button>
              ))}
              <span className="markdown-count muted">
                {value.length} / {maxLength}
              </span>
            </div>
            <textarea
              id={id}
              ref={area}
              value={value}
              onChange={(event) => onChange(event.target.value)}
              maxLength={maxLength}
              rows={rows}
              aria-invalid={error ? true : undefined}
            />
          </>
        )}
      </div>
      {error ? (
        <small className="field-error" role="alert">
          {error}
        </small>
      ) : (
        hint && <small className="muted">{hint}</small>
      )}
    </div>
  );
}

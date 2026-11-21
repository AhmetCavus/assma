import { CV_IMPORT_LIMITS } from "@assma/shared";

export type ExtractionProblem = "unsupported" | "tooLarge" | "noText";

export class ExtractionError extends Error {
  constructor(public readonly problem: ExtractionProblem) {
    super(problem);
  }
}

function kind(file: File): "pdf" | "docx" | "text" | null {
  const name = file.name.toLowerCase();
  if (file.type === "application/pdf" || name.endsWith(".pdf")) {
    return "pdf";
  }
  if (
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    name.endsWith(".docx")
  ) {
    return "docx";
  }
  if (file.type.startsWith("text/") || /\.(txt|md|markdown)$/.test(name)) {
    return "text";
  }
  return null;
}

/** Reads the text layer of each page; items flagged as line ends become line breaks. */
async function pdfText(data: ArrayBuffer): Promise<string> {
  // The legacy build carries polyfills: the modern one relies on JavaScript features
  // (such as Map.getOrInsertComputed) that current Safari and Firefox ESR lack.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const worker = await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const task = pdfjs.getDocument({ data: new Uint8Array(data) });
  const document = await task.promise;
  const pages: string[] = [];
  try {
    for (let number = 1; number <= Math.min(document.numPages, 30); number += 1) {
      const page = await document.getPage(number);
      const content = await page.getTextContent();
      let text = "";
      for (const item of content.items) {
        if ("str" in item) {
          text += item.str + (item.hasEOL ? "\n" : "");
        }
      }
      pages.push(text);
    }
  } finally {
    await task.destroy();
  }
  return pages.join("\n\n");
}

async function docxText(data: ArrayBuffer): Promise<string> {
  const mammoth = await import("mammoth/mammoth.browser.js");
  const result = await mammoth.extractRawText({ arrayBuffer: data });
  return result.value;
}

/** Extracts a CV's text in the browser, so the file itself never leaves this device. */
export async function extractCvText(file: File): Promise<string> {
  const type = kind(file);
  if (!type) {
    throw new ExtractionError("unsupported");
  }
  if (file.size > CV_IMPORT_LIMITS.fileBytes) {
    throw new ExtractionError("tooLarge");
  }
  let text: string;
  try {
    text =
      type === "pdf"
        ? await pdfText(await file.arrayBuffer())
        : type === "docx"
          ? await docxText(await file.arrayBuffer())
          : await file.text();
  } catch {
    throw new ExtractionError("noText");
  }
  const cleaned = text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!cleaned) {
    throw new ExtractionError("noText");
  }
  return cleaned;
}

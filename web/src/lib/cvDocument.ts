import {
  formatPeriod,
  type Copy,
  type ExperienceProfile,
  type ExperienceReference,
} from "@assma/shared";

/** One tailored CV, as the preview, the Markdown and the PDF all render it. */
export type CvDocument = {
  name: string;
  details: string[];
  summary: string;
  headings: { profile: string; projects: string; skills: string };
  references: { organization: string; meta: string; contribution: string; skills: string[] }[];
};

export function cvDocument(
  profile: ExperienceProfile,
  summary: string,
  references: readonly ExperienceReference[],
  copy: Copy,
  locale: string,
): CvDocument {
  return {
    name: profile.name,
    details: [
      [profile.headline, profile.location].filter(Boolean).join(" · "),
      profile.email,
    ].filter(Boolean),
    summary: summary.trim(),
    headings: {
      profile: copy.cv.profileHeading,
      projects: copy.cv.projectsHeading,
      skills: copy.cv.skillsLabel,
    },
    references: references.map((reference) => ({
      organization: reference.organization,
      meta: [
        reference.role,
        formatPeriod(reference.start, reference.end, locale, copy.experience.today),
      ].join(" · "),
      contribution: reference.contribution,
      skills: reference.skills,
    })),
  };
}

/** A file name like "Mara-Linden_Aster-Care". */
export function cvFileName(document: CvDocument, company: string): string {
  return [document.name || "CV", company]
    .filter(Boolean)
    .join("_")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

const escapeMarkdown = (text: string) => text.replace(/([\\`*_[\]#|<>])/g, "\\$1");

export function cvMarkdown(document: CvDocument): string {
  const lines = [`# ${escapeMarkdown(document.name || "CV")}`, ""];
  for (const detail of document.details) {
    lines.push(`${escapeMarkdown(detail)}  `);
  }
  if (document.summary) {
    lines.push("", `## ${document.headings.profile}`, "", escapeMarkdown(document.summary));
  }
  if (document.references.length > 0) {
    lines.push("", `## ${document.headings.projects}`);
    for (const reference of document.references) {
      lines.push(
        "",
        `### ${escapeMarkdown(reference.organization)}`,
        "",
        `*${escapeMarkdown(reference.meta)}*`,
        "",
        escapeMarkdown(reference.contribution),
      );
      if (reference.skills.length > 0) {
        lines.push(
          "",
          `${document.headings.skills}: ${escapeMarkdown(reference.skills.join(", "))}`,
        );
      }
    }
  }
  return `${lines.join("\n").trim()}\n`;
}

/** Offers a file to the browser to save. */
export function download(name: string, content: Blob): void {
  const url = URL.createObjectURL(content);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Look-alikes for characters Helvetica lacks and that have no accent to strip. */
const PDF_SUBSTITUTES: Record<string, string> = {
  ı: "i",
  İ: "I",
  ł: "l",
  Ł: "L",
  đ: "d",
  Đ: "D",
  ħ: "h",
  "→": "->",
  "←": "<-",
  "⇒": "=>",
  "≥": ">=",
  "≤": "<=",
  "≠": "!=",
  "✓": "",
  "\u2009": " ",
  "\u202f": " ",
};

/**
 * Renders the CV as an A4 PDF with the standard Helvetica fonts, so no font file is needed.
 * Characters Helvetica cannot encode are replaced instead of failing the export.
 */
export async function cvPdf(cv: CvDocument): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  pdf.setTitle(cv.name || "CV");
  pdf.setCreator("assma");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const oblique = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const ink = rgb(0.13, 0.11, 0.1);
  const sub = rgb(0.4, 0.35, 0.32);
  const accent = rgb(0.33, 0.17, 0.5);

  const encodable = new Map<string, boolean>();
  const canEncode = (character: string) => {
    if (!encodable.has(character)) {
      try {
        regular.encodeText(character);
        encodable.set(character, true);
      } catch {
        encodable.set(character, false);
      }
    }
    return encodable.get(character)!;
  };
  // Helvetica covers Western European letters only. Other letters lose their accent
  // (ş → s, ğ → g), a few get a look-alike, and anything left is dropped, never shown as "?".
  const safe = (text: string) =>
    [...text.normalize("NFC")]
      .map((character) => {
        if (character === "\n" || canEncode(character)) {
          return character;
        }
        const base = character.normalize("NFD").replace(/\p{M}/gu, "");
        if (base && base !== character && [...base].every(canEncode)) {
          return base;
        }
        const substitute = PDF_SUBSTITUTES[character];
        return substitute !== undefined && [...substitute].every(canEncode) ? substitute : "";
      })
      .join("");

  const width = 595.28;
  const height = 841.89;
  const margin = 56;
  const usable = width - margin * 2;
  let page = pdf.addPage([width, height]);
  let y = height - margin;

  const wrap = (text: string, font: typeof regular, size: number) => {
    const lines: string[] = [];
    for (const paragraph of safe(text).split("\n")) {
      let line = "";
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        const next = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(next, size) <= usable || !line) {
          line = next;
        } else {
          lines.push(line);
          line = word;
        }
      }
      lines.push(line);
    }
    return lines;
  };

  const write = (
    text: string,
    options: { font?: typeof regular; size?: number; color?: ReturnType<typeof rgb>; gap?: number },
  ) => {
    const font = options.font ?? regular;
    const size = options.size ?? 10.5;
    const leading = size * 1.4;
    for (const line of wrap(text, font, size)) {
      if (y - leading < margin) {
        page = pdf.addPage([width, height]);
        y = height - margin;
      }
      y -= leading;
      page.drawText(line, { x: margin, y, size, font, color: options.color ?? ink });
    }
    y -= options.gap ?? 0;
  };

  write(cv.name || "CV", { font: bold, size: 22, color: accent, gap: 6 });
  for (const detail of cv.details) {
    write(detail, { color: sub });
  }
  if (cv.summary) {
    y -= 14;
    write(cv.headings.profile, { font: bold, size: 13, color: accent, gap: 2 });
    write(cv.summary, {});
  }
  if (cv.references.length > 0) {
    y -= 14;
    write(cv.headings.projects, { font: bold, size: 13, color: accent, gap: 2 });
    for (const reference of cv.references) {
      y -= 8;
      write(reference.organization, { font: bold, size: 11.5 });
      write(reference.meta, { font: oblique, color: sub, gap: 3 });
      write(reference.contribution, {});
      if (reference.skills.length > 0) {
        write(`${cv.headings.skills}: ${reference.skills.join(", ")}`, { size: 9.5, color: sub });
      }
    }
  }
  return pdf.save();
}

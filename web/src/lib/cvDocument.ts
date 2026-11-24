import {
  CV_THEMES,
  cvMatrix,
  cvRoles,
  formatPeriod,
  formatYears,
  LOCALES,
  PHOTO_ON_PANEL,
  roleRows,
  skillRows,
  sortEducation,
  totalYears,
  type CvDesign,
  type CvLanguage,
  type CvPalette,
  type ExperienceProfile,
  type ExperienceReference,
  type LanguageLevel,
  type PhotoShape,
  type Rgb,
} from "@assma/shared";

/** One tailored CV, as the preview, the Markdown and the PDF all render it. */
export type CvDocument = {
  language: CvLanguage;
  design: CvDesign;
  palette: CvPalette;
  name: string;
  headline: string;
  experience: string;
  /** The original photo; the frame is applied when rendering. */
  photo: string | null;
  contact: { kind: "address" | "phone" | "email" | "web" | "location"; value: string }[];
  summary: string;
  matrix: { name: string; years: number; yearsLabel: string; projects: string; lastUsed: string }[];
  roles: { name: string; yearsLabel: string }[];
  references: {
    organization: string;
    role: string;
    period: string;
    contribution: string;
    skills: string[];
  }[];
  education: { degree: string; institution: string; period: string; note: string }[];
  languages: { name: string; level: string; dots: number }[];
  certificates: { name: string; detail: string }[];
  hobbies: string[];
  labels: {
    contact: string;
    matrix: string;
    roles: string;
    profile: string;
    projects: string;
    education: string;
    languages: string;
    certificates: string;
    hobbies: string;
    skillColumn: string;
    yearsColumn: string;
    projectsColumn: string;
    lastColumn: string;
    page: (page: number, pages: number) => string;
  };
};

/** Level dots out of five. */
const DOTS: Record<LanguageLevel, number> = {
  native: 5,
  C2: 5,
  C1: 4,
  B2: 3,
  B1: 2,
  A2: 1,
  A1: 1,
};

export function cvDocument(options: {
  profile: ExperienceProfile;
  summary: string;
  /** Selected references in CV order. */
  references: readonly ExperienceReference[];
  /** All references, for the years in the matrix and the total experience. */
  allReferences: readonly ExperienceReference[];
  skills: readonly string[];
  /** Years the person set per skill, instead of the computed ones. */
  skillYears: Readonly<Record<string, number>>;
  /** The chosen lines under "Berufserfahrung"; null for the most practised roles. */
  roles: readonly { name: string; years: number | null }[] | null;
  photo: string | null;
  language: CvLanguage;
  design: CvDesign;
}): CvDocument {
  const { profile, language } = options;
  // Headings, dates and units follow the CV's language, not the interface.
  const copy = LOCALES[language];
  const text = copy.cv;
  const years = (value: number) => formatYears(value, language, text.yearsUnit);
  const total = totalYears(options.allReferences);
  return {
    language,
    design: options.design,
    palette: CV_THEMES[options.design.theme],
    name: profile.name,
    headline: profile.headline,
    experience: total > 0 ? text.totalExperience(years(total)) : "",
    photo: options.photo,
    contact: [
      { kind: "address" as const, value: profile.address },
      { kind: "location" as const, value: profile.address ? "" : profile.location },
      { kind: "phone" as const, value: profile.phone },
      { kind: "email" as const, value: profile.email },
      {
        kind: "web" as const,
        value: profile.website.replace(/^https?:\/\//, "").replace(/\/$/, ""),
      },
    ].filter((entry) => entry.value),
    summary: options.summary.trim(),
    matrix: cvMatrix(
      skillRows(options.allReferences),
      options.skills,
      options.skillYears,
      language,
    ).map((row) => ({
      name: row.name,
      years: row.years,
      yearsLabel: years(row.years),
      projects: String(row.projects),
      lastUsed: String(row.lastYear),
    })),
    roles: cvRoles(roleRows(options.allReferences), options.roles).map((row) => ({
      name: row.name,
      yearsLabel: years(row.years),
    })),
    references: options.references.map((reference) => ({
      organization: reference.organization,
      role: reference.role,
      period: formatPeriod(reference.start, reference.end, language, copy.experience.today),
      contribution: reference.contribution,
      skills: reference.skills,
    })),
    education: sortEducation(profile.education).map((entry) => ({
      degree: entry.degree,
      institution: entry.institution,
      period:
        entry.start && entry.end
          ? entry.start === entry.end
            ? entry.end
            : `${entry.start}–${entry.end}`
          : entry.start
            ? `${entry.start}–${copy.experience.today}`
            : entry.end,
      note: entry.note,
    })),
    languages: profile.languages.map((entry) => ({
      name: entry.name,
      level: copy.experience.levels[entry.level],
      dots: DOTS[entry.level],
    })),
    certificates: profile.certificates.map((certificate) => ({
      name: certificate.name,
      detail: [certificate.issuer, certificate.year].filter(Boolean).join(" · "),
    })),
    hobbies: profile.hobbies,
    labels: {
      contact: text.contactHeading,
      matrix: text.matrixHeading,
      roles: text.rolesHeading,
      profile: text.profileHeading,
      projects: text.projectsHeading,
      education: text.educationHeading,
      languages: text.languagesHeading,
      certificates: text.certificatesHeading,
      hobbies: text.hobbiesHeading,
      skillColumn: text.skillColumn,
      yearsColumn: text.yearsColumn,
      projectsColumn: text.projectsColumn,
      lastColumn: text.lastColumn,
      page: text.page,
    },
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

const md = (text: string) => text.replace(/([\\`*_[\]#|<>])/g, "\\$1");

export function cvMarkdown(cv: CvDocument): string {
  const lines = [`# ${md(cv.name || "CV")}`, ""];
  const subtitle = [cv.headline, cv.experience].filter(Boolean).join(" · ");
  if (subtitle) {
    lines.push(`**${md(subtitle)}**`, "");
  }
  for (const entry of cv.contact) {
    lines.push(`${md(entry.value.replace(/\n/g, ", "))}  `);
  }
  if (cv.summary) {
    lines.push("", `## ${cv.labels.profile}`, "", md(cv.summary));
  }
  if (cv.matrix.length > 0) {
    lines.push(
      "",
      `## ${cv.labels.matrix}`,
      "",
      `| ${cv.labels.skillColumn} | ${cv.labels.yearsColumn} | ${cv.labels.projectsColumn} | ${cv.labels.lastColumn} |`,
      "| --- | --- | --- | --- |",
      ...cv.matrix.map(
        (row) => `| ${md(row.name)} | ${row.yearsLabel} | ${row.projects} | ${row.lastUsed} |`,
      ),
    );
  }
  if (cv.roles.length > 0) {
    lines.push(
      "",
      `## ${cv.labels.roles}`,
      "",
      ...cv.roles.map((role) => `- ${md(role.name)}: ${role.yearsLabel}`),
    );
  }
  if (cv.references.length > 0) {
    lines.push("", `## ${cv.labels.projects}`);
    for (const reference of cv.references) {
      lines.push(
        "",
        `### ${md(reference.organization)}`,
        "",
        `*${md(reference.role)} · ${md(reference.period)}*`,
        "",
        md(reference.contribution),
      );
      if (reference.skills.length > 0) {
        lines.push("", reference.skills.map((skill) => `\`${skill.replace(/`/g, "")}\``).join(" "));
      }
    }
  }
  if (cv.education.length > 0) {
    lines.push("", `## ${cv.labels.education}`, "");
    for (const entry of cv.education) {
      const detail = [entry.institution, entry.period].filter(Boolean).join(", ");
      lines.push(`- **${md(entry.degree)}**${detail ? ` – ${md(detail)}` : ""}`);
      if (entry.note) {
        lines.push(`  ${md(entry.note)}`);
      }
    }
  }
  if (cv.languages.length > 0) {
    lines.push(
      "",
      `## ${cv.labels.languages}`,
      "",
      ...cv.languages.map((entry) => `- ${md(entry.name)}: ${md(entry.level)}`),
    );
  }
  if (cv.certificates.length > 0) {
    lines.push(
      "",
      `## ${cv.labels.certificates}`,
      "",
      ...cv.certificates.map(
        (certificate) =>
          `- ${md(certificate.name)}${certificate.detail ? ` (${md(certificate.detail)})` : ""}`,
      ),
    );
  }
  if (cv.hobbies.length > 0) {
    lines.push("", `## ${cv.labels.hobbies}`, "", md(cv.hobbies.join(", ")));
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

// ---------------------------------------------------------------------------------------
// Photo frames

const css = (color: Rgb) => `rgb(${color.map((channel) => Math.round(channel * 255)).join(",")})`;

function shapePath(
  context: CanvasRenderingContext2D,
  shape: PhotoShape,
  size: number,
  inset: number,
) {
  const left = inset;
  const span = size - 2 * inset;
  context.beginPath();
  switch (shape) {
    case "square":
      context.rect(left, left, span, span);
      break;
    case "rounded":
      context.roundRect(left, left, span, span, span * 0.18);
      break;
    case "hexagon": {
      const center = size / 2;
      const radius = span / 2;
      for (let corner = 0; corner < 6; corner += 1) {
        const angle = (Math.PI / 3) * corner - Math.PI / 2;
        const x = center + radius * Math.cos(angle);
        const y = center + radius * Math.sin(angle);
        if (corner === 0) {
          context.moveTo(x, y);
        } else {
          context.lineTo(x, y);
        }
      }
      context.closePath();
      break;
    }
    default:
      context.arc(size / 2, size / 2, span / 2, 0, Math.PI * 2);
  }
}

/**
 * The photo in its frame as a transparent PNG data URL, bordered in `frame`. The preview and
 * the PDF use this same image, so both show the same frame.
 */
export async function framedPhoto(
  dataUrl: string,
  shape: PhotoShape,
  frame: Rgb,
  size = 520,
): Promise<string> {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d")!;
  const border = Math.round(size * 0.025);
  // The double ring: an outer ring, a transparent gap, then the photo with its own ring.
  const photoInset = shape === "ring" ? Math.round(size * 0.075) : 0;
  const base: PhotoShape = shape === "ring" ? "circle" : shape;
  if (shape === "ring") {
    shapePath(context, "circle", size, border / 2);
    context.lineWidth = border;
    context.strokeStyle = css(frame);
    context.stroke();
  }
  shapePath(context, base, size, photoInset);
  context.fillStyle = css(frame);
  context.fill();
  context.save();
  shapePath(context, base, size, photoInset + border);
  context.clip();
  context.drawImage(image, 0, 0, size, size);
  context.restore();
  return canvas.toDataURL("image/png");
}

function dataUrlBytes(dataUrl: string): Uint8Array {
  const binary = atob(dataUrl.slice(dataUrl.indexOf(",") + 1));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

/** The frame colour: the light accent on colour areas, the theme accent on white. */
export function frameColor(cv: Pick<CvDocument, "design" | "palette">): Rgb {
  return PHOTO_ON_PANEL.includes(cv.design.layout) ? cv.palette.panelMuted : cv.palette.accent;
}

// ---------------------------------------------------------------------------------------
// PDF

const WIDTH = 595.28;
const HEIGHT = 841.89;
const TOP = 48;
const BOTTOM = 54;
const MARGIN = 40;

/**
 * Renders the CV as an A4 PDF in the chosen layout, theme and photo frame. Columns flow onto
 * further pages independently; page numbers are added once the page count is known.
 */
export async function cvPdf(cv: CvDocument): Promise<Uint8Array> {
  const [{ PDFDocument, rgb }, fontkit, regularUrl, semiboldUrl, boldUrl] = await Promise.all([
    import("pdf-lib"),
    import("@pdf-lib/fontkit"),
    import("inter-font/ttf/Inter-Regular.ttf?url"),
    import("inter-font/ttf/Inter-SemiBold.ttf?url"),
    import("inter-font/ttf/Inter-Bold.ttf?url"),
  ]);
  const color = (value: Rgb) => rgb(value[0], value[1], value[2]);
  const bytes = async (url: string) => new Uint8Array(await (await fetch(url)).arrayBuffer());
  const P = cv.palette;
  const layout = cv.design.layout;

  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit.default);
  pdf.setTitle(cv.name ? `CV ${cv.name}` : "CV");
  pdf.setAuthor(cv.name);
  pdf.setCreator("assma");
  pdf.setLanguage(cv.language);
  // The fonts are embedded whole: fontkit's subsetting drops glyphs of Inter (letters vanish
  // from the page while the text layer stays intact), a known pdf-lib problem. Contextual
  // alternates and ligatures are off: Inter swaps "+", "-" and "–" for differently sized
  // forms next to digits, which pdf-lib would measure with the wrong width.
  const options = {
    subset: false,
    features: { calt: false, liga: false, clig: false, dlig: false, rlig: false, case: false },
  };
  const [regular, semibold, bold] = await Promise.all([
    pdf.embedFont(await bytes(regularUrl.default), options),
    pdf.embedFont(await bytes(semiboldUrl.default), options),
    pdf.embedFont(await bytes(boldUrl.default), options),
  ]);
  type Font = typeof regular;

  /** Characters the font has no glyph for (emoji, rare symbols) are dropped, not shown as boxes. */
  const glyphs = new Set(regular.getCharacterSet());
  const clean = (text: string) =>
    [...text.normalize("NFC")]
      .filter((character) => character === "\n" || glyphs.has(character.codePointAt(0)!))
      .join("");

  const wrap = (text: string, font: Font, size: number, maxWidth: number) => {
    const lines: string[] = [];
    for (const paragraph of clean(text).split("\n")) {
      let line = "";
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        const next = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(next, size) <= maxWidth || !line) {
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

  // Page decoration per layout: the colour areas behind the columns.
  const SIDEBAR = 196;
  const BAND = 176;
  const STRIPE = 12;
  /** Width of the heading column of the margin layout. */
  const LABEL = 108;
  /** Height of the banner, known once its content is measured. */
  let bannerHeight = 0;
  const pages: ReturnType<typeof pdf.addPage>[] = [];
  const page = (index: number) => {
    while (pages.length <= index) {
      const added = pdf.addPage([WIDTH, HEIGHT]);
      const number = pages.length;
      if (layout === "sidebar" || layout === "sidebarSoft") {
        added.drawRectangle({
          x: 0,
          y: 0,
          width: SIDEBAR,
          height: HEIGHT,
          color: color(layout === "sidebar" ? P.panel : P.tint),
        });
      } else if (layout === "banner" && number === 0) {
        added.drawRectangle({
          x: 0,
          y: HEIGHT - bannerHeight,
          width: WIDTH,
          height: bannerHeight,
          color: color(P.panel),
        });
      } else if (layout === "columns") {
        added.drawRectangle({ x: 0, y: 0, width: STRIPE, height: HEIGHT, color: color(P.panel) });
      } else if (layout === "sidebarRight") {
        added.drawRectangle({
          x: WIDTH - SIDEBAR,
          y: 0,
          width: SIDEBAR,
          height: HEIGHT,
          color: color(P.panel),
        });
      } else if (layout === "header" && number === 0) {
        added.drawRectangle({
          x: 0,
          y: HEIGHT - BAND,
          width: WIDTH,
          height: BAND,
          color: color(P.panel),
        });
      } else if (layout === "classic" || layout === "modern") {
        added.drawRectangle({
          x: 0,
          y: HEIGHT - 8,
          width: WIDTH,
          height: 8,
          color: color(P.accent),
        });
      }
      pages.push(added);
    }
    return pages[index]!;
  };

  /** Colour area, white paper, or the light tint of the soft sidebar. */
  type Tone = "panel" | "paper" | "soft";
  const WHITE: Rgb = [1, 1, 1];
  const tones = {
    panel: { text: P.panelText, muted: P.panelMuted, track: P.panelTrack, strong: P.panelText },
    paper: { text: P.ink, muted: P.sub, track: P.track, strong: P.accent },
    soft: { text: P.ink, muted: P.sub, track: WHITE, strong: P.accent },
  };

  /** A column that writes top to bottom and continues on the next page when full. */
  class Flow {
    page = 0;
    constructor(
      readonly x: number,
      readonly width: number,
      public y: number,
      readonly kind: Tone,
    ) {}
    get colors() {
      return tones[this.kind];
    }
    ensure(space: number) {
      if (this.y - space < BOTTOM) {
        this.page += 1;
        this.y = HEIGHT - TOP;
      }
      return page(this.page);
    }
    /** Continues below another flow, for columns that start after a full-width part. */
    after(other: Flow, gap = 0) {
      this.page = other.page;
      this.y = other.y - gap;
      return this;
    }
    text(
      value: string,
      settings: {
        font?: Font;
        size?: number;
        color?: Rgb;
        gap?: number;
        indent?: number;
        leading?: number;
        align?: "left" | "center";
      } = {},
    ) {
      const font = settings.font ?? regular;
      const size = settings.size ?? 9.5;
      const leading = size * (settings.leading ?? 1.42);
      const indent = settings.indent ?? 0;
      for (const line of wrap(value, font, size, this.width - indent)) {
        const target = this.ensure(leading);
        this.y -= leading;
        target.drawText(line, {
          x:
            settings.align === "center"
              ? this.x + (this.width - font.widthOfTextAtSize(line, size)) / 2
              : this.x + indent,
          y: this.y + size * 0.28,
          size,
          font,
          color: color(settings.color ?? this.colors.text),
        });
      }
      this.y -= settings.gap ?? 0;
    }
    /** A label on the left and a value at the right edge, optionally joined by dots. */
    pair(
      left: string,
      right: string,
      settings: {
        size?: number;
        leftFont?: Font;
        rightFont?: Font;
        leader?: boolean;
        rightColor?: Rgb;
      },
    ) {
      const size = settings.size ?? 9.4;
      const leftFont = settings.leftFont ?? regular;
      const rightFont = settings.rightFont ?? semibold;
      const label = clean(right);
      const labelWidth = rightFont.widthOfTextAtSize(label, size);
      const name = wrap(left, leftFont, size, this.width - labelWidth - 14)[0] ?? "";
      const target = this.ensure(size * 1.6);
      this.y -= size * 1.55;
      target.drawText(name, {
        x: this.x,
        y: this.y + 3,
        size,
        font: leftFont,
        color: color(this.colors.text),
      });
      if (settings.leader) {
        const start = this.x + leftFont.widthOfTextAtSize(name, size) + 6;
        const end = this.x + this.width - labelWidth - 6;
        for (let x = start; x < end; x += 4) {
          target.drawCircle({ x, y: this.y + 4.5, size: 0.45, color: color(P.line) });
        }
      }
      target.drawText(label, {
        x: this.x + this.width - labelWidth,
        y: this.y + 3,
        size,
        font: rightFont,
        color: color(settings.rightColor ?? this.colors.strong),
      });
    }
    space(amount: number) {
      this.y -= amount;
    }
  }

  // Sections ------------------------------------------------------------------------------

  /** Where the last heading of the margin layout ends, so the next one cannot overlap it. */
  let marginFloor: { page: number; y: number } | null = null;

  /** A section heading; `keep` is the room it needs below, so it never ends a page alone. */
  const heading = (flow: Flow, label: string, keep = 46) => {
    if (layout === "margin" && flow.x === MARGIN + LABEL) {
      // The heading stands in the margin column, level with the start of its section.
      flow.space(18);
      if (marginFloor?.page === flow.page) {
        flow.y = Math.min(flow.y, marginFloor.y);
      }
      const target = flow.ensure(keep);
      const lines = wrap(label.toUpperCase(), bold, 8.2, LABEL - 14);
      lines.forEach((line, index) =>
        target.drawText(line, {
          x: MARGIN,
          y: flow.y - 9 - index * 11,
          size: 8.2,
          font: bold,
          color: color(P.accent),
        }),
      );
      const barY = flow.y - 9 - (lines.length - 1) * 11 - 7;
      target.drawRectangle({ x: MARGIN, y: barY, width: 22, height: 1.6, color: color(P.accent) });
      marginFloor = { page: flow.page, y: barY - 8 };
      return;
    }
    if (layout === "minimal") {
      flow.space(20);
      flow.ensure(keep);
      flow.text(label.toUpperCase(), { font: bold, size: 9, color: P.ink, gap: 3 });
      page(flow.page).drawRectangle({
        x: flow.x,
        y: flow.y + 1,
        width: flow.width,
        height: 0.6,
        color: color(P.line),
      });
      flow.space(8);
      return;
    }
    flow.space(flow.kind === "panel" ? 16 : 18);
    flow.ensure(keep);
    if (flow.kind === "panel") {
      flow.text(label.toUpperCase(), { font: bold, size: 8.5, color: P.panelMuted, gap: 4 });
      page(flow.page).drawRectangle({
        x: flow.x,
        y: flow.y + 2,
        width: 22,
        height: 1.6,
        color: color(P.panelMuted),
      });
      flow.space(6);
    } else {
      flow.text(label.toUpperCase(), { font: bold, size: 9.5, color: P.accent, gap: 3 });
      page(flow.page).drawRectangle({
        x: flow.x,
        y: flow.y + 1,
        width: flow.width,
        height: 0.8,
        color: color(P.line),
      });
      page(flow.page).drawRectangle({
        x: flow.x,
        y: flow.y + 0.6,
        width: 34,
        height: 1.8,
        color: color(P.accent),
      });
      flow.space(8);
    }
  };

  const contact = (flow: Flow, withHeading = true) => {
    if (cv.contact.length === 0) {
      return;
    }
    if (withHeading) {
      heading(flow, cv.labels.contact);
    }
    for (const entry of cv.contact) {
      flow.text(entry.value, { size: 8.8, gap: 5, leading: 1.35 });
    }
  };

  const bar = (flow: Flow, x: number, y: number, width: number, share: number) => {
    const target = page(flow.page);
    target.drawRectangle({ x, y, width, height: 3.2, color: color(flow.colors.track) });
    target.drawRectangle({
      x,
      y,
      width: Math.max(6, width * share),
      height: 3.2,
      color: color(flow.kind === "panel" ? P.panelMuted : P.accent),
    });
  };

  const matrixBars = (flow: Flow) => {
    if (cv.matrix.length === 0) {
      return;
    }
    heading(flow, cv.labels.matrix, 80);
    const longest = Math.max(...cv.matrix.map((row) => row.years), 1);
    for (const row of cv.matrix) {
      flow.pair(row.name, row.yearsLabel, {
        size: 8.8,
        leftFont: semibold,
        rightFont: regular,
        rightColor: flow.colors.muted,
      });
      flow.y -= 5;
      bar(flow, flow.x, flow.y, flow.width, row.years / longest);
      flow.y -= 5;
    }
  };

  /** The matrix as a two-column grid of bars, for the modern layout. */
  const matrixGrid = (flow: Flow) => {
    if (cv.matrix.length === 0) {
      return;
    }
    heading(flow, cv.labels.matrix, 80);
    const longest = Math.max(...cv.matrix.map((row) => row.years), 1);
    const gap = 26;
    const columnWidth = (flow.width - gap) / 2;
    for (let index = 0; index < cv.matrix.length; index += 2) {
      const target = flow.ensure(26);
      flow.y -= 14;
      for (const [offset, row] of [cv.matrix[index], cv.matrix[index + 1]].entries()) {
        if (!row) {
          continue;
        }
        const x = flow.x + offset * (columnWidth + gap);
        const label = clean(row.yearsLabel);
        const labelWidth = regular.widthOfTextAtSize(label, 8.8);
        target.drawText(wrap(row.name, semibold, 8.8, columnWidth - labelWidth - 8)[0] ?? "", {
          x,
          y: flow.y + 3,
          size: 8.8,
          font: semibold,
          color: color(P.ink),
        });
        target.drawText(label, {
          x: x + columnWidth - labelWidth,
          y: flow.y + 3,
          size: 8.8,
          font: regular,
          color: color(P.sub),
        });
        bar(flow, x, flow.y - 3, columnWidth, row.years / longest);
      }
      flow.y -= 10;
    }
  };

  /** The matrix as a table with years, projects and last use, for the classic layout. */
  const matrixTable = (flow: Flow) => {
    if (cv.matrix.length === 0) {
      return;
    }
    heading(flow, cv.labels.matrix, 80);
    const columns = [
      { label: cv.labels.skillColumn, x: 0 },
      { label: cv.labels.yearsColumn, x: flow.width * 0.52 },
      { label: cv.labels.projectsColumn, x: flow.width * 0.7 },
      { label: cv.labels.lastColumn, x: flow.width * 0.85 },
    ];
    const header = flow.ensure(18);
    flow.y -= 12;
    for (const column of columns) {
      header.drawText(clean(column.label), {
        x: flow.x + column.x,
        y: flow.y,
        size: 7.8,
        font: bold,
        color: color(P.sub),
      });
    }
    flow.y -= 5;
    const longest = Math.max(...cv.matrix.map((row) => row.years), 1);
    for (const [index, row] of cv.matrix.entries()) {
      const target = flow.ensure(16);
      flow.y -= 15;
      if (index % 2 === 0) {
        target.drawRectangle({
          x: flow.x - 4,
          y: flow.y - 4,
          width: flow.width + 8,
          height: 15,
          color: color(P.tint),
        });
      }
      target.drawText(wrap(row.name, semibold, 9, flow.width * 0.3)[0] ?? "", {
        x: flow.x,
        y: flow.y,
        size: 9,
        font: semibold,
        color: color(P.ink),
      });
      bar(flow, flow.x + flow.width * 0.32, flow.y + 1.5, flow.width * 0.16, row.years / longest);
      for (const [column, value] of [
        [columns[1]!, row.yearsLabel],
        [columns[2]!, row.projects],
        [columns[3]!, row.lastUsed],
      ] as const) {
        target.drawText(clean(value), {
          x: flow.x + column.x,
          y: flow.y,
          size: 9,
          font: regular,
          color: color(P.ink),
        });
      }
    }
  };

  const roles = (flow: Flow) => {
    if (cv.roles.length === 0) {
      return;
    }
    heading(flow, cv.labels.roles);
    for (const role of cv.roles) {
      flow.pair(role.name, role.yearsLabel, { size: flow.width < 200 ? 8.8 : 9.6, leader: true });
    }
  };

  const summary = (flow: Flow) => {
    if (cv.summary) {
      heading(flow, cv.labels.profile);
      flow.text(cv.summary, { size: 10, leading: 1.5 });
    }
  };

  /** Project history; `dates` puts the period in a column on the left (classic style). */
  const projects = (flow: Flow, dates = false) => {
    if (cv.references.length === 0) {
      return;
    }
    heading(flow, cv.labels.projects, 120);
    const indent = dates ? 92 : 14;
    for (const reference of cv.references) {
      flow.space(6);
      const target = flow.ensure(60);
      const startY = flow.y;
      const startPage = flow.page;
      const period = clean(reference.period);
      const periodWidth = semibold.widthOfTextAtSize(period, 8.6);
      const titleWidth = flow.width - indent - (dates ? 0 : periodWidth + 12);
      const title = wrap(reference.organization, bold, 11.2, titleWidth);
      flow.y -= 11.2 * 1.3;
      target.drawText(title[0] ?? "", {
        x: flow.x + indent,
        y: flow.y + 3,
        size: 11.2,
        font: bold,
        color: color(P.ink),
      });
      target.drawText(period, {
        x: dates ? flow.x : flow.x + flow.width - periodWidth,
        y: flow.y + 4,
        size: 8.6,
        font: semibold,
        color: color(P.accent),
      });
      for (const line of title.slice(1)) {
        flow.text(line, { font: bold, size: 11.2, indent, leading: 1.3, color: P.ink });
      }
      flow.text(reference.role, { font: semibold, size: 9.4, color: P.sub, indent, gap: 2 });
      flow.text(reference.contribution, { size: 9.5, indent, leading: 1.48, gap: 3, color: P.ink });
      if (reference.skills.length > 0) {
        const size = 7.6;
        let x = flow.x + indent;
        flow.ensure(16);
        flow.y -= 14;
        for (const skill of reference.skills) {
          const label = clean(skill);
          const tagWidth = semibold.widthOfTextAtSize(label, size) + 10;
          if (x + tagWidth > flow.x + flow.width) {
            x = flow.x + indent;
            flow.ensure(16);
            flow.y -= 15;
          }
          const tagPage = page(flow.page);
          tagPage.drawRectangle({
            x,
            y: flow.y,
            width: tagWidth,
            height: 12,
            color: color(P.tint),
          });
          tagPage.drawText(label, {
            x: x + 5,
            y: flow.y + 3.4,
            size,
            font: semibold,
            color: color(P.accent),
          });
          x += tagWidth + 4;
        }
        flow.space(4);
      }
      if (!dates) {
        // Timeline: a dot at the entry and a line down its left edge on the entry's first page.
        page(startPage).drawCircle({
          x: flow.x + 3,
          y: startY - 11,
          size: 3.2,
          color: color(P.accent),
        });
        if (startPage === flow.page) {
          page(startPage).drawLine({
            start: { x: flow.x + 3, y: startY - 16 },
            end: { x: flow.x + 3, y: flow.y + 2 },
            thickness: 0.8,
            color: color(P.line),
          });
        }
      }
    }
  };

  const education = (flow: Flow, dates = false) => {
    if (cv.education.length === 0) {
      return;
    }
    heading(flow, cv.labels.education);
    const indent = dates ? 92 : 0;
    for (const entry of cv.education) {
      flow.space(4);
      const target = flow.ensure(34);
      if (dates && entry.period) {
        target.drawText(clean(entry.period), {
          x: flow.x,
          y: flow.y - 10.5,
          size: 8.6,
          font: semibold,
          color: color(P.accent),
        });
      }
      flow.text(entry.degree, {
        font: semibold,
        size: flow.width < 200 ? 8.8 : 9.8,
        indent,
        leading: 1.35,
      });
      const detail = [entry.institution, dates ? "" : entry.period].filter(Boolean).join(" · ");
      if (detail) {
        flow.text(detail, { size: 8.4, color: flow.colors.muted, indent, leading: 1.35 });
      }
      if (entry.note) {
        flow.text(entry.note, { size: 8.4, color: flow.colors.muted, indent, leading: 1.35 });
      }
    }
  };

  const languages = (flow: Flow) => {
    if (cv.languages.length === 0) {
      return;
    }
    heading(flow, cv.labels.languages);
    for (const entry of cv.languages) {
      const target = flow.ensure(28);
      flow.y -= 8.8 * 1.4;
      target.drawText(wrap(entry.name, semibold, 8.8, flow.width - 52)[0] ?? "", {
        x: flow.x,
        y: flow.y + 2,
        size: 8.8,
        font: semibold,
        color: color(flow.colors.text),
      });
      for (let dot = 0; dot < 5; dot += 1) {
        const filled = dot < entry.dots;
        target.drawCircle({
          x: flow.x + flow.width - 40 + dot * 9,
          y: flow.y + 5,
          size: 3,
          color: color(
            filled ? (flow.kind === "panel" ? P.panelMuted : P.accent) : flow.colors.track,
          ),
        });
      }
      flow.text(entry.level, { size: 8, color: flow.colors.muted, leading: 1.3, gap: 3 });
    }
  };

  const certificates = (flow: Flow) => {
    if (cv.certificates.length === 0) {
      return;
    }
    heading(flow, cv.labels.certificates);
    for (const certificate of cv.certificates) {
      flow.text(certificate.name, { font: semibold, size: 8.8, leading: 1.35 });
      if (certificate.detail) {
        flow.text(certificate.detail, { size: 8, color: flow.colors.muted, leading: 1.35 });
      }
      flow.space(5);
    }
  };

  const hobbies = (flow: Flow) => {
    if (cv.hobbies.length > 0) {
      heading(flow, cv.labels.hobbies);
      flow.text(cv.hobbies.join(" · "), { size: 8.8, leading: 1.45 });
    }
  };

  /** Name, role and the experience badge. */
  const identity = (flow: Flow, nameSize = 27) => {
    const onPanel = flow.kind === "panel";
    flow.text(cv.name || "CV", {
      font: bold,
      size: nameSize,
      color: onPanel ? P.panelText : P.ink,
      leading: 1.15,
      gap: 2,
    });
    if (cv.headline) {
      flow.text(cv.headline, {
        font: semibold,
        size: 13,
        color: onPanel ? P.panelMuted : P.accent,
        gap: 4,
      });
    }
    experiencePill(flow);
  };

  /** The total experience as a pill, left-aligned or centred in the flow. */
  const experiencePill = (flow: Flow, centred = false) => {
    if (!cv.experience) {
      return;
    }
    const onPanel = flow.kind === "panel";
    const size = 8.6;
    const label = clean(cv.experience);
    const pillWidth = semibold.widthOfTextAtSize(label, size) + 16;
    const x = centred ? flow.x + (flow.width - pillWidth) / 2 : flow.x;
    flow.space(4);
    const target = flow.ensure(20);
    flow.y -= 16;
    target.drawRectangle({
      x,
      y: flow.y,
      width: pillWidth,
      height: 16,
      color: color(onPanel ? P.panelTrack : P.tint),
    });
    target.drawText(label, {
      x: x + 8,
      y: flow.y + 4.8,
      size,
      font: semibold,
      color: color(onPanel ? P.panelText : P.accent),
    });
  };

  const contactLine = cv.contact.map((entry) => entry.value.replace(/\n/g, ", ")).join("   ·   ");

  const photo = cv.photo
    ? await pdf.embedPng(
        dataUrlBytes(await framedPhoto(cv.photo, cv.design.photoShape, frameColor(cv))),
      )
    : null;
  const drawPhoto = (x: number, top: number, size: number) => {
    if (photo) {
      page(0).drawImage(photo, { x, y: top - size, width: size, height: size });
    }
  };

  // Layouts -------------------------------------------------------------------------------

  if (layout === "sidebar" || layout === "sidebarRight" || layout === "sidebarSoft") {
    const left = layout !== "sidebarRight";
    const sideX = left ? 0 : WIDTH - SIDEBAR;
    const side = new Flow(
      sideX + 24,
      SIDEBAR - 48,
      HEIGHT - TOP,
      layout === "sidebarSoft" ? "soft" : "panel",
    );
    const main = new Flow(
      left ? SIDEBAR + 30 : MARGIN,
      WIDTH - SIDEBAR - 30 - MARGIN,
      HEIGHT - TOP,
      "paper",
    );
    page(0);
    if (photo) {
      drawPhoto(sideX + (SIDEBAR - 124) / 2, HEIGHT - TOP, 124);
      side.y = HEIGHT - TOP - 124 - 6;
    }
    contact(side);
    matrixBars(side);
    languages(side);
    certificates(side);
    hobbies(side);
    identity(main);
    summary(main);
    roles(main);
    projects(main);
    education(main);
  } else if (layout === "header") {
    page(0);
    const photoSize = 118;
    const bandTop = HEIGHT - 29;
    if (photo) {
      drawPhoto(MARGIN, bandTop, photoSize);
    }
    const contactWidth = 158;
    const identityX = MARGIN + (photo ? photoSize + 22 : 0);
    const band = new Flow(
      identityX,
      WIDTH - MARGIN - contactWidth - 18 - identityX,
      bandTop - 4,
      "panel",
    );
    identity(band, 25);
    const bandContact = new Flow(WIDTH - MARGIN - contactWidth, contactWidth, bandTop - 8, "panel");
    contact(bandContact, false);
    const start = HEIGHT - BAND - 6;
    const asideWidth = 168;
    const main = new Flow(MARGIN, WIDTH - 2 * MARGIN - asideWidth - 26, start, "paper");
    const aside = new Flow(WIDTH - MARGIN - asideWidth, asideWidth, start, "paper");
    summary(main);
    roles(main);
    projects(main);
    matrixBars(aside);
    languages(aside);
    education(aside);
    certificates(aside);
    hobbies(aside);
  } else if (layout === "classic") {
    page(0);
    const photoSize = 104;
    const head = new Flow(
      MARGIN,
      WIDTH - 2 * MARGIN - (photo ? photoSize + 20 : 0),
      HEIGHT - TOP,
      "paper",
    );
    if (photo) {
      drawPhoto(WIDTH - MARGIN - photoSize, HEIGHT - TOP, photoSize);
    }
    identity(head, 26);
    head.space(6);
    for (const entry of cv.contact) {
      head.text(entry.value.replace(/\n/g, ", "), { size: 9, color: P.sub, leading: 1.4 });
    }
    const full = new Flow(
      MARGIN,
      WIDTH - 2 * MARGIN,
      Math.min(head.y, photo ? HEIGHT - TOP - photoSize : head.y) - 4,
      "paper",
    );
    summary(full);
    matrixTable(full);
    roles(full);
    projects(full, true);
    education(full, true);
    const languageLine = cv.languages
      .map((entry) => `${entry.name} – ${entry.level}`)
      .join("   ·   ");
    if (languageLine) {
      heading(full, cv.labels.languages);
      full.text(languageLine, { size: 9.4 });
    }
    certificates(full);
    hobbies(full);
  } else if (layout === "banner") {
    // A centred colour banner with photo, name and contact, then one full-width column.
    const photoSize = 96;
    const inner = WIDTH - 2 * MARGIN;
    const contactLines = contactLine ? wrap(contactLine, regular, 8.8, inner).length : 0;
    bannerHeight =
      26 +
      (photo ? photoSize + 10 : 0) +
      25 * 1.15 +
      2 +
      (cv.headline ? 13 * 1.42 + 4 : 0) +
      (cv.experience ? 20 : 0) +
      (contactLines > 0 ? 8 + contactLines * 8.8 * 1.5 : 0) +
      24;
    page(0);
    if (photo) {
      drawPhoto((WIDTH - photoSize) / 2, HEIGHT - 26, photoSize);
    }
    const band = new Flow(MARGIN, inner, HEIGHT - 26 - (photo ? photoSize + 10 : 0), "panel");
    band.text(cv.name || "CV", { font: bold, size: 25, leading: 1.15, gap: 2, align: "center" });
    if (cv.headline) {
      band.text(cv.headline, {
        font: semibold,
        size: 13,
        color: P.panelMuted,
        gap: 4,
        align: "center",
      });
    }
    experiencePill(band, true);
    if (contactLine) {
      band.space(8);
      band.text(contactLine, { size: 8.8, leading: 1.5, align: "center" });
    }
    const full = new Flow(MARGIN, inner, HEIGHT - bannerHeight - 4, "paper");
    summary(full);
    matrixGrid(full);
    roles(full);
    projects(full);
    education(full);
    languages(full);
    certificates(full);
    hobbies(full);
  } else if (layout === "minimal" || layout === "margin") {
    // No colour areas: a quiet header, then one column; the margin layout sets the headings
    // in a column of their own on the left.
    page(0);
    const photoSize = 92;
    const head = new Flow(
      MARGIN,
      WIDTH - 2 * MARGIN - (photo ? photoSize + 20 : 0),
      HEIGHT - TOP,
      "paper",
    );
    if (photo) {
      drawPhoto(WIDTH - MARGIN - photoSize, HEIGHT - TOP, photoSize);
    }
    if (layout === "minimal") {
      head.text(cv.name || "CV", { font: bold, size: 28, color: P.ink, leading: 1.15, gap: 3 });
      if (cv.headline) {
        head.text(cv.headline, { size: 12.5, color: P.sub, gap: 3 });
      }
      if (cv.experience) {
        head.text(cv.experience, { font: semibold, size: 9, color: P.accent, gap: 2 });
      }
    } else {
      identity(head, 26);
    }
    if (contactLine) {
      head.space(6);
      head.text(contactLine, { size: 8.8, color: P.sub, leading: 1.5 });
    }
    const top = Math.min(head.y, photo ? HEIGHT - TOP - photoSize : head.y) - 6;
    const indent = layout === "margin" ? LABEL : 0;
    const full = new Flow(MARGIN + indent, WIDTH - 2 * MARGIN - indent, top, "paper");
    summary(full);
    matrixGrid(full);
    roles(full);
    projects(full);
    education(full);
    languages(full);
    certificates(full);
    hobbies(full);
  } else if (layout === "columns") {
    // A colour stripe on the left edge, photo beside the name, then two equal columns.
    page(0);
    const photoSize = 100;
    const left = MARGIN + 4;
    const inner = WIDTH - left - MARGIN;
    if (photo) {
      drawPhoto(left, HEIGHT - TOP, photoSize);
    }
    const head = new Flow(
      left + (photo ? photoSize + 22 : 0),
      inner - (photo ? photoSize + 22 : 0),
      HEIGHT - TOP - 4,
      "paper",
    );
    identity(head, 27);
    if (contactLine) {
      head.space(6);
      head.text(contactLine, { size: 8.8, color: P.sub, leading: 1.5 });
    }
    const full = new Flow(
      left,
      inner,
      Math.min(head.y, photo ? HEIGHT - TOP - photoSize : head.y) - 6,
      "paper",
    );
    summary(full);
    const gap = 28;
    const columnWidth = (inner - gap) / 2;
    const main = new Flow(left, columnWidth, 0, "paper").after(full);
    const aside = new Flow(left + columnWidth + gap, columnWidth, 0, "paper").after(full);
    projects(main);
    matrixBars(aside);
    roles(aside);
    education(aside);
    languages(aside);
    certificates(aside);
    hobbies(aside);
  } else {
    // Modern: header with the photo on the right, full-width profile and skill grid, then
    // two columns.
    page(0);
    const photoSize = 112;
    const head = new Flow(
      MARGIN,
      WIDTH - 2 * MARGIN - (photo ? photoSize + 24 : 0),
      HEIGHT - TOP,
      "paper",
    );
    if (photo) {
      drawPhoto(WIDTH - MARGIN - photoSize, HEIGHT - TOP + 6, photoSize);
    }
    identity(head, 30);
    if (cv.contact.length > 0) {
      head.space(6);
      head.text(cv.contact.map((entry) => entry.value.replace(/\n/g, ", ")).join("   ·   "), {
        size: 8.8,
        color: P.sub,
        leading: 1.5,
      });
    }
    const full = new Flow(
      MARGIN,
      WIDTH - 2 * MARGIN,
      Math.min(head.y, photo ? HEIGHT - TOP - photoSize + 6 : head.y) - 6,
      "paper",
    );
    summary(full);
    matrixGrid(full);
    const asideWidth = 160;
    const main = new Flow(MARGIN, WIDTH - 2 * MARGIN - asideWidth - 28, 0, "paper").after(full);
    const aside = new Flow(WIDTH - MARGIN - asideWidth, asideWidth, 0, "paper").after(full);
    projects(main);
    roles(aside);
    education(aside);
    languages(aside);
    certificates(aside);
    hobbies(aside);
  }

  // Footers, now that the number of pages is known.
  for (const [index, target] of pages.entries()) {
    const label = clean(cv.labels.page(index + 1, pages.length));
    const footer = [cv.name, label].filter(Boolean).join("  ·  ");
    const size = 7.5;
    const right = layout === "sidebarRight" ? WIDTH - SIDEBAR - 24 : WIDTH - MARGIN;
    target.drawText(footer, {
      x: right - regular.widthOfTextAtSize(footer, size),
      y: 26,
      size,
      font: regular,
      color: color(P.sub),
    });
  }
  return pdf.save();
}

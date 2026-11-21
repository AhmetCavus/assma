import {
  formatPeriod,
  formatYears,
  roleRows,
  skillRows,
  totalYears,
  type Copy,
  type ExperienceProfile,
  type ExperienceReference,
} from "@assma/shared";

/** One tailored CV, as the preview, the Markdown and the PDF all render it. */
export type CvDocument = {
  name: string;
  headline: string;
  experience: string;
  photo: string | null;
  contact: { kind: "address" | "phone" | "email" | "web" | "location"; value: string }[];
  summary: string;
  matrix: { name: string; years: number; yearsLabel: string; detail: string }[];
  roles: { name: string; yearsLabel: string }[];
  references: {
    organization: string;
    role: string;
    period: string;
    contribution: string;
    skills: string[];
  }[];
  certificates: { name: string; detail: string }[];
  hobbies: string[];
  labels: {
    contact: string;
    matrix: string;
    roles: string;
    profile: string;
    projects: string;
    certificates: string;
    hobbies: string;
    skillColumn: string;
    yearsColumn: string;
    projectsColumn: string;
    lastColumn: string;
    page: (page: number, pages: number) => string;
  };
};

export function cvDocument(options: {
  profile: ExperienceProfile;
  summary: string;
  /** Selected references in CV order. */
  references: readonly ExperienceReference[];
  /** All references, for the years in the matrix and the total experience. */
  allReferences: readonly ExperienceReference[];
  skills: readonly string[];
  photo: string | null;
  copy: Copy;
  locale: string;
}): CvDocument {
  const { profile, copy, locale } = options;
  const text = copy.cv;
  const years = (value: number) => formatYears(value, locale, text.yearsUnit);
  const rows = skillRows(options.allReferences);
  const byName = new Map(rows.map((row) => [row.name.toLowerCase(), row]));
  const total = totalYears(options.allReferences);
  return {
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
    matrix: options.skills
      .map((name) => byName.get(name.toLowerCase()))
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .map((row) => ({
        name: row.name,
        years: row.years,
        yearsLabel: years(row.years),
        detail: `${text.projectsCount(row.projects)} · ${text.lastUsed(row.lastYear)}`,
      })),
    roles: roleRows(options.allReferences)
      .slice(0, 6)
      .map((row) => ({ name: row.name, yearsLabel: years(row.years) })),
    references: options.references.map((reference) => ({
      organization: reference.organization,
      role: reference.role,
      period: formatPeriod(reference.start, reference.end, locale, copy.experience.today),
      contribution: reference.contribution,
      skills: reference.skills,
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
      `| ${cv.labels.skillColumn} | ${cv.labels.yearsColumn} | ${cv.labels.projectsColumn} |`,
      "| --- | --- | --- |",
      ...cv.matrix.map((row) => `| ${md(row.name)} | ${row.yearsLabel} | ${md(row.detail)} |`),
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

/** The photo cut to a circle as a transparent PNG, so the PDF needs no clipping path. */
async function roundPhoto(dataUrl: string, size = 480): Promise<Uint8Array> {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d")!;
  context.beginPath();
  context.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  context.closePath();
  context.clip();
  context.drawImage(image, 0, 0, size, size);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  return new Uint8Array(await blob!.arrayBuffer());
}

const PALETTE = {
  sidebar: [0.2, 0.11, 0.31],
  sidebarText: [1, 1, 1],
  sidebarMuted: [0.8, 0.74, 0.9],
  sidebarTrack: [0.33, 0.23, 0.45],
  accent: [0.43, 0.25, 0.7],
  ink: [0.13, 0.11, 0.1],
  sub: [0.4, 0.35, 0.32],
  tint: [0.94, 0.9, 0.98],
  line: [0.87, 0.84, 0.81],
} as const;

/**
 * Renders the CV as an A4 PDF: a dark sidebar (photo, contact, skill matrix, certificates,
 * hobbies) beside the main column (name, profile, roles, project history). Both columns flow
 * onto further pages independently. Inter is embedded and subset, so every letter prints.
 */
export async function cvPdf(cv: CvDocument): Promise<Uint8Array> {
  const [{ PDFDocument, rgb }, fontkit, regularUrl, semiboldUrl, boldUrl] = await Promise.all([
    import("pdf-lib"),
    import("@pdf-lib/fontkit"),
    import("inter-font/ttf/Inter-Regular.ttf?url"),
    import("inter-font/ttf/Inter-SemiBold.ttf?url"),
    import("inter-font/ttf/Inter-Bold.ttf?url"),
  ]);
  const color = (value: readonly number[]) => rgb(value[0]!, value[1]!, value[2]!);
  const bytes = async (url: string) => new Uint8Array(await (await fetch(url)).arrayBuffer());

  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit.default);
  pdf.setTitle(cv.name ? `CV ${cv.name}` : "CV");
  pdf.setAuthor(cv.name);
  pdf.setCreator("assma");
  // The fonts are embedded whole: fontkit's subsetting drops glyphs of Inter (letters vanish
  // from the page while the text layer stays intact), a known pdf-lib problem. pdf-lib
  // compresses the font streams, so the three cuts add about 0.5 MB. Contextual alternates
  // and ligatures are off: Inter swaps "+", "-" and "–" for differently sized forms next to
  // digits, which pdf-lib would measure with the wrong width.
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

  const width = 595.28;
  const height = 841.89;
  const sidebarWidth = 196;
  const top = 48;
  const bottom = 54;
  const pages: ReturnType<typeof pdf.addPage>[] = [];
  const page = (index: number) => {
    while (pages.length <= index) {
      const added = pdf.addPage([width, height]);
      added.drawRectangle({
        x: 0,
        y: 0,
        width: sidebarWidth,
        height,
        color: color(PALETTE.sidebar),
      });
      pages.push(added);
    }
    return pages[index]!;
  };

  /** Characters the font has no glyph for (emoji, rare symbols) are dropped, not printed as boxes. */
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

  /** A column that writes top to bottom and continues on the next page when full. */
  class Flow {
    page = 0;
    y = height - top;
    constructor(
      readonly x: number,
      readonly width: number,
    ) {}
    ensure(space: number) {
      if (this.y - space < bottom) {
        this.page += 1;
        this.y = height - top;
      }
      return page(this.page);
    }
    text(
      text: string,
      options: {
        font?: Font;
        size?: number;
        color?: readonly number[];
        gap?: number;
        indent?: number;
        leading?: number;
      },
    ) {
      const font = options.font ?? regular;
      const size = options.size ?? 9.5;
      const leading = size * (options.leading ?? 1.42);
      const indent = options.indent ?? 0;
      for (const line of wrap(text, font, size, this.width - indent)) {
        const target = this.ensure(leading);
        this.y -= leading;
        target.drawText(line, {
          x: this.x + indent,
          y: this.y + size * 0.28,
          size,
          font,
          color: color(options.color ?? PALETTE.ink),
        });
      }
      this.y -= options.gap ?? 0;
    }
    space(amount: number) {
      this.y -= amount;
    }
  }

  const side = new Flow(24, sidebarWidth - 48);
  const main = new Flow(sidebarWidth + 30, width - sidebarWidth - 30 - 40);

  const sideHeading = (label: string) => {
    side.space(16);
    side.ensure(40);
    side.text(label.toUpperCase(), { font: bold, size: 8.5, color: PALETTE.sidebarMuted, gap: 4 });
    page(side.page).drawRectangle({
      x: side.x,
      y: side.y + 2,
      width: 22,
      height: 1.6,
      color: color(PALETTE.sidebarMuted),
    });
    side.space(6);
  };

  const mainHeading = (label: string) => {
    main.space(18);
    main.ensure(46);
    main.text(label.toUpperCase(), { font: bold, size: 9.5, color: PALETTE.accent, gap: 3 });
    page(main.page).drawRectangle({
      x: main.x,
      y: main.y + 1,
      width: main.width,
      height: 0.8,
      color: color(PALETTE.line),
    });
    page(main.page).drawRectangle({
      x: main.x,
      y: main.y + 0.6,
      width: 34,
      height: 1.8,
      color: color(PALETTE.accent),
    });
    main.space(8);
  };

  // Sidebar -------------------------------------------------------------------------------
  page(0);
  if (cv.photo) {
    const photo = await pdf.embedPng(await roundPhoto(cv.photo));
    const diameter = 118;
    const centerX = sidebarWidth / 2;
    const centerY = height - top - diameter / 2;
    page(0).drawCircle({
      x: centerX,
      y: centerY,
      size: diameter / 2 + 3,
      color: color(PALETTE.sidebarMuted),
    });
    page(0).drawImage(photo, {
      x: centerX - diameter / 2,
      y: centerY - diameter / 2,
      width: diameter,
      height: diameter,
    });
    side.y = centerY - diameter / 2 - 8;
  }

  if (cv.contact.length > 0) {
    sideHeading(cv.labels.contact);
    for (const entry of cv.contact) {
      side.text(entry.value, { size: 8.8, color: PALETTE.sidebarText, gap: 5, leading: 1.35 });
    }
  }

  if (cv.matrix.length > 0) {
    sideHeading(cv.labels.matrix);
    const longest = Math.max(...cv.matrix.map((row) => row.years), 1);
    for (const row of cv.matrix) {
      const target = side.ensure(28);
      const size = 8.8;
      const label = clean(row.yearsLabel);
      const labelWidth = semibold.widthOfTextAtSize(label, size);
      const name = wrap(row.name, semibold, size, side.width - labelWidth - 8)[0] ?? "";
      side.y -= size * 1.4;
      target.drawText(name, {
        x: side.x,
        y: side.y + 2,
        size,
        font: semibold,
        color: color(PALETTE.sidebarText),
      });
      target.drawText(label, {
        x: side.x + side.width - labelWidth,
        y: side.y + 2,
        size,
        font: regular,
        color: color(PALETTE.sidebarMuted),
      });
      side.y -= 5;
      target.drawRectangle({
        x: side.x,
        y: side.y,
        width: side.width,
        height: 3.2,
        color: color(PALETTE.sidebarTrack),
      });
      target.drawRectangle({
        x: side.x,
        y: side.y,
        width: Math.max(6, (side.width * row.years) / longest),
        height: 3.2,
        color: color(PALETTE.sidebarMuted),
      });
      side.y -= 7;
    }
  }

  if (cv.certificates.length > 0) {
    sideHeading(cv.labels.certificates);
    for (const certificate of cv.certificates) {
      side.text(certificate.name, {
        font: semibold,
        size: 8.8,
        color: PALETTE.sidebarText,
        leading: 1.35,
      });
      if (certificate.detail) {
        side.text(certificate.detail, { size: 8, color: PALETTE.sidebarMuted, leading: 1.35 });
      }
      side.space(5);
    }
  }

  if (cv.hobbies.length > 0) {
    sideHeading(cv.labels.hobbies);
    side.text(cv.hobbies.join(" · "), { size: 8.8, color: PALETTE.sidebarText, leading: 1.45 });
  }

  // Main column ---------------------------------------------------------------------------
  main.text(cv.name || "CV", { font: bold, size: 27, color: PALETTE.ink, leading: 1.15, gap: 2 });
  if (cv.headline) {
    main.text(cv.headline, { font: semibold, size: 13, color: PALETTE.accent, gap: 4 });
  }
  if (cv.experience) {
    const size = 8.6;
    const label = clean(cv.experience);
    const pillWidth = semibold.widthOfTextAtSize(label, size) + 16;
    main.space(4);
    const target = main.ensure(20);
    main.y -= 16;
    target.drawRectangle({
      x: main.x,
      y: main.y,
      width: pillWidth,
      height: 16,
      color: color(PALETTE.tint),
    });
    target.drawText(label, {
      x: main.x + 8,
      y: main.y + 4.8,
      size,
      font: semibold,
      color: color(PALETTE.accent),
    });
  }

  if (cv.summary) {
    mainHeading(cv.labels.profile);
    main.text(cv.summary, { size: 10, leading: 1.5 });
  }

  if (cv.roles.length > 0) {
    mainHeading(cv.labels.roles);
    for (const role of cv.roles) {
      const target = main.ensure(16);
      const size = 9.6;
      const label = clean(role.yearsLabel);
      const labelWidth = semibold.widthOfTextAtSize(label, size);
      const name = wrap(role.name, regular, size, main.width - labelWidth - 20)[0] ?? "";
      main.y -= size * 1.55;
      target.drawText(name, {
        x: main.x,
        y: main.y + 3,
        size,
        font: regular,
        color: color(PALETTE.ink),
      });
      // A dotted leader joins the role to its years.
      const start = main.x + regular.widthOfTextAtSize(name, size) + 6;
      const end = main.x + main.width - labelWidth - 6;
      for (let x = start; x < end; x += 4) {
        target.drawCircle({ x, y: main.y + 4.5, size: 0.45, color: color(PALETTE.line) });
      }
      target.drawText(label, {
        x: main.x + main.width - labelWidth,
        y: main.y + 3,
        size,
        font: semibold,
        color: color(PALETTE.accent),
      });
    }
  }

  if (cv.references.length > 0) {
    mainHeading(cv.labels.projects);
    const indent = 14;
    for (const reference of cv.references) {
      main.space(6);
      const target = main.ensure(60);
      const startY = main.y;
      const period = clean(reference.period);
      const periodWidth = semibold.widthOfTextAtSize(period, 8.6);
      const title = wrap(
        reference.organization,
        bold,
        11.2,
        main.width - indent - periodWidth - 12,
      );
      main.y -= 11.2 * 1.3;
      target.drawText(title[0] ?? "", {
        x: main.x + indent,
        y: main.y + 3,
        size: 11.2,
        font: bold,
        color: color(PALETTE.ink),
      });
      target.drawText(period, {
        x: main.x + main.width - periodWidth,
        y: main.y + 4,
        size: 8.6,
        font: semibold,
        color: color(PALETTE.accent),
      });
      for (const line of title.slice(1)) {
        main.text(line, { font: bold, size: 11.2, indent, leading: 1.3 });
      }
      main.text(reference.role, { font: semibold, size: 9.4, color: PALETTE.sub, indent, gap: 2 });
      main.text(reference.contribution, { size: 9.5, indent, leading: 1.48, gap: 3 });
      if (reference.skills.length > 0) {
        // Tags wrap like words.
        const size = 7.6;
        let x = main.x + indent;
        main.ensure(16);
        main.y -= 14;
        for (const skill of reference.skills) {
          const label = clean(skill);
          const tagWidth = semibold.widthOfTextAtSize(label, size) + 10;
          if (x + tagWidth > main.x + main.width) {
            x = main.x + indent;
            main.ensure(16);
            main.y -= 15;
          }
          const tagPage = page(main.page);
          tagPage.drawRectangle({
            x,
            y: main.y,
            width: tagWidth,
            height: 12,
            color: color(PALETTE.tint),
          });
          tagPage.drawText(label, {
            x: x + 5,
            y: main.y + 3.4,
            size,
            font: semibold,
            color: color(PALETTE.accent),
          });
          x += tagWidth + 4;
        }
        main.space(4);
      }
      // Timeline: a dot at the entry and a line down its left edge (on the entry's first page).
      const dotPage = page(target === pages[main.page] ? main.page : pages.indexOf(target));
      dotPage.drawCircle({
        x: main.x + 3,
        y: startY - 11,
        size: 3.2,
        color: color(PALETTE.accent),
      });
      if (target === pages[main.page]) {
        dotPage.drawLine({
          start: { x: main.x + 3, y: startY - 16 },
          end: { x: main.x + 3, y: main.y + 2 },
          thickness: 0.8,
          color: color(PALETTE.line),
        });
      }
    }
  }

  // Footers, now that the number of pages is known.
  for (const [index, target] of pages.entries()) {
    const label = clean(cv.labels.page(index + 1, pages.length));
    const footer = [cv.name, label].filter(Boolean).join("  ·  ");
    const size = 7.5;
    target.drawText(footer, {
      x: width - 40 - regular.widthOfTextAtSize(footer, size),
      y: 26,
      size,
      font: regular,
      color: color(PALETTE.sub),
    });
  }
  return pdf.save();
}

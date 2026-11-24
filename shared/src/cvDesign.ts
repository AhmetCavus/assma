import { z } from "zod";

/**
 * Design options of a tailored CV: colour theme, page layout and photo frame. The preview
 * and the PDF read the same values, so both show the same design.
 */

/** An RGB colour with channels from 0 to 1, as the PDF library expects. */
export type Rgb = readonly [number, number, number];

export type CvPalette = {
  /** Sidebar, header band or other colour area. */
  panel: Rgb;
  panelText: Rgb;
  panelMuted: Rgb;
  /** Empty part of a skill bar on the colour area. */
  panelTrack: Rgb;
  accent: Rgb;
  /** Light fill behind tags and the experience badge. */
  tint: Rgb;
  ink: Rgb;
  sub: Rgb;
  line: Rgb;
  /** Empty part of a skill bar on white. */
  track: Rgb;
};

const hex = (value: string): Rgb => [
  parseInt(value.slice(1, 3), 16) / 255,
  parseInt(value.slice(3, 5), 16) / 255,
  parseInt(value.slice(5, 7), 16) / 255,
];

const palette = (colors: Record<keyof CvPalette, string>): CvPalette =>
  Object.fromEntries(Object.entries(colors).map(([key, value]) => [key, hex(value)])) as CvPalette;

const BASE = { ink: "#221d1a", sub: "#655a52", line: "#ded6ce" };

export const CV_THEMES = {
  aubergine: palette({
    ...BASE,
    panel: "#331c4f",
    panelText: "#ffffff",
    panelMuted: "#ccbde6",
    panelTrack: "#54395f",
    accent: "#6e40b2",
    tint: "#efe5fa",
    track: "#e7def3",
  }),
  ocean: palette({
    ...BASE,
    panel: "#12324a",
    panelText: "#ffffff",
    panelMuted: "#a9d3e6",
    panelTrack: "#2c4d66",
    accent: "#0f6f8f",
    tint: "#e1f1f7",
    track: "#d6e9f1",
  }),
  forest: palette({
    ...BASE,
    panel: "#1f3a2c",
    panelText: "#ffffff",
    panelMuted: "#b5d8bf",
    panelTrack: "#365442",
    accent: "#2f7a4f",
    tint: "#e3f2e8",
    track: "#d7eadc",
  }),
  graphite: palette({
    ...BASE,
    panel: "#26282c",
    panelText: "#ffffff",
    panelMuted: "#f2c27a",
    panelTrack: "#45474c",
    accent: "#b4741f",
    tint: "#f8ecda",
    track: "#ece4d6",
  }),
  bordeaux: palette({
    ...BASE,
    panel: "#4a1626",
    panelText: "#ffffff",
    panelMuted: "#efbfcb",
    panelTrack: "#6a3040",
    accent: "#9b2c4a",
    tint: "#f8e4ea",
    track: "#f0dbe1",
  }),
  sand: palette({
    ...BASE,
    panel: "#f1e9dc",
    panelText: "#2b2420",
    panelMuted: "#8a6d4b",
    panelTrack: "#e0d3bf",
    accent: "#8a5a2b",
    tint: "#f4ebdd",
    track: "#ece2d2",
  }),
  petrol: palette({
    ...BASE,
    panel: "#0f3d3e",
    panelText: "#ffffff",
    panelMuted: "#9fd6cf",
    panelTrack: "#2a5859",
    accent: "#13706d",
    tint: "#e0f2ef",
    track: "#d3ebe7",
  }),
  midnight: palette({
    ...BASE,
    panel: "#141b34",
    panelText: "#ffffff",
    panelMuted: "#b9c4f2",
    panelTrack: "#2e3656",
    accent: "#3b4fa8",
    tint: "#e6e9f8",
    track: "#dadff3",
  }),
  terracotta: palette({
    ...BASE,
    panel: "#5a2a1c",
    panelText: "#ffffff",
    panelMuted: "#f3c3a8",
    panelTrack: "#774233",
    accent: "#a4482a",
    tint: "#f9e7de",
    track: "#f1dbd0",
  }),
  olive: palette({
    ...BASE,
    panel: "#33381c",
    panelText: "#ffffff",
    panelMuted: "#d6dc9c",
    panelTrack: "#4c5233",
    accent: "#5d6a1c",
    tint: "#eef0dc",
    track: "#e4e7cd",
  }),
  mist: palette({
    ...BASE,
    panel: "#e4ebf2",
    panelText: "#1f2a36",
    panelMuted: "#44627f",
    panelTrack: "#cbd6e1",
    accent: "#3a5f83",
    tint: "#e8eff6",
    track: "#dde6ef",
  }),
} satisfies Record<string, CvPalette>;

export type CvThemeId = keyof typeof CV_THEMES;
export const CV_THEME_IDS = Object.keys(CV_THEMES) as CvThemeId[];

/** The first layout is the original one and stays the default. */
export const CV_LAYOUTS = [
  "sidebar",
  "sidebarRight",
  "header",
  "classic",
  "modern",
  "sidebarSoft",
  "banner",
  "minimal",
  "margin",
  "columns",
] as const;
export type CvLayoutId = (typeof CV_LAYOUTS)[number];

/** Layouts whose photo sits on the colour area, so its frame takes the light accent. */
export const PHOTO_ON_PANEL: readonly CvLayoutId[] = [
  "sidebar",
  "sidebarRight",
  "header",
  "banner",
];

export const PHOTO_SHAPES = ["circle", "rounded", "square", "hexagon", "ring"] as const;
export type PhotoShape = (typeof PHOTO_SHAPES)[number];

export const CV_LANGUAGES = ["de", "en"] as const;
export type CvLanguage = (typeof CV_LANGUAGES)[number];

export const cvDesignSchema = z.object({
  theme: z.enum(CV_THEME_IDS as [CvThemeId, ...CvThemeId[]]).default("aubergine"),
  layout: z.enum(CV_LAYOUTS).default("sidebar"),
  photoShape: z.enum(PHOTO_SHAPES).default("circle"),
});
export type CvDesign = z.infer<typeof cvDesignSchema>;

export const DEFAULT_CV_DESIGN: CvDesign = {
  theme: "aubergine",
  layout: "sidebar",
  photoShape: "circle",
};

/** "#rrggbb" for CSS. */
export function cssColor(color: Rgb): string {
  return `#${color
    .map((channel) =>
      Math.round(channel * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

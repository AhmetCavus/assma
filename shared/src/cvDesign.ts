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
} satisfies Record<string, CvPalette>;

export type CvThemeId = keyof typeof CV_THEMES;
export const CV_THEME_IDS = Object.keys(CV_THEMES) as CvThemeId[];

/** The first layout is the original one and stays the default. */
export const CV_LAYOUTS = ["sidebar", "sidebarRight", "header", "classic", "modern"] as const;
export type CvLayoutId = (typeof CV_LAYOUTS)[number];

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

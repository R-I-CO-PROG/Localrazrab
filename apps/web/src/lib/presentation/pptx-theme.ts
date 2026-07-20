import type { BrandPaletteSettings } from "@/lib/brand-palette";

export const SLIDE_W = 10;
export const SLIDE_H = 5.625;
export const SIDEBAR_W = 0.28;
export const CONTENT_X = SIDEBAR_W + 0.35;
export const CONTENT_W = SLIDE_W - CONTENT_X - 0.35;

export interface PptxTheme {
  dark: string;
  light: string;
  primary: string;
  accent: string;
  textOnDark: string;
  textMutedOnDark: string;
  textOnLight: string;
  line: string;
  fontFace: string;
  projectTitle: string;
}

function hexNoHash(color: string): string {
  return color.replace("#", "").toUpperCase();
}

export function createPptxTheme(
  brand: BrandPaletteSettings | undefined,
  projectTitle: string,
): PptxTheme {
  const primary = hexNoHash(brand?.activeColors[0] ?? "#1E3A5F");
  const accent = hexNoHash(brand?.activeColors[1] ?? brand?.activeColors[0] ?? "#C41E3A");

  return {
    dark: "0A0E1A",
    light: "ECECEC",
    primary,
    accent,
    textOnDark: "FFFFFF",
    textMutedOnDark: "C8D0DC",
    textOnLight: "1A1A1A",
    line: "FFFFFF",
    fontFace: "Segoe UI",
    projectTitle,
  };
}

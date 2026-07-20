import type { PresentationStylePreset, PresentationTheme } from "./types";

const BASE_LAYOUT = {
  aspectRatio: "16:9" as const,
  safeMargin: 48,
  gridColumns: 12,
};

export const PRESENTATION_THEMES: Record<PresentationStylePreset, PresentationTheme> = {
  premium_dark_tech: {
    id: "premium_dark_tech",
    name: "Premium Dark Tech",
    colors: {
      background: "#020818",
      backgroundSecondary: "#0C2848",
      primary: "#005BFF",
      accent: "#00B7FF",
      text: "#FFFFFF",
      mutedText: "#94A3B8",
      border: "rgba(0, 183, 255, 0.35)",
      card: "rgba(12, 40, 72, 0.72)",
    },
    typography: {
      headingFont: "Arial Black, Arial, sans-serif",
      bodyFont: "Arial, Helvetica, sans-serif",
      headingWeight: 800,
      bodyWeight: 400,
    },
    effects: {
      glow: true,
      glassmorphism: true,
      noise: true,
      gradients: true,
      reflections: true,
    },
    layout: BASE_LAYOUT,
  },
  new_year_dark: {
    id: "new_year_dark",
    name: "New Year Dark",
    colors: {
      background: "#050D1A",
      backgroundSecondary: "#142238",
      primary: "#3B82F6",
      accent: "#60A5FA",
      text: "#FFFFFF",
      mutedText: "#CBD5E1",
      border: "rgba(96, 165, 250, 0.4)",
      card: "rgba(20, 34, 56, 0.78)",
    },
    typography: {
      headingFont: "Arial Black, Arial, sans-serif",
      bodyFont: "Arial, Helvetica, sans-serif",
      headingWeight: 800,
      bodyWeight: 400,
    },
    effects: {
      glow: true,
      glassmorphism: true,
      noise: false,
      gradients: true,
      reflections: true,
    },
    layout: BASE_LAYOUT,
  },
  minimal_luxury: {
    id: "minimal_luxury",
    name: "Minimal Luxury",
    colors: {
      background: "#0A0A0A",
      backgroundSecondary: "#1A1A1A",
      primary: "#C9A962",
      accent: "#E8D5A3",
      text: "#FAFAFA",
      mutedText: "#A3A3A3",
      border: "rgba(201, 169, 98, 0.3)",
      card: "rgba(26, 26, 26, 0.85)",
    },
    typography: {
      headingFont: "Georgia, serif",
      bodyFont: "Arial, sans-serif",
      headingWeight: 700,
      bodyWeight: 400,
    },
    effects: {
      glow: false,
      glassmorphism: true,
      noise: false,
      gradients: true,
      reflections: false,
    },
    layout: BASE_LAYOUT,
  },
  corporate_light: {
    id: "corporate_light",
    name: "Corporate Light",
    colors: {
      background: "#F8FAFC",
      backgroundSecondary: "#E2E8F0",
      primary: "#1E3A5F",
      accent: "#2563EB",
      text: "#0F172A",
      mutedText: "#64748B",
      border: "rgba(37, 99, 235, 0.2)",
      card: "rgba(255, 255, 255, 0.92)",
    },
    typography: {
      headingFont: "Arial, sans-serif",
      bodyFont: "Arial, sans-serif",
      headingWeight: 700,
      bodyWeight: 400,
    },
    effects: {
      glow: false,
      glassmorphism: false,
      noise: false,
      gradients: true,
      reflections: false,
    },
    layout: BASE_LAYOUT,
  },
  sport_energy: {
    id: "sport_energy",
    name: "Sport Energy",
    colors: {
      background: "#0B0F14",
      backgroundSecondary: "#1A2332",
      primary: "#FF4D00",
      accent: "#FFB800",
      text: "#FFFFFF",
      mutedText: "#94A3B8",
      border: "rgba(255, 77, 0, 0.35)",
      card: "rgba(26, 35, 50, 0.8)",
    },
    typography: {
      headingFont: "Arial Black, Arial, sans-serif",
      bodyFont: "Arial, sans-serif",
      headingWeight: 800,
      bodyWeight: 400,
    },
    effects: {
      glow: true,
      glassmorphism: false,
      noise: true,
      gradients: true,
      reflections: true,
    },
    layout: BASE_LAYOUT,
  },
  eco_natural: {
    id: "eco_natural",
    name: "Eco Natural",
    colors: {
      background: "#0F1A14",
      backgroundSecondary: "#1C2E24",
      primary: "#2D6A4F",
      accent: "#52B788",
      text: "#F0FDF4",
      mutedText: "#A7C4B5",
      border: "rgba(82, 183, 136, 0.35)",
      card: "rgba(28, 46, 36, 0.82)",
    },
    typography: {
      headingFont: "Georgia, serif",
      bodyFont: "Arial, sans-serif",
      headingWeight: 700,
      bodyWeight: 400,
    },
    effects: {
      glow: false,
      glassmorphism: true,
      noise: false,
      gradients: true,
      reflections: false,
    },
    layout: BASE_LAYOUT,
  },
};

export function getTheme(preset: PresentationStylePreset): PresentationTheme {
  return PRESENTATION_THEMES[preset] ?? PRESENTATION_THEMES.premium_dark_tech;
}

export function themeFromBrandColors(
  preset: PresentationStylePreset,
  brandColors?: string[],
): PresentationTheme {
  const base = getTheme(preset);
  if (!brandColors?.length) return base;

  const primary = brandColors[0]?.startsWith("#") ? brandColors[0] : `#${brandColors[0]}`;
  const accent = brandColors[1]?.startsWith("#")
    ? brandColors[1]
    : brandColors[0]?.startsWith("#")
      ? brandColors[0]
      : base.colors.accent;

  return {
    ...base,
    colors: {
      ...base.colors,
      primary,
      accent,
    },
  };
}

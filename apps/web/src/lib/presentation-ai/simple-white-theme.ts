import type { PresentationTheme } from "./types";

/** Единый стиль презентаций: белый фон, тёмный текст, фото справа. */
export const SIMPLE_WHITE_PRESENTATION_THEME: PresentationTheme = {
  id: "corporate_light",
  name: "Белый минимализм",
  colors: {
    background: "#FFFFFF",
    backgroundSecondary: "#FFFFFF",
    primary: "#1E3A5F",
    accent: "#2563EB",
    text: "#0F172A",
    mutedText: "#64748B",
    border: "rgba(15, 23, 42, 0.12)",
    card: "rgba(248, 250, 252, 0.95)",
  },
  typography: {
    headingFont: "Arial, sans-serif",
    bodyFont: "Arial, Helvetica, sans-serif",
    headingWeight: 700,
    bodyWeight: 400,
  },
  effects: {
    glow: false,
    glassmorphism: false,
    noise: false,
    gradients: false,
    reflections: false,
  },
  layout: {
    aspectRatio: "16:9",
    safeMargin: 48,
    gridColumns: 12,
  },
};

export function getSimpleWhitePresentationTheme(): PresentationTheme {
  return SIMPLE_WHITE_PRESENTATION_THEME;
}

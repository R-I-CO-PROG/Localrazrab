import type { BrandPaletteSettings } from "@/lib/brand-palette";

export type DeckMood = "new-year-tech" | "corporate-premium" | "warm-welcome";

export interface DeckArtDirection {
  mood: DeckMood;
  primaryHex: string;
  accentHex: string;
  glowHex: string;
  bgTop: string;
  bgBottom: string;
  coverTitleLine1: string;
  coverTitleLine2: string;
  coverSubtitle: string;
  footerLeft: string;
  footerRight: string;
}

function normalizeHex(color: string | undefined, fallback: string): string {
  const raw = (color ?? fallback).replace("#", "").trim();
  if (/^[0-9A-Fa-f]{6}$/.test(raw)) return raw.toUpperCase();
  return fallback.replace("#", "").toUpperCase();
}

function inferMood(prompt: string, title: string): DeckMood {
  const text = `${prompt} ${title}`.toLowerCase();
  if (/новый год|нг|праздник|ёлк|рождеств|winter|snow|gift set/i.test(text)) {
    return "new-year-tech";
  }
  if (
    /технолог|tech|it-|it |digital|премиал|тёмн|темн|dark|футурист|корпоратив|деловой/i.test(text)
  ) {
    return "corporate-premium";
  }
  if (/welcome\s*pack|welcome-набор|онбординг/i.test(text)) {
    return "warm-welcome";
  }
  if (/welcome|онбординг/i.test(text) && !/it|tech|технолог/i.test(text)) {
    return "warm-welcome";
  }
  return "corporate-premium";
}

export function createDeckArtDirection(input: {
  title: string;
  prompt: string;
  brand?: BrandPaletteSettings;
  partnerName?: string;
}): DeckArtDirection {
  const mood = inferMood(input.prompt, input.title);
  const primary = normalizeHex(input.brand?.activeColors?.[0], "#1B3A6B");
  const accent = normalizeHex(
    input.brand?.activeColors?.[1] ?? input.brand?.activeColors?.[0],
    mood === "new-year-tech" ? "#3B82F6" : "#C41E3A",
  );

  const presets: Record<
    DeckMood,
    Pick<DeckArtDirection, "bgTop" | "bgBottom" | "glowHex" | "coverTitleLine1" | "coverTitleLine2">
  > = {
    "new-year-tech": {
      bgTop: "020818",
      bgBottom: "0C2848",
      glowHex: accent,
      coverTitleLine1: "ПОДАРОЧНЫЙ",
      coverTitleLine2: "КОМПЛЕКТ",
    },
    "corporate-premium": {
      bgTop: "020818",
      bgBottom: "0C2848",
      glowHex: accent,
      coverTitleLine1: "КОРПОРАТИВНАЯ",
      coverTitleLine2: "КОЛЛЕКЦИЯ",
    },
    "warm-welcome": {
      bgTop: "120E0A",
      bgBottom: "2A1E18",
      glowHex: accent,
      coverTitleLine1: "WELCOME",
      coverTitleLine2: "НАБОР",
    },
  };

  const preset = presets[mood];
  const partner = input.partnerName?.trim() || "Mercai";

  return {
    mood,
    primaryHex: primary,
    accentHex: accent,
    glowHex: preset.glowHex,
    bgTop: preset.bgTop,
    bgBottom: preset.bgBottom,
    coverTitleLine1: preset.coverTitleLine1,
    coverTitleLine2: preset.coverTitleLine2,
    coverSubtitle: input.title,
    footerLeft: "mercai.ru",
    footerRight: partner,
  };
}

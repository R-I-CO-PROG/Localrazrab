import sharp from "sharp";
import type { BrandAnalysis, BrandInput, PresentationStylePreset } from "../types";
import { getTheme, themeFromBrandColors } from "../themes";
import {
  buildBrandAnalysisSystemPrompt,
  buildBrandAnalysisUserMessage,
} from "../prompts/brand-analysis";
import { brandAnalysisSchema, parseJsonWithRepair } from "../schemas";
import { getTextProvider } from "../providers/text-provider";

async function extractColorsFromLogo(logoUrl?: string): Promise<string[]> {
  if (!logoUrl) return [];
  try {
    let buffer: Buffer;
    if (logoUrl.startsWith("data:")) {
      const match = /^data:[^;]+;base64,(.+)$/i.exec(logoUrl);
      if (!match) return [];
      buffer = Buffer.from(match[1], "base64");
    } else {
      const res = await fetch(logoUrl);
      if (!res.ok) return [];
      buffer = Buffer.from(await res.arrayBuffer());
    }
    const stats = await sharp(buffer).resize(128, 128, { fit: "inside" }).stats();
    const channels = [stats.channels[0], stats.channels[1], stats.channels[2]];
    const hex = `#${channels.map((ch) => Math.round(ch.mean).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
    return [hex];
  } catch {
    return [];
  }
}

function fallbackBrandAnalysis(
  brand: BrandInput,
  stylePreset: PresentationStylePreset,
  colorsFromLogo: string[],
): BrandAnalysis {
  const theme = getTheme(stylePreset);
  const userColors = brand.colors?.filter(Boolean) ?? [];
  const primaryColors =
    userColors.length > 0
      ? userColors.slice(0, 3)
      : colorsFromLogo.length > 0
        ? colorsFromLogo
        : [theme.colors.primary, theme.colors.accent, theme.colors.text];

  return {
    brandName: brand.name,
    brandPersonality: ["premium", "corporate", "reliable"],
    visualTone: stylePreset.includes("dark") ? "dark premium futuristic corporate" : "premium corporate",
    primaryColors,
    accentColors: [theme.colors.accent],
    typographyMood: "condensed bold headings, clean sans-serif body",
    logoUsageRules: {
      preferredBackground: stylePreset.includes("light") ? "light" : "dark",
      minimumContrast: "high",
      placement: ["top-right", "product", "packaging"],
    },
    designKeywords: [
      "corporate gift",
      "premium catalog",
      "brand consistency",
      brand.name,
    ],
  };
}

export async function analyzeBrand(input: {
  brand: BrandInput;
  stylePreset: PresentationStylePreset;
  occasion?: string;
  language?: string;
}): Promise<BrandAnalysis> {
  const colorsFromLogo = await extractColorsFromLogo(input.brand.logoUrl);
  const text = getTextProvider();

  if (!text.isAvailable()) {
    return fallbackBrandAnalysis(input.brand, input.stylePreset, colorsFromLogo);
  }

  try {
    const raw = await text.generateText({
      systemPrompt: buildBrandAnalysisSystemPrompt(input.language ?? "ru"),
      userMessage: buildBrandAnalysisUserMessage({
        brand: input.brand,
        stylePreset: input.stylePreset,
        occasion: input.occasion,
        colorsFromLogo,
      }),
      temperature: 0.4,
    });
    const analysis = parseJsonWithRepair(raw, brandAnalysisSchema);

    const placement = analysis.logoUsageRules.placement
      .map((p) => {
        const normalized = p.toLowerCase().replace(/\s+/g, "-");
        if (normalized.includes("product")) return "product" as const;
        if (normalized.includes("packaging")) return "packaging" as const;
        if (normalized.includes("top-right")) return "top-right" as const;
        if (normalized.includes("top-left")) return "top-left" as const;
        if (normalized.includes("bottom-right")) return "bottom-right" as const;
        return "top-right" as const;
      })
      .filter((v, i, a) => a.indexOf(v) === i);

    if (!input.brand.colors?.length && colorsFromLogo.length) {
      analysis.primaryColors = [...new Set([...colorsFromLogo, ...analysis.primaryColors])].slice(0, 4);
    }
    if (input.brand.colors?.length) {
      analysis.primaryColors = input.brand.colors.slice(0, 4);
    }
    return {
      ...analysis,
      logoUsageRules: {
        ...analysis.logoUsageRules,
        placement,
      },
    } satisfies BrandAnalysis;
  } catch {
    return fallbackBrandAnalysis(input.brand, input.stylePreset, colorsFromLogo);
  }
}

export function resolveThemeFromAnalysis(
  stylePreset: PresentationStylePreset,
  analysis: BrandAnalysis,
) {
  return themeFromBrandColors(stylePreset, analysis.primaryColors);
}

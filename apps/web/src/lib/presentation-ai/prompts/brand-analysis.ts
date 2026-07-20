import type { BrandInput, PresentationStylePreset } from "../types";

export function buildBrandAnalysisSystemPrompt(language: string): string {
  return `Ты — арт-директор и бренд-стратег премиальных B2B-презентаций.
Проанализируй бренд и верни ТОЛЬКО JSON на языке: ${language}.

{
  "brandName": "...",
  "brandPersonality": ["technological", "premium", ...],
  "visualTone": "dark premium futuristic corporate",
  "primaryColors": ["#001A3D", "#005BFF", "#FFFFFF"],
  "accentColors": ["#00B7FF"],
  "typographyMood": "condensed bold headings, clean sans-serif body",
  "logoUsageRules": {
    "preferredBackground": "dark",
    "minimumContrast": "high",
    "placement": ["top-right", "product branding", "packaging"]
  },
  "designKeywords": ["..."]
}

Правила:
- Если цвета не заданы — предложи палитру под стиль.
- personality и keywords — конкретные, не общие слова.
- preferredBackground для premium dark стилей = dark.`;
}

export function buildBrandAnalysisUserMessage(input: {
  brand: BrandInput;
  stylePreset: PresentationStylePreset;
  occasion?: string;
  colorsFromLogo?: string[];
}): string {
  return [
    `Бренд: ${input.brand.name}`,
    `Описание: ${input.brand.description ?? "не указано"}`,
    `Сайт: ${input.brand.website ?? "не указан"}`,
    `Цвета пользователя: ${input.brand.colors?.join(", ") ?? "не заданы"}`,
    input.colorsFromLogo?.length
      ? `Цвета из логотипа: ${input.colorsFromLogo.join(", ")}`
      : "",
    `Стиль презентации: ${input.stylePreset}`,
    `Повод: ${input.occasion ?? "корпоративный подарок"}`,
    input.brand.logoUrl ? "Логотип приложен как референс." : "Логотип не приложен.",
  ]
    .filter(Boolean)
    .join("\n");
}

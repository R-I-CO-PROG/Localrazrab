import { z } from "zod";
import { ALLOWED_ICON_KEYS } from "./constants";

const iconKeySchema = z.enum([
  "gift",
  "shield",
  "team",
  "star",
  "leaf",
  "laptop",
  "magnet",
  "thermo",
  "spark",
  "heart",
]);

export const productInputSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: z.string().optional(),
  description: z.string().optional(),
  price: z.union([z.number(), z.string()]).optional(),
  images: z.array(z.string()).optional(),
  attributes: z.record(z.string()).optional(),
  sourceVisualizationId: z.string().optional(),
});

export const brandInputSchema = z.object({
  name: z.string().min(1),
  logoUrl: z.string().optional(),
  description: z.string().optional(),
  colors: z.array(z.string()).optional(),
  website: z.string().optional(),
});

export const presentationGenerationInputSchema = z.object({
  brand: brandInputSchema,
  products: z.array(productInputSchema).min(1).max(20),
  occasion: z.string().optional(),
  audience: z.string().optional(),
  language: z.string().default("ru"),
  slideCount: z.number().int().min(4).max(24).optional(),
  stylePreset: z
    .enum([
      "premium_dark_tech",
      "minimal_luxury",
      "corporate_light",
      "new_year_dark",
      "sport_energy",
      "eco_natural",
    ])
    .default("premium_dark_tech"),
  quality: z.enum(["draft", "standard", "premium"]).default("draft"),
  outputFormats: z.array(z.enum(["pdf", "pptx", "html"])).default(["pptx", "html"]),
  references: z.array(z.string()).optional(),
  visualizationIds: z.array(z.string()).optional(),
  visualizationImages: z.array(z.string()).optional(),
  showPrices: z.boolean().default(false),
});

export const brandAnalysisSchema = z.object({
  brandName: z.string(),
  brandPersonality: z.array(z.string()).min(1),
  visualTone: z.string(),
  primaryColors: z.array(z.string()).min(1),
  accentColors: z.array(z.string()),
  typographyMood: z.string(),
  logoUsageRules: z.object({
    preferredBackground: z.enum(["dark", "light"]),
    minimumContrast: z.enum(["high", "medium"]),
    placement: z.array(z.string()),
  }),
  designKeywords: z.array(z.string()),
});

export const conceptSlideSchema = z.object({
  type: z.enum(["cover", "collection_overview", "product", "category", "comparison", "thank_you"]),
  title: z.string(),
  subtitle: z.string().optional(),
  caption: z.string().optional(),
  productId: z.string().optional(),
  layout: z.string().optional(),
});

export const presentationConceptSchema = z.object({
  presentationTitle: z.string(),
  bigIdea: z.string(),
  narrative: z.string(),
  styleDirection: z.object({
    theme: z.string(),
    background: z.string(),
    composition: z.string(),
    visualDensity: z.string(),
    mood: z.string(),
  }),
  slides: z.array(conceptSlideSchema).min(3),
});

export const benefitSchema = z.object({
  title: z.string(),
  text: z.string(),
  icon: iconKeySchema,
});

export const bottomHighlightSchema = z.object({
  label: z.string(),
  accent: z.string(),
});

export const productStorySchema = z.object({
  productId: z.string(),
  title: z.string(),
  subtitle: z.string(),
  description: z.string(),
  benefits: z.array(benefitSchema).length(4),
  bottomHighlights: z.array(bottomHighlightSchema).length(2),
  imagePrompt: z.string(),
  backgroundPrompt: z.string(),
  logoPlacement: z.object({
    position: z.enum(["top-right", "top-left", "bottom-right", "product", "packaging"]),
    scale: z.number().optional(),
  }),
  altText: z.string(),
});

export const slideQaSchema = z.object({
  score: z.number().min(0).max(1),
  issues: z.array(
    z.object({
      type: z.string(),
      severity: z.enum(["low", "medium", "high"]),
      description: z.string(),
    }),
  ),
  shouldRegenerate: z.boolean(),
  suggestedFixes: z.array(z.string()),
});

export function parseJsonWithRepair<T>(
  raw: string,
  schema: z.ZodSchema<T>,
): T {
  let trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) trimmed = fence[1].trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) trimmed = trimmed.slice(start, end + 1);
  }

  const parsed = JSON.parse(trimmed) as unknown;
  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Некорректная структура JSON: ${result.error.message}`);
  }
  return result.data;
}

export function normalizeIconKey(icon: string): (typeof ALLOWED_ICON_KEYS)[number] {
  const key = icon.toLowerCase().trim();
  const map: Record<string, (typeof ALLOWED_ICON_KEYS)[number]> = {
    gift: "gift",
    shield: "shield",
    temperature: "thermo",
    thermo: "thermo",
    magnet: "magnet",
    comfort: "heart",
    users: "team",
    team: "team",
    laptop: "laptop",
    briefcase: "shield",
    eco: "leaf",
    leaf: "leaf",
    premium: "star",
    star: "star",
    visibility: "spark",
    creativity: "spark",
    spark: "spark",
    storage: "gift",
    pen: "gift",
    package: "gift",
    snowflake: "spark",
    connection: "spark",
    satellite: "spark",
    heart: "heart",
  };
  return map[key] ?? "star";
}

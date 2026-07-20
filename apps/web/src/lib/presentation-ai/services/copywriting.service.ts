import { z } from "zod";
import type { BrandAnalysis, ProductInput, ProductStory } from "../types";
import {
  buildCopywritingSystemPrompt,
  buildCopywritingUserMessage,
  buildClosingCopySystemPrompt,
} from "../prompts/copywriting";
import {
  benefitSchema,
  bottomHighlightSchema,
  normalizeIconKey,
  parseJsonWithRepair,
  productStorySchema,
} from "../schemas";
import { getTextProvider } from "../providers/text-provider";
import { buildProductImagePrompt } from "../prompts/image-prompts";
import { sanitizeBottomHighlights } from "../sanitize-bottom-highlights";
import type { StyleDirection } from "../types";

const copyResponseSchema = z.object({
  products: z.array(productStorySchema),
});

function defaultProductStory(product: ProductInput, brandName: string): ProductStory {
  const desc = product.description ?? product.name;
  return {
    productId: product.id,
    title: product.name,
    subtitle: product.category ?? "Премиальное исполнение",
    description: desc,
    benefits: [
      { icon: "gift", title: "Ценность вручения", text: "Создаёт запоминающийся момент и усиливает лояльность к бренду." },
      { icon: "shield", title: "Качество исполнения", text: "Материалы и отделка соответствуют корпоративному уровню." },
      { icon: "team", title: "Для вашей аудитории", text: "Универсален для сотрудников, клиентов и партнёров." },
      { icon: "star", title: "Долгий контакт с брендом", text: `${product.name} остаётся в повседневном использовании.` },
    ],
    bottomHighlights: [
      { label: `Фирменный стиль ${brandName}`, accent: "Единая визуальная система коллекции" },
      { label: "Готово к тиражированию", accent: "Согласование макета и производство под ключ" },
    ],
    imagePrompt: buildProductImagePrompt({
      brandName,
      productName: product.name,
      productDescription: desc,
      brandAnalysis: {
        brandName,
        brandPersonality: [],
        visualTone: "dark premium",
        primaryColors: ["#005BFF"],
        accentColors: ["#00B7FF"],
        typographyMood: "",
        logoUsageRules: { preferredBackground: "dark", minimumContrast: "high", placement: ["product"] },
        designKeywords: [],
      },
      styleDirection: {
        theme: "premium dark",
        background: "dark navy studio",
        composition: "product left",
        visualDensity: "premium",
        mood: "confident",
      },
    }),
    backgroundPrompt: "Dark premium corporate slide background with subtle glow lines, 16:9, no text",
    logoPlacement: { position: "product", scale: 0.15 },
    altText: `${product.name} — корпоративный подарок ${brandName}`,
  };
}

export async function generateProductStories(input: {
  brandAnalysis: BrandAnalysis;
  products: ProductInput[];
  occasion?: string;
  audience?: string;
  styleDirection?: StyleDirection;
  language?: string;
}): Promise<ProductStory[]> {
  const text = getTextProvider();
  const fallback = input.products.map((p) =>
    defaultProductStory(p, input.brandAnalysis.brandName),
  );

  if (!text.isAvailable()) return fallback;

  try {
    const raw = await text.generateText({
      systemPrompt: buildCopywritingSystemPrompt(input.language ?? "ru"),
      userMessage: buildCopywritingUserMessage({
        brandAnalysis: input.brandAnalysis,
        products: input.products,
        occasion: input.occasion,
        audience: input.audience,
        styleDirection: input.styleDirection?.theme,
      }),
      maxTokens: 12000,
      temperature: 0.55,
    });

    const parsed = parseJsonWithRepair(raw, copyResponseSchema);
    const byId = new Map(parsed.products.map((p) => [p.productId, p]));

    return input.products.map((product) => {
      const story = byId.get(product.id);
      if (!story) return defaultProductStory(product, input.brandAnalysis.brandName);
      const fallbackStory = defaultProductStory(product, input.brandAnalysis.brandName);
      return {
        ...story,
        benefits: story.benefits.map((b) => ({
          ...b,
          icon: normalizeIconKey(b.icon),
        })),
        bottomHighlights: sanitizeBottomHighlights(
          story.bottomHighlights,
          fallbackStory.bottomHighlights,
        ),
      };
    });
  } catch {
    return fallback;
  }
}

export async function generateClosingCopy(input: {
  brandAnalysis: BrandAnalysis;
  conceptTitle: string;
  language?: string;
}): Promise<{ title: string; subtitle: string; body: string; bullets: string[]; cta: string }> {
  const fallback = {
    title: "Подарки, которые говорят о главном",
    subtitle: "Готовы обсудить тираж и согласование",
    body: `Мы создали концепцию подарков, которая усиливает команду, ценности и бренд ${input.brandAnalysis.brandName}.`,
    bullets: [
      "Согласование состава и брендирования",
      "Пробный образец и контроль качества",
      "Логистика и вручение под ключ",
    ],
    cta: "Создаём подарки, которые остаются с людьми",
  };

  const text = getTextProvider();
  if (!text.isAvailable()) return fallback;

  try {
    const raw = await text.generateText({
      systemPrompt: buildClosingCopySystemPrompt(input.language ?? "ru"),
      userMessage: `Бренд: ${input.brandAnalysis.brandName}\nПрезентация: ${input.conceptTitle}`,
      temperature: 0.5,
    });
    const schema = z.object({
      title: z.string(),
      subtitle: z.string(),
      body: z.string(),
      bullets: z.array(z.string()),
      cta: z.string(),
    });
    return parseJsonWithRepair(raw, schema);
  } catch {
    return fallback;
  }
}

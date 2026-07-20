import { z } from "zod";
import type {
  BrandPaletteSettings,
  PresentationBenefit,
  PresentationIconKey,
  PresentationSlide,
} from "@/lib/brand-palette";
import { BRAND_STYLE_LABELS } from "@/lib/brand-palette";
import { openRouterChatJson } from "@/lib/openrouter-client";
import {
  buildAgencyPresentationSlides,
  mergeAgencyAiCopyIntoSlides,
} from "./presentation-agency-structure";
import type { PresentationVisualizationInput } from "./presentation-types";

export type { PresentationVisualizationInput } from "./presentation-types";

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

const benefitSchema = z.object({
  icon: iconKeySchema.optional(),
  title: z.string(),
  text: z.string(),
});

const copyItemSchema = z.object({
  slideIndex: z.number().int().nonnegative(),
  title: z.string().optional(),
  subtitle: z.string().optional(),
  body: z.string().optional(),
  bullets: z.array(z.string()).optional(),
  speakerNotes: z.string().optional(),
  benefits: z.array(benefitSchema).optional(),
  footerLeft: z.string().optional(),
  footerRight: z.string().optional(),
});

const aiCopySchema = z.object({
  slides: z.array(copyItemSchema).min(1),
});

const SYSTEM_PROMPT = `Ты — арт-директор и копирайтер премиальных B2B-презентаций уровня Mercury / GTNT (короткий cinematic deck).

Тебе передана ГОТОВАЯ структура agency-презентации о корпоративных подарках. Напиши продающий текст на русском для КАЖДОГО слайда.

Верни ТОЛЬКО JSON:
{
  "slides": [
    {
      "slideIndex": 0,
      "title": "...",
      "subtitle": "...",
      "body": "...",
      "bullets": ["..."],
      "benefits": [
        { "icon": "gift", "title": "...", "text": "..." }
      ],
      "footerLeft": "...",
      "footerRight": "...",
      "speakerNotes": "..."
    }
  ]
}

Типы слайдов:
- agencyCover — эмоциональный подзаголовок к обложке (title уже задан)
- agencyOverview — описание комплекта, subtitle усиливает ценность
- agencyProduct — title = НАЗВАНИЕ ТОВАРА КАПСОМ; benefits = ровно 4 пункта с иконками (gift/shield/team/star/thermo/magnet/laptop/leaf/spark/heart)
- agencyClosing — благодарность, призыв к действию, bullets = 3 следующих шага

Правила:
1. Тон премиальный, уверенный, без канцелярита.
2. Заголовки короткие (до 70 символов). benefits.text — до 120 символов.
3. Не выдумывай цены, артикулы, факты — только из входа.
4. Для agencyProduct benefits раскрывают роль товара в наборе и ценность для бизнеса.
5. Верни запись для КАЖДОГО slideIndex.`;

function buildUserMessage(input: {
  title: string;
  prompt: string;
  brand?: BrandPaletteSettings;
  visualizations: PresentationVisualizationInput[];
  slides: PresentationSlide[];
}): string {
  const style = input.brand
    ? BRAND_STYLE_LABELS[input.brand.activeStyle]
    : "премиальный";
  const colors = input.brand?.activeColors?.join(", ") ?? "не заданы";

  const vizBlocks = input.visualizations.map((viz) => {
    const items = viz.items?.length
      ? viz.items
          .map(
            (item, i) =>
              `    ${i + 1}. ${item.name}${item.price != null ? ` — ${Math.round(item.price)} ₽` : ""}${item.description ? `: ${item.description}` : ""}`,
          )
          .join("\n")
      : "    (концепция без каталога)";

    return [
      `Концепция id="${viz.id}"`,
      `  Название: ${viz.conceptName}`,
      `  Описание: ${viz.description ?? "—"}`,
      `  Товары:\n${items}`,
    ].join("\n");
  });

  const slideOutline = input.slides.map((slide, index) => {
    const parts = [
      `[${index}] type=${slide.type}`,
      slide.productName ? `product="${slide.productName}"` : "",
      slide.title ? `title="${slide.title}"` : "",
      slide.subtitle ? `subtitle="${slide.subtitle}"` : "",
      slide.visualizationId ? `vizId=${slide.visualizationId}` : "",
    ].filter(Boolean);
    return parts.join(" | ");
  });

  return [
    `Проект: ${input.title}`,
    `Бриф: ${input.prompt}`,
    `Стиль: ${style}`,
    `Цвета: ${colors}`,
    "",
    "Концепции:",
    ...vizBlocks,
    "",
    "Слайды (нужен текст для каждого slideIndex):",
    ...slideOutline,
  ].join("\n");
}

function parseAiCopy(raw: string, slideCount: number): z.infer<typeof aiCopySchema> {
  let trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) trimmed = fence[1].trim();
  if (!trimmed.startsWith("{")) {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) trimmed = trimmed.slice(start, end + 1);
  }

  const parsed = JSON.parse(trimmed) as unknown;
  const result = aiCopySchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`AI вернул некорректную структуру: ${result.error.message}`);
  }
  if (result.data.slides.length < Math.min(slideCount, 3)) {
    throw new Error("AI вернул слишком мало текстов для слайдов");
  }
  return result.data;
}

export async function generatePresentationSlidesWithAi(input: {
  title: string;
  prompt: string;
  brand?: BrandPaletteSettings;
  visualizations: PresentationVisualizationInput[];
}): Promise<PresentationSlide[]> {
  const structure = buildAgencyPresentationSlides(input);

  try {
    const raw = await openRouterChatJson({
      systemPrompt: SYSTEM_PROMPT,
      userMessage: buildUserMessage({ ...input, slides: structure }),
      model: process.env.OPENROUTER_MODEL_PRESENTATION?.trim() || "openai/o4-mini",
      maxTokens: 6000,
      temperature: 0.5,
    });

    const ai = parseAiCopy(raw, structure.length);
    const copyByIndex = Array.from({ length: structure.length }, () => ({})) as Array<{
      title?: string;
      subtitle?: string;
      body?: string;
      bullets?: string[];
      speakerNotes?: string;
      benefits?: PresentationBenefit[];
      footerLeft?: string;
      footerRight?: string;
    }>;

    for (const item of ai.slides) {
      if (item.slideIndex >= 0 && item.slideIndex < structure.length) {
        copyByIndex[item.slideIndex] = item;
      }
    }

    return mergeAgencyAiCopyIntoSlides(structure, copyByIndex);
  } catch {
    return structure;
  }
}

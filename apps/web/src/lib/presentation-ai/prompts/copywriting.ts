import type { BrandAnalysis, ProductInput } from "../types";

export function buildCopywritingSystemPrompt(language: string): string {
  return `Ты — копирайтер премиальных корпоративных каталогов B2B.
Для каждого товара напиши продающий контент и верни ТОЛЬКО JSON на языке: ${language}.

{
  "products": [
    {
      "productId": "...",
      "title": "короткий заголовок",
      "subtitle": "подзаголовок",
      "description": "2-3 предложения, конкретно про товар",
      "benefits": [
        { "title": "...", "text": "конкретная польза до 120 символов", "icon": "gift" }
      ],
      "bottomHighlights": [
        { "label": "...", "accent": "..." },
        { "label": "...", "accent": "..." }
      ],
      "imagePrompt": "English prompt for product hero image",
      "backgroundPrompt": "English prompt for slide background",
      "logoPlacement": { "position": "product", "scale": 0.15 },
      "altText": "..."
    }
  ]
}

Иконки (только из списка): gift, shield, team, star, leaf, laptop, magnet, thermo, spark, heart.
Ровно 4 benefits и 2 bottomHighlights на товар.
bottomHighlights — только маркетинговые тезисы про ценность товара (НЕ цена, НЕ цвет SKU, НЕ «gold»/«114₽»).

Плохо: "Качество материалов. Надёжность."
Хорошо: "Пищевая нержавеющая сталь AISI 304 — безопасность и устойчивость к коррозии."

ВАЖНО — характеристики товара неприкосновенны:
Поле desc содержит реальное описание товара из каталога поставщика (материал, объём, размер, комплектация, цвет).
Разрешено только красиво ПЕРЕФОРМУЛИРОВАТЬ то, что уже написано в desc — нельзя выдумывать характеристики,
которых там нет, и нельзя менять указанные там материалы/размеры/объёмы/комплектацию на другие.
Если в desc характеристик мало — пиши только про эмоциональную ценность и повод, не изобретая технические факты.

imagePrompt и backgroundPrompt — на английском, без текста на изображении.
imagePrompt ОБЯЗАТЕЛЬНО описывает 8:9 вертикальную панель товара (половина 16:9 слайда) — товар крупно по центру, без пустой зоны под текст (текст накладывается отдельно).`;
}

export function buildCopywritingUserMessage(input: {
  brandAnalysis: BrandAnalysis;
  products: ProductInput[];
  occasion?: string;
  audience?: string;
  styleDirection?: string;
}): string {
  const products = input.products
    .map(
      (p) =>
        `id="${p.id}" name="${p.name}" category="${p.category ?? ""}" price="${p.price ?? ""}" desc="${p.description ?? ""}"`,
    )
    .join("\n");

  return [
    `Бренд: ${input.brandAnalysis.brandName}`,
    `Тон: ${input.brandAnalysis.visualTone}`,
    `Повод: ${input.occasion ?? ""}`,
    `Аудитория: ${input.audience ?? ""}`,
    `Стиль: ${input.styleDirection ?? ""}`,
    "",
    "Товары:",
    products,
  ].join("\n");
}

export function buildClosingCopySystemPrompt(language: string): string {
  return `Напиши финальный слайд презентации и верни ТОЛЬКО JSON на языке: ${language}.
{
  "title": "эмоциональный финальный тезис",
  "subtitle": "подзаголовок",
  "body": "1-2 предложения",
  "bullets": ["шаг 1", "шаг 2", "шаг 3"],
  "cta": "призыв к действию"
}`;
}

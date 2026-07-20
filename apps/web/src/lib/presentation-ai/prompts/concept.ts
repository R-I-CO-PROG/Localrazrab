import type { BrandAnalysis, ProductInput } from "../types";

export function buildConceptSystemPrompt(language: string): string {
  return `Ты — креативный директор премиальных корпоративных презентаций уровня GTNT × Mercury.
Создай концепцию deck и верни ТОЛЬКО JSON на языке: ${language}.

{
  "presentationTitle": "...",
  "bigIdea": "короткий слоган",
  "narrative": "1-2 предложения о драматургии",
  "styleDirection": {
    "theme": "...",
    "background": "...",
    "composition": "50/50 split — product hero on one half, text on the other",
    "visualDensity": "premium editorial",
    "mood": "expensive, confident, technological"
  },
  "slides": [
    { "type": "cover", "title": "...", "subtitle": "...", "caption": "..." },
    { "type": "collection_overview", "title": "...", "subtitle": "..." },
    { "type": "product", "productId": "id", "title": "...", "subtitle": "..." },
    { "type": "thank_you", "title": "...", "subtitle": "..." }
  ]
}

Типы slides: cover, collection_overview, product, category, comparison, thank_you.
Для product указывай productId из входа.
Тон — премиальный корпоративный каталог, не канцелярит.`;
}

export function buildConceptUserMessage(input: {
  brandAnalysis: BrandAnalysis;
  products: ProductInput[];
  occasion?: string;
  audience?: string;
  slideCount?: number;
  quality: string;
}): string {
  const productList = input.products
    .map((p) => `- id="${p.id}" name="${p.name}" category="${p.category ?? ""}" desc="${p.description ?? ""}"`)
    .join("\n");

  return [
    `Бренд: ${input.brandAnalysis.brandName}`,
    `Личность: ${input.brandAnalysis.brandPersonality.join(", ")}`,
    `Визуальный тон: ${input.brandAnalysis.visualTone}`,
    `Ключевые слова: ${input.brandAnalysis.designKeywords.join(", ")}`,
    `Повод: ${input.occasion ?? "корпоративный подарок"}`,
    `Аудитория: ${input.audience ?? "клиенты и сотрудники"}`,
    `Целевое число слайдов: ${input.slideCount ?? "авто"}`,
    `Качество: ${input.quality}`,
    "",
    "Товары:",
    productList,
  ].join("\n");
}

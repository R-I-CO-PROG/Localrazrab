import type { BrandPaletteSettings } from "@/lib/brand-palette";
import type { PresentationVisualizationInput } from "@/lib/presentation/presentation-types";
import type { PresentationGenerationInput, ProductInput } from "../types";

function slugId(value: string, index: number): string {
  const base = value
    .toLowerCase()
    .replace(/[^\wа-яё\d]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base ? `${base}-${index}` : `product-${index}`;
}

function inferOccasion(prompt: string): string {
  const text = prompt.toLowerCase();
  if (/новый год|нг|праздник|ёлк|рождеств/i.test(text)) return "Новый год";
  if (/welcome|онбординг|welcome pack/i.test(text)) return "Welcome pack";
  if (/конференц|мероприят/i.test(text)) return "Конференция";
  if (/сотрудник|hr|мерч/i.test(text)) return "Мерч для сотрудников";
  if (/клиент|партнёр|партнер/i.test(text)) return "Клиентский подарок";
  return "Корпоративный подарок";
}

function inferAudience(prompt: string): string {
  const text = prompt.toLowerCase();
  if (/vip/i.test(text)) return "VIP";
  if (/сотрудник|команда|hr/i.test(text)) return "Сотрудники";
  if (/клиент/i.test(text)) return "Клиенты";
  if (/партнёр|партнер/i.test(text)) return "Партнёры";
  return "Смешанная аудитория";
}

function extractBrandName(title: string): string {
  const cleaned = title
    .replace(/презентация/gi, "")
    .replace(/mercai/gi, "")
    .trim();
  if (cleaned.length >= 2) return cleaned.slice(0, 48);
  return title.slice(0, 48) || "Бренд";
}

export function visualizationsToProducts(
  visualizations: PresentationVisualizationInput[],
): ProductInput[] {
  const products: ProductInput[] = [];
  const seenNames = new Set<string>();

  for (const viz of visualizations) {
    if (viz.items?.length) {
      for (const item of viz.items) {
        const key = item.name.trim().toLowerCase();
        if (!key || seenNames.has(key)) continue;
        seenNames.add(key);
        const images = item.imageUrl
          ? [item.imageUrl]
          : viz.imageUrl
            ? [viz.imageUrl]
            : [];
        products.push({
          id: item.id ?? slugId(item.name, products.length),
          name: item.name,
          description: item.description ?? viz.description,
          price: item.price,
          category: viz.conceptName,
          images,
          sourceVisualizationId: viz.id,
        });
      }
    } else {
      const key = viz.conceptName.trim().toLowerCase();
      if (!key || seenNames.has(key)) continue;
      seenNames.add(key);
      products.push({
        id: viz.id || slugId(viz.conceptName, products.length),
        name: viz.conceptName,
        description: viz.description,
        category: viz.isCatalog ? "Каталог" : "Концепция",
        images: viz.imageUrl ? [viz.imageUrl] : [],
        sourceVisualizationId: viz.id,
      });
    }
  }

  return products;
}

export function visualizationsToPresentationInput(input: {
  title: string;
  prompt: string;
  visualizations: PresentationVisualizationInput[];
  brand?: BrandPaletteSettings;
  logoDataUrl?: string;
}): PresentationGenerationInput {
  const products = visualizationsToProducts(input.visualizations);
  const slideCount = Math.min(24, Math.max(4, products.length + 3));
  const references = [
    ...new Set(products.flatMap((p) => p.images ?? []).filter(Boolean)),
  ] as string[];

  return {
    brand: {
      name: extractBrandName(input.title),
      description: input.prompt.trim(),
      colors: input.brand?.activeColors?.filter(Boolean).length
        ? input.brand.activeColors
        : undefined,
      logoUrl: input.logoDataUrl,
    },
    products,
    occasion: inferOccasion(input.prompt),
    audience: inferAudience(input.prompt),
    language: "ru",
    slideCount,
    stylePreset: "corporate_light",
    quality: "draft",
    outputFormats: ["pptx", "html", "pdf"],
    references,
    visualizationIds: input.visualizations.map((v) => v.id),
    visualizationImages: input.visualizations.map((v) => v.imageUrl).filter(Boolean) as string[],
    showPrices: true,
  };
}

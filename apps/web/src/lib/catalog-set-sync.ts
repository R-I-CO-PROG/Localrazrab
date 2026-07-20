import type { ConceptItem, GeneratedConcept } from "@/lib/types";
import { displayCatalogImageSrc } from "@/lib/product-image";

export function catalogSetTotalCost(items: ConceptItem[]): number {
  return items.reduce((sum, item) => sum + (item.price || 0), 0);
}

export function catalogSetProductIds(items: ConceptItem[]): string[] {
  return items.map((item) => item.id).filter(Boolean) as string[];
}

export function catalogSetPreviewImageUrls(items: ConceptItem[]): string[] {
  return items
    .map((item) => (item.imageUrl ? displayCatalogImageSrc(item.imageUrl) : ""))
    .filter(Boolean);
}

/** Фото для превью карточек — из актуального состава, не из устаревшего preview */
export function catalogProductPhotos(concept: GeneratedConcept): string[] {
  const fromItems = catalogSetPreviewImageUrls(concept.items);
  if (fromItems.length > 0) return fromItems;
  return concept.previewProductImageUrls ?? [];
}

function itemBlurb(desc?: string): string {
  const raw = (desc ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return "";
  const sentence = raw.split(/(?<=[.!?])\s+/)[0] ?? raw;
  const clean = sentence.replace(/^[-—•\s]+/, "").trim();
  if (clean.length < 8) return "";
  return clean.length > 140 ? `${clean.slice(0, 137).trim()}…` : clean;
}

/**
 * Пересобирает «Описание набора» из ТЕКУЩЕГО состава (с характеристиками из карточек),
 * чтобы после ручного добавления/удаления товара описание соответствовало набору.
 */
export function composeCatalogDescription(items: ConceptItem[]): string {
  if (!items.length) return "";
  const lines = items
    .map((it) => {
      const blurb = itemBlurb(it.description);
      const color = it.colors?.[0];
      const colorPart = color ? ` (${color})` : "";
      return blurb ? `• ${it.name}${colorPart} — ${blurb}` : `• ${it.name}${colorPart}`;
    })
    .join("\n");
  const lead =
    items.length === 1 ? "В набор вошёл товар:" : `Продуманный набор из ${items.length} позиций:`;
  return `${lead}\n${lines}`;
}

export function buildCatalogSetConceptPatch(
  items: ConceptItem[],
  options?: { markVisualizationOutdated?: boolean },
): Partial<GeneratedConcept> {
  return {
    items,
    totalCost: catalogSetTotalCost(items),
    catalogProductIds: catalogSetProductIds(items),
    previewProductImageUrls: catalogSetPreviewImageUrls(items),
    // Описание адаптируется под текущий состав при каждой правке.
    description: composeCatalogDescription(items),
    ...(options?.markVisualizationOutdated ? { visualizationOutdated: true } : {}),
  };
}

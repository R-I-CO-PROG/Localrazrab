import type { ConceptItem, GeneratedConcept } from "@/lib/types";

/** Подставляет фото каталога, если у item нет imageUrl (частая ситуация в localStorage). */
export function enrichConceptItemsWithCatalogImages(
  concept: GeneratedConcept | undefined,
  items: ConceptItem[],
): ConceptItem[] {
  if (!concept) return items;

  const previews = concept.previewProductImageUrls ?? [];
  const catalogIds = concept.catalogProductIds ?? [];

  return items.map((item, index) => {
    if (item.imageUrl) return item;

    let imageUrl: string | undefined;

    if (item.id && catalogIds.length) {
      const idx = catalogIds.indexOf(item.id);
      if (idx >= 0 && previews[idx]) imageUrl = previews[idx];
    }

    if (!imageUrl) {
      imageUrl = concept.items.find((ci) => ci.name === item.name)?.imageUrl;
    }

    if (!imageUrl && previews[index]) {
      imageUrl = previews[index];
    }

    return imageUrl ? { ...item, imageUrl } : item;
  });
}

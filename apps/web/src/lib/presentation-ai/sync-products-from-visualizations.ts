import { assetUrl } from "@/lib/asset-url";
import { filterBlacklistedProducts } from "@/lib/blacklist-client";
import type { BlacklistItem } from "@/lib/brand-palette";
import type { PresentationVisualizationInput } from "@/lib/presentation/presentation-types";
import { visualizationsToProducts } from "@/lib/presentation-ai/adapters/visualizations-adapter";
import { enrichConceptItemsWithCatalogImages } from "@/lib/presentation-ai/enrich-catalog-item-images";
import type { ProductInput } from "@/lib/presentation-ai/types";
import type { ConceptVisualization, GeneratedConcept } from "@/lib/types";

function resolveClientImageUrl(url?: string): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("blob:") || url.startsWith("data:") || url.startsWith("http")) {
    return url;
  }
  return assetUrl(url);
}

export function productsFromSelectedVisualizations(input: {
  selectedVisualizationIds: string[];
  visualizations: ConceptVisualization[];
  concepts: GeneratedConcept[];
  blacklistItems?: BlacklistItem[];
}): ProductInput[] {
  const selected = input.visualizations.filter((v) =>
    input.selectedVisualizationIds.includes(v.id),
  );

  if (selected.length === 0) return [];

  const payload: PresentationVisualizationInput[] = selected.map((viz) => {
    const concept = input.concepts.find((c) => c.id === viz.conceptId);
    const rawItems = filterBlacklistedProducts(concept?.items ?? [], input.blacklistItems ?? []);
    const enrichedItems = enrichConceptItemsWithCatalogImages(concept, rawItems);
    const items = enrichedItems.map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      price: item.price,
      imageUrl: resolveClientImageUrl(item.imageUrl),
    }));

    return {
      id: viz.id,
      conceptName: viz.conceptName,
      imageUrl: resolveClientImageUrl(viz.imageUrl) ?? viz.imageUrl,
      description: concept?.description,
      isCatalog: (concept?.catalogProductIds?.length ?? items.length) > 0,
      items,
    };
  });

  return visualizationsToProducts(payload);
}

export function visualizationImagesFromSelection(
  selectedVisualizationIds: string[],
  visualizations: ConceptVisualization[],
): string[] {
  return selectedVisualizationIds
    .map((id) => visualizations.find((v) => v.id === id)?.imageUrl)
    .filter(Boolean)
    .map((url) => resolveClientImageUrl(url!) ?? url!) as string[];
}

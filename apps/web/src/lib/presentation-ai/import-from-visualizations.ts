import type { BrandPaletteSettings, BlacklistItem } from "@/lib/brand-palette";
import type { PresentationVisualizationInput } from "@/lib/presentation/presentation-types";
import { resolveImageUrlForServer } from "@/lib/presentation/resolve-image-url";
import { visualizationsToPresentationInput } from "@/lib/presentation-ai/adapters/visualizations-adapter";
import type { PresentationGenerationInput } from "@/lib/presentation-ai/types";
import type { ConceptVisualization, GeneratedConcept } from "@/lib/types";
import { filterBlacklistedProducts } from "@/lib/blacklist-client";
import { enrichConceptItemsWithCatalogImages } from "@/lib/presentation-ai/enrich-catalog-item-images";

export async function buildPresentationInputFromVisualizations(input: {
  title: string;
  prompt: string;
  selectedVisualizationIds: string[];
  visualizations: ConceptVisualization[];
  concepts: GeneratedConcept[];
  brandPalette: BrandPaletteSettings;
  logoUrl?: string;
  logoMimeType?: string;
  blacklistItems?: BlacklistItem[];
}): Promise<PresentationGenerationInput> {
  const selected = input.visualizations.filter((v) =>
    input.selectedVisualizationIds.includes(v.id),
  );

  const payloadVisualizations: PresentationVisualizationInput[] = await Promise.all(
    selected.map(async (viz) => {
      const concept = input.concepts.find((c) => c.id === viz.conceptId);
      const rawItems = filterBlacklistedProducts(concept?.items ?? [], input.blacklistItems ?? []);
      const enrichedItems = enrichConceptItemsWithCatalogImages(concept, rawItems);
      const items = enrichedItems.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        price: item.price,
        imageUrl: item.imageUrl,
      }));
      const itemsWithImages = await Promise.all(
        items.map(async (item) => ({
          ...item,
          imageUrl: item.imageUrl ? await resolveImageUrlForServer(item.imageUrl) : undefined,
        })),
      );
      return {
        id: viz.id,
        conceptName: viz.conceptName,
        imageUrl: await resolveImageUrlForServer(viz.imageUrl),
        description: concept?.description,
        isCatalog: (concept?.catalogProductIds?.length ?? items.length) > 0,
        items: itemsWithImages,
      };
    }),
  );

  let logoDataUrl: string | undefined;
  if (input.logoUrl && input.logoMimeType?.startsWith("image/")) {
    try {
      logoDataUrl = await resolveImageUrlForServer(input.logoUrl);
    } catch {
      // optional logo
    }
  }

  return visualizationsToPresentationInput({
    title: input.title,
    prompt: input.prompt,
    visualizations: payloadVisualizations,
    brand: input.brandPalette,
    logoDataUrl,
  });
}

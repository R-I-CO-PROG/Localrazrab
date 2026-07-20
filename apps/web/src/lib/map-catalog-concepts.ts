import type { AgentConcept } from "@/lib/agent-types";
import type { GeneratedConcept, ConceptRenderSession } from "@/lib/types";
import { assetUrl } from "@/lib/asset-url";
import { displayCatalogImageSrc } from "@/lib/product-image";
import { pickTargetColorForBrand } from "@/lib/brand-target-color";

export type CatalogConceptFromAgent = AgentConcept & {
  catalogProducts?: Array<{
    id: string;
    name: string;
    category: string;
    price?: number | null;
    stockAvailable?: number;
    colors?: string[];
    targetColor?: string;
    catalogImageUrl?: string;
    imageUrl?: string | null;
    sourceUrl?: string | null;
  }>;
  productIds?: string[];
  previewProductImageUrls?: string[];
  composition?: string;
  style?: string;
};

export function mapCatalogConceptsToGenerated(
  concepts: CatalogConceptFromAgent[],
  requestId: string,
): { concepts: GeneratedConcept[]; sessions: Record<string, ConceptRenderSession> } {
  const ts = Date.now();
  const sessions: Record<string, ConceptRenderSession> = {};

  const generated = concepts.map((c, i) => {
    const id = `concept-${ts}-${i}`;
    sessions[id] = {
      requestId,
      projectId: requestId,
      chosenIdeaTitle: c.title,
    };

    const catalogProducts = c.catalogProducts ?? [];
    const items = catalogProducts.map((p) => ({
      id: p.id,
      name: p.name,
      description: [p.category, p.colors?.join(", ")].filter(Boolean).join(" · "),
      price: p.price != null && p.price > 0 ? Math.round(p.price) : 0,
      stockAvailable: p.stockAvailable,
      colors: p.colors,
      targetColor:
        p.targetColor ??
        pickTargetColorForBrand(
          p.colors ?? [],
          c.colorPalette ?? [],
          p.name,
        ),
      imageUrl: p.catalogImageUrl ? displayCatalogImageSrc(p.catalogImageUrl) : p.imageUrl ? displayCatalogImageSrc(p.imageUrl) : undefined,
      sourceUrl: p.sourceUrl ?? null,
    }));

    const totalCost = items.reduce((s, it) => s + it.price, 0);

    return {
      id,
      name: c.title,
      description: c.narrative || c.description,
      items,
      totalCost,
      tags: c.styleTags?.length ? c.styleTags : ["Каталог"],
      previewImageUrl: c.previewImageUrl,
      previewProductImageUrls: (c.previewProductImageUrls ?? [])
        .map((url) => displayCatalogImageSrc(url))
        .filter(Boolean),
      catalogProductIds: c.productIds ?? catalogProducts.map((p) => p.id),
      budgetPerSet: c.budgetPerSet ?? null,
    } satisfies GeneratedConcept;
  });

  return { concepts: generated, sessions };
}

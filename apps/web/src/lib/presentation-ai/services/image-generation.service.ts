import type {
  AssetRef,
  BrandAnalysis,
  ConceptSlideOutline,
  GeneratedSlide,
  PresentationConcept,
  PresentationGenerationInput,
  ProductStory,
  SlideLayout,
} from "../types";
import type { PresentationTheme } from "../types";
import {
  collectAllCatalogImageUrls,
  findProductForSlide,
  resolveManyReferenceUrls,
  resolvePresentationInputImages,
} from "./resolve-reference-images";

const SPLIT_LAYOUT: SlideLayout = "product_left_image_right_text";

function assetFromUrl(id: string, url: string): AssetRef {
  return { id, url };
}

function pickByIndex(urls: string[], index: number): string | undefined {
  if (!urls.length) return undefined;
  return urls[index % urls.length];
}

export function buildSlidesFromConcept(input: {
  concept: PresentationConcept;
  slideOutlines: ConceptSlideOutline[];
  productStories: ProductStory[];
  products: PresentationGenerationInput["products"];
  closingCopy: { title: string; subtitle: string; body: string; bullets: string[]; cta: string };
  showPrices: boolean;
}): GeneratedSlide[] {
  const storyById = new Map(input.productStories.map((s) => [s.productId, s]));

  return input.slideOutlines.map((outline, index) => {
    const base: GeneratedSlide = {
      id: `slide-${index}`,
      type: outline.type,
      title: outline.title,
      subtitle: outline.subtitle,
      caption: outline.caption,
      productId: outline.productId,
      layout: SPLIT_LAYOUT,
    };

    if (outline.type === "product" && outline.productId) {
      const story = storyById.get(outline.productId);
      const product = input.products.find((p) => p.id === outline.productId);
      if (story) {
        return {
          ...base,
          title: story.title,
          subtitle: story.subtitle,
          description: story.description,
          benefits: story.benefits,
          bottomHighlights: story.bottomHighlights,
          price: product?.price,
          showPrice: input.showPrices && product?.price != null,
          logoPlacement: story.logoPlacement,
        };
      }
    }

    if (outline.type === "collection_overview") {
      const groupIds = new Set(outline.groupProductIds ?? []);
      const groupProducts = groupIds.size
        ? input.products.filter((p) => groupIds.has(p.id))
        : input.products;
      return {
        ...base,
        groupProductIds: outline.groupProductIds,
        sourceVisualizationId: outline.sourceVisualizationId,
        description: input.concept.narrative,
        overviewItems: groupProducts.map((p) => ({
          name: p.name,
          icon: "gift" as const,
        })),
        bottomHighlights: [
          {
            label: `Коллекция поддерживает единый фирменный стиль`,
            accent: input.concept.bigIdea,
          },
          {
            label: "Идеально для подарков сотрудникам, клиентам и партнёрам",
            accent: input.concept.styleDirection.mood,
          },
        ],
      };
    }

    if (outline.type === "thank_you") {
      return {
        ...base,
        title: input.closingCopy.title,
        subtitle: input.closingCopy.subtitle,
        description: input.closingCopy.body,
        bullets: input.closingCopy.bullets,
        caption: input.closingCopy.cta,
      };
    }

    if (outline.type === "cover") {
      return {
        ...base,
        caption: outline.caption ?? input.concept.bigIdea,
        subtitle: outline.subtitle ?? input.concept.presentationTitle,
      };
    }

    return base;
  });
}

export async function generateSlideImages(input: {
  presentationId: string;
  slides: GeneratedSlide[];
  brand: PresentationGenerationInput["brand"];
  brandAnalysis: BrandAnalysis;
  concept: PresentationConcept;
  products: PresentationGenerationInput["products"];
  productStories: ProductStory[];
  theme: PresentationTheme;
  references?: string[];
  visualizationIds?: string[];
  visualizationImages?: string[];
  /** Unique suffix so regenerated images get their own file (carousel versions). */
  imageAssetSuffix?: string;
}): Promise<{ slides: GeneratedSlide[]; assets: AssetRef[] }> {
  const resolved = await resolvePresentationInputImages({
    brand: input.brand,
    products: input.products,
    references: input.references,
  });

  const products = resolved.products;
  const assets: AssetRef[] = [];
  const catalogImages = collectAllCatalogImageUrls(products);
  // Resolved to data: URLs — raw /uploads/... paths only resolve in-browser (same-origin),
  // never inside the headless-Chrome PDF renderer or PPTX embedding, which have no page origin.
  const visualizationImages = await resolveManyReferenceUrls(input.visualizationImages ?? []);
  const visualizationIds = input.visualizationIds ?? [];
  let generalSlideIndex = 0;

  const assetIdFor = (slideId: string, kind: string) =>
    input.imageAssetSuffix ? `${slideId}-${kind}-${input.imageAssetSuffix}` : `${slideId}-${kind}`;

  const enriched: GeneratedSlide[] = [];

  for (const slide of input.slides) {
    const next: GeneratedSlide = {
      ...slide,
      layout: SPLIT_LAYOUT,
      backgroundImage: undefined,
    };

    if (slide.type === "product") {
      const product = findProductForSlide(products, slide);
      // Only ever use THIS product own photo — falling back to an unrelated catalog image by
      // position previously showed a random, wrong product photo whenever this one failed to resolve.
      const url = product?.images?.[0];
      if (url) {
        const asset = assetFromUrl(assetIdFor(slide.id, "catalog"), url);
        next.heroImage = asset;
        assets.push(asset);
      }
    } else if (slide.type === "cover" || slide.type === "thank_you") {
      // Обложка и финальный слайд = ЛОГОТИП клиента, НЕ визуализация набора (иначе презентация
      // начиналась и заканчивалась случайными визуализациями).
      const url = resolved.brand.logoUrl;
      if (url) {
        const asset = assetFromUrl(assetIdFor(slide.id, "logo"), url);
        next.heroImage = asset;
        assets.push(asset);
      }
    } else {
      const matchedIndex = slide.sourceVisualizationId
        ? visualizationIds.indexOf(slide.sourceVisualizationId)
        : -1;
      const url =
        (matchedIndex >= 0 ? visualizationImages[matchedIndex] : undefined) ??
        pickByIndex(visualizationImages, generalSlideIndex) ??
        pickByIndex(catalogImages, generalSlideIndex) ??
        resolved.brand.logoUrl;
      generalSlideIndex += 1;
      if (url) {
        const asset = assetFromUrl(assetIdFor(slide.id, "viz"), url);
        next.heroImage = asset;
        assets.push(asset);
      }
    }

    enriched.push(next);
  }

  return { slides: enriched, assets };
}

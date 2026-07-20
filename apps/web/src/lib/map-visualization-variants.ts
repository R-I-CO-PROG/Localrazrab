import { assetUrl } from "@/lib/asset-url";
import type { ConceptVisualizationVariant } from "@/lib/types";
import type { VisualizationVariant } from "@/lib/suvenir-types";
import type { ConceptGenerationResult } from "@/lib/resolve-concept-generation";

export function mapApiVariantsToConcept(
  variants: VisualizationVariant[] | undefined,
  fallbackUrl?: string | null,
  cacheKey?: string | number,
): ConceptVisualizationVariant[] {
  if (variants?.length) {
    return variants.map((v) => ({
      id: v.id,
      imageUrl: assetUrl(v.imageUrl, cacheKey ?? v.createdAt),
      pathUrl: v.imageUrl,
      refinementBrief: v.refinementBrief,
      createdAt: v.createdAt,
    }));
  }
  if (fallbackUrl) {
    const createdAt = new Date().toISOString();
    return [
      {
        id: "initial",
        imageUrl: assetUrl(fallbackUrl, cacheKey ?? createdAt),
        pathUrl: fallbackUrl,
        createdAt,
      },
    ];
  }
  return [];
}

/** Все версии фото одной концепции — для карусели */
export function mapConceptResultVariants(
  result: ConceptGenerationResult,
): ConceptVisualizationVariant[] {
  const list = result.variants?.length
    ? result.variants
    : [
        {
          id: `v-r${result.revision}`,
          imageUrl: result.resultImageUrl,
          revision: result.revision,
          finishedAt: result.finishedAt,
        },
      ];
  return list.map((v) => ({
    id: v.id,
    imageUrl: assetUrl(v.imageUrl, v.revision || v.finishedAt || result.revision),
    pathUrl: v.imageUrl,
    refinementBrief: v.refinementBrief,
    createdAt: v.finishedAt || new Date().toISOString(),
  }));
}

/** Одна картинка (legacy) */
export function mapConceptResultImage(
  resultImageUrl: string,
  cacheKey?: string | number,
): ConceptVisualizationVariant[] {
  return mapApiVariantsToConcept(undefined, resultImageUrl, cacheKey);
}

/** @deprecated use mapConceptResultVariants */
export const mapCatalogConceptImage = mapConceptResultImage;

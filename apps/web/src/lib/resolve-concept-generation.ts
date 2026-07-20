import { productIdsKey, visualizationMatchesProducts } from "@/lib/concept-product-ids";
import type { Generation } from "@/lib/suvenir-types";
import {
  mapApiVariantsToConcept,
  mapConceptResultVariants,
} from "@/lib/map-visualization-variants";
import type { ConceptVisualizationVariant } from "@/lib/types";

export type ConceptResultVariant = {
  id: string;
  imageUrl: string;
  revision: number;
  finishedAt: string;
  refinementBrief?: string | null;
};

export type ConceptGenerationResult = {
  chosenIdeaTitle: string;
  resultImageUrl: string;
  productIds: string[];
  revision: number;
  finishedAt: string;
  variants: ConceptResultVariant[];
};

export type ConceptResultsMap = Record<string, ConceptGenerationResult>;

function parseConceptResults(raw: unknown): ConceptResultsMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as ConceptResultsMap;
}

function normalizeVariants(entry: ConceptGenerationResult): ConceptResultVariant[] {
  if (entry.variants?.length) return entry.variants;
  if (!entry.resultImageUrl) return [];
  return [
    {
      id: `v-r${entry.revision}`,
      imageUrl: entry.resultImageUrl,
      revision: entry.revision,
      finishedAt: entry.finishedAt || "",
    },
  ];
}

/** Фото концепции из conceptResults на сервере (отдельно для каждой из 5 идей) */
export function getConceptResultFromGeneration(
  generation: Generation | null | undefined,
  chosenIdeaTitle: string | undefined,
): ConceptGenerationResult | null {
  const title = chosenIdeaTitle?.trim();
  if (!generation || !title) return null;

  const map = parseConceptResults(generation.conceptResults);
  for (const entry of Object.values(map)) {
    if (entry?.chosenIdeaTitle?.trim() === title && entry.resultImageUrl) {
      return { ...entry, variants: normalizeVariants(entry) };
    }
  }

  return null;
}

export function conceptResultMatchesProducts(
  result: ConceptGenerationResult | null | undefined,
  currentProductIds: (string | undefined)[],
): boolean {
  if (!result) return false;
  if (!result.productIds?.length) return true;
  return visualizationMatchesProducts(result.productIds, currentProductIds);
}

export function conceptResultIdentity(result: ConceptGenerationResult | null | undefined): string {
  if (!result) return "";
  const last = result.variants[result.variants.length - 1];
  return `${result.chosenIdeaTitle}|${last?.imageUrl ?? result.resultImageUrl}|r${result.revision}|${productIdsKey(result.productIds)}|n${result.variants.length}`;
}

/** Данные для UI после poll — conceptResults или fallback на generation.variants */
export function resolveVisualizationFromGeneration(
  generation: Generation | null | undefined,
  chosenIdeaTitle: string | undefined,
  cacheKey?: string | number,
): { conceptResult: ConceptGenerationResult | null; mapped: ConceptVisualizationVariant[] } {
  const conceptResult = getConceptResultFromGeneration(generation, chosenIdeaTitle);
  if (conceptResult) {
    return { conceptResult, mapped: mapConceptResultVariants(conceptResult) };
  }

  const url = generation?.resultImageUrl;
  if (!url) return { conceptResult: null, mapped: [] };

  const mapped = mapApiVariantsToConcept(generation?.variants, url, cacheKey);
  const title = chosenIdeaTitle?.trim() || "";
  return {
    conceptResult: {
      chosenIdeaTitle: title,
      resultImageUrl: url,
      productIds: [],
      revision: cacheKey ? Number(cacheKey) || 1 : 1,
      finishedAt: new Date().toISOString(),
      variants: mapped.map((v, i) => ({
        id: v.id,
        imageUrl: v.pathUrl ?? url,
        revision: i + 1,
        finishedAt: v.createdAt,
        refinementBrief: v.refinementBrief,
      })),
    },
    mapped,
  };
}

export function generationPollComplete(
  req: { status?: string; generation?: Generation | null; generationCount?: number },
  chosenIdeaTitle: string | undefined,
  baseline: {
    resultImageUrl?: string | null;
    variantCount?: number;
    identity?: string;
  },
): boolean {
  const gen = req.generation;
  if (!gen) return false;

  const url = gen.resultImageUrl;
  if (url && baseline.resultImageUrl && url !== baseline.resultImageUrl) return true;

  const { conceptResult } = resolveVisualizationFromGeneration(
    gen,
    chosenIdeaTitle,
    req.generationCount,
  );
  const variantCount = conceptResult?.variants.length ?? gen.variants?.length ?? 0;
  if (variantCount > (baseline.variantCount ?? 0)) return true;

  if (baseline.identity && conceptResult) {
    return conceptResultIdentity(conceptResult) !== baseline.identity;
  }

  return false;
}

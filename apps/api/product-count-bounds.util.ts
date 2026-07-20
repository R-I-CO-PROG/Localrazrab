import { defaultItemCount, parseItemCountBounds } from './parse-desired-count';

export interface ProductCountBounds {
  min: number;
  max: number;
  useLimit: boolean;
}

export function resolveProductCountBounds(request: {
  userPrompt: string;
  setItemCount?: number | null;
  useProductCountLimit?: boolean | null;
  minProductsPerSet?: number | null;
  maxProductsPerSet?: number | null;
}): ProductCountBounds {
  const useLimit = request.useProductCountLimit !== false;

  if (!useLimit) {
    const n = defaultItemCount(request.userPrompt);
    return { min: n, max: n, useLimit: false };
  }

  const boundsFromBrief = parseItemCountBounds(request.userPrompt);
  const fallback = Math.max(
    1,
    Math.min(10, request.setItemCount ?? defaultItemCount(request.userPrompt)),
  );

  if (boundsFromBrief) {
    const min = Math.max(1, Math.min(10, request.minProductsPerSet ?? boundsFromBrief.min));
    const max = Math.max(min, Math.min(10, request.maxProductsPerSet ?? boundsFromBrief.max));
    return { min, max, useLimit: true };
  }

  const min = Math.max(1, Math.min(10, request.minProductsPerSet ?? fallback));
  const max = Math.max(min, Math.min(10, request.maxProductsPerSet ?? fallback));
  return { min, max, useLimit: true };
}

export function pickConceptItemCount(bounds: ProductCountBounds, conceptIndex: number): number {
  if (bounds.min === bounds.max) return bounds.min;
  const span = bounds.max - bounds.min + 1;
  return bounds.min + (conceptIndex % span);
}

export function averageItemCount(bounds: ProductCountBounds): number {
  return Math.round((bounds.min + bounds.max) / 2);
}

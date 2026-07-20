import type { CatalogProduct } from './catalog.util';
import {
  inferProductRgb,
  scoreBrandColorMatch,
  scoreBriefPaletteMatch,
} from './catalog-color-match.util';
import { productVariantKey, crossConceptLineKeys } from './catalog-variant.util';
import { detectConceptProductType, typeConflictsInSet } from './concept-diversity.util';
import { scoreBriefRelevance, parseBriefForbiddenColors } from './catalog-brief-relevance.util';
import { isCorporateSetFiller } from '../../concept/product-role.util';

function rgbDistance(
  a: [number, number, number],
  b: [number, number, number],
): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11);
}

export interface SetCohesionOptions {
  brief?: string;
  brandColors?: string[];
}

/**
 * Оценка визуальной, тематической и ценовой согласованности набора (0–100).
 */
export function scoreSetCohesion(
  products: CatalogProduct[],
  options: SetCohesionOptions = {},
): {
  score: number;
  outlierIndex: number | null;
  reason: string | null;
} {
  if (products.length <= 1) {
    return { score: 100, outlierIndex: null, reason: null };
  }

  const brief = options.brief ?? '';
  const brandColors = options.brandColors ?? [];
  const forbiddenHints = parseBriefForbiddenColors(brief);

  let score = 80;
  let outlierIndex: number | null = null;
  let reason: string | null = null;

  if (brief) {
    const relevanceScores = products.map((p) => scoreBriefRelevance(p, brief, brandColors));
    const avgRel = relevanceScores.reduce((a, b) => a + b, 0) / relevanceScores.length;
    if (avgRel < 0) score -= 25;
    else if (avgRel > 30) score += 10;

    const worstRelIdx = relevanceScores.indexOf(Math.min(...relevanceScores));
    if (relevanceScores[worstRelIdx] < -50) {
      score -= 15;
      if (outlierIndex === null) {
        outlierIndex = worstRelIdx;
        reason = 'theme_outlier';
      }
    }
  }

  if (brandColors.length || forbiddenHints.length) {
    const paletteScores = products.map((p) =>
      scoreBriefPaletteMatch(p, brandColors, forbiddenHints),
    );
    const avgPalette = paletteScores.reduce((a, b) => a + b, 0) / paletteScores.length;
    if (avgPalette < -20) score -= 20;
    else if (avgPalette > 25) score += 8;
  }

  const prices = products.map((p) => p.price ?? 0).filter((p) => p > 0);
  if (prices.length >= 2) {
    const sorted = [...prices].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const maxRatio = sorted[sorted.length - 1] / Math.max(sorted[0], 0.01);
    if (maxRatio > 5) {
      score -= 20;
      const worstIdx = products.findIndex(
        (p) => (p.price ?? 0) > 0 && ((p.price ?? 0) > median * 3 || (p.price ?? 0) < median / 3),
      );
      if (worstIdx >= 0 && outlierIndex === null) {
        outlierIndex = worstIdx;
        reason = 'price_outlier';
      }
    } else if (maxRatio > 3) {
      score -= 8;
    }
  }

  const rgbs: Array<{ rgb: [number, number, number]; idx: number }> = [];
  for (let i = 0; i < products.length; i++) {
    const rgb = inferProductRgb(products[i]);
    if (rgb) rgbs.push({ rgb, idx: i });
  }

  if (rgbs.length >= 3) {
    const avgR = rgbs.reduce((s, c) => s + c.rgb[0], 0) / rgbs.length;
    const avgG = rgbs.reduce((s, c) => s + c.rgb[1], 0) / rgbs.length;
    const avgB = rgbs.reduce((s, c) => s + c.rgb[2], 0) / rgbs.length;
    const center: [number, number, number] = [avgR, avgG, avgB];

    const distances = rgbs.map((c) => ({
      dist: rgbDistance(c.rgb, center),
      idx: c.idx,
    }));
    distances.sort((a, b) => b.dist - a.dist);

    const worst = distances[0];
    const secondWorst = distances[1];
    if (worst && secondWorst && worst.dist > 90 && worst.dist > secondWorst.dist * 1.8) {
      score -= 18;
      if (outlierIndex === null) {
        outlierIndex = worst.idx;
        reason = 'color_outlier';
      }
    } else if (worst && worst.dist > 120) {
      score -= 10;
    }
  }

  return { score: Math.max(0, Math.min(100, score)), outlierIndex, reason };
}

/**
 * Попытаться заменить выбивающийся товар на лучший доступный вариант.
 */
export function tryFixSetOutlier(
  products: CatalogProduct[],
  outlierIndex: number,
  catalog: CatalogProduct[],
  blockedIds: Set<string>,
  blockedVariants: Set<string>,
  brandColors: string[],
  brief = '',
): CatalogProduct[] | null {
  const outlier = products[outlierIndex];
  if (!outlier) return null;

  const outlierType = detectConceptProductType(outlier);
  const otherTypes = new Set(
    products.filter((_, i) => i !== outlierIndex).map((p) => detectConceptProductType(p)),
  );
  const usedIds = new Set([...blockedIds, ...products.map((p) => p.id)]);
  const usedVariants = new Set([
    ...blockedVariants,
    ...products.flatMap((p) => [productVariantKey(p), ...crossConceptLineKeys(p)]),
  ]);
  usedIds.delete(outlier.id);
  for (const lk of crossConceptLineKeys(outlier)) usedVariants.delete(lk);
  usedVariants.delete(productVariantKey(outlier));

  const forbiddenHints = parseBriefForbiddenColors(brief);
  const techBrief = /it[\s-]|tech|конференц|разработчик|хакатон|hackathon|кодер|программист|мерч/i.test(brief);

  const candidates = catalog
    .filter((p) => {
      if (usedIds.has(p.id)) return false;
      if (usedVariants.has(productVariantKey(p))) return false;
      if (crossConceptLineKeys(p).some((lk) => usedVariants.has(lk))) return false;
      if (isCorporateSetFiller(p, brief)) return false;
      if (techBrief && scoreBriefRelevance(p, brief) < 15) return false;
      const type = detectConceptProductType(p);
      if (type !== outlierType) return false;
      if (typeConflictsInSet(otherTypes, type)) return false;
      return true;
    })
    .sort(
      (a, b) =>
        scoreBriefPaletteMatch(b, brandColors, forbiddenHints) +
        scoreBriefRelevance(b, brief, brandColors) -
        (scoreBriefPaletteMatch(a, brandColors, forbiddenHints) +
          scoreBriefRelevance(a, brief, brandColors)),
    );

  if (!candidates.length) return null;
  const replacement = candidates[0];

  const newProducts = [...products];
  newProducts[outlierIndex] = replacement;

  const oldScore = scoreSetCohesion(products, { brief, brandColors }).score;
  const newScore = scoreSetCohesion(newProducts, { brief, brandColors }).score;

  return newScore > oldScore ? newProducts : null;
}

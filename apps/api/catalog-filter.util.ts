import type { CatalogProduct } from './catalog.util';
import { filterCatalogByBlacklist } from './catalog.util';
import { filterCatalogByBriefBuckets } from '../../catalog/brief-category-buckets.util';
import { reconcileBriefConstraints } from '../../requests/brief-constraints.util';
import { resolveBudgetPerSet, maxUnitPriceForSet } from './set-budget.util';
import {
  detectConceptProductType,
  detectMandatoryConceptTypesFromBrief,
} from './concept-diversity.util';
import { scoreBrandColorMatch } from './catalog-color-match.util';
import {
  filterCatalogByNameConstraints,
  ensureMandatoryBriefProducts,
} from './catalog-name-match.util';
import { scoreBriefRelevance } from './catalog-brief-relevance.util';
import {
  extractProjectBriefProfile,
  scoreAllowedItemSoftMatch,
  scoreProjectCategorySoftMatch,
} from './project-brief-profile.util';
import {
  averageItemCount,
  resolveProductCountBounds,
} from './product-count-bounds.util';
import { normalizeCatalogProduct } from './product-normalization.util';
import { yieldEventLoop } from '../../common/yield-event-loop';
import { hasValidProductImage } from '../../concept/selection-constraints';

export function resolveTargetItemCount(input: CatalogFilterInput): number {
  return averageItemCount(
    resolveProductCountBounds({
      userPrompt: input.userPrompt,
      setItemCount: input.setItemCount,
      useProductCountLimit: input.useProductCountLimit,
      minProductsPerSet: input.minProductsPerSet,
      maxProductsPerSet: input.maxProductsPerSet,
    }),
  );
}

export interface CatalogFilterInput {
  userPrompt: string;
  projectCategory?: string | null;
  quantity?: number | null;
  budgetMin?: number | null;
  budgetMax?: number | null;
  /** Лимит стоимости одного набора, ₽ */
  budgetPerSet?: number | null;
  setItemCount?: number | null;
  useProductCountLimit?: boolean;
  minProductsPerSet?: number | null;
  maxProductsPerSet?: number | null;
  colors: string[];
  allowedItems: string[];
  forbiddenItems: string[];
  blacklistedProductIds?: string[];
  blacklistedSupplierIds?: string[];
}

const BRIEF_KEYWORDS = [
  'кружк',
  'чаш',
  'стакан',
  'ручк',
  'блокнот',
  'ежедневник',
  'термос',
  'бутыл',
  'сумк',
  'рюкзак',
  'шоппер',
  'футболк',
  'худи',
  'кепк',
  'очк',
  'панам',
  'powerbank',
  'заряд',
  'флеш',
  'usb',
  'welcome',
  'it',
  'tech',
  'эко',
  'eco',
  'премиум',
  'vip',
  'event',
  'конферен',
  'офис',
  'спорт',
  'зонт',
  'часы',
  'набор',
  'подар',
];

function normalizeText(text: unknown): string {
  return String(text ?? '').toLowerCase().replace(/ё/g, 'е');
}

function keywordScore(product: CatalogProduct, userPrompt: string): number {
  const name = normalizeText(product.name);
  const description = normalizeText(product.description ?? '');
  let score = 0;
  for (const kw of BRIEF_KEYWORDS) {
    if (normalizeText(userPrompt).includes(kw) && (name.includes(kw) || description.includes(kw))) {
      score += 5;
    }
  }
  const tokens = normalizeText(userPrompt)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 4);
  for (const token of tokens) {
    if (name.includes(token)) score += 6;
    if (description.includes(token)) score += 1;
  }
  return score;
}

export function scoreProductForBrief(product: CatalogProduct, input: CatalogFilterInput): number {
  let score = keywordScore(product, input.userPrompt);

  const profile = extractProjectBriefProfile({
    userPrompt: input.userPrompt,
    projectCategory: input.projectCategory,
    colors: input.colors,
    allowedItems: input.allowedItems,
    forbiddenItems: input.forbiddenItems,
  });

  const productType = detectConceptProductType(product);
  const mandatoryTypes = detectMandatoryConceptTypesFromBrief(input.userPrompt);
  if (mandatoryTypes.includes(productType)) score += 28;

  score += scoreBriefRelevance(product, input.userPrompt, input.colors);
  const colorBoost = input.colors?.length ? 4.5 : 1;
  score += scoreBrandColorMatch(product, input.colors) * colorBoost;
  score += scoreAllowedItemSoftMatch(
    product.name,
    product.description ?? '',
    profile.preferredCategories,
  );
  score += scoreProjectCategorySoftMatch(productType, input.projectCategory);

  const meta = normalizeCatalogProduct(product);
  if (profile.positioning === 'premium' && meta.priceTier === 'premium') score += 10;
  if (profile.positioning === 'premium' && meta.priceTier === 'budget') score -= 12;
  if (profile.seasonality === 'summer' && meta.isOutdoor) score += 8;
  if (profile.seasonality === 'winter' && meta.seasonality.includes('winter')) score += 8;

  const budgetPerSet =
    input.budgetPerSet ?? resolveBudgetPerSet(input.budgetMin, input.budgetMax);
  const itemCount = resolveTargetItemCount(input);

  if (budgetPerSet != null && budgetPerSet > 0) {
    if (product.price != null && product.price > 0) {
      if (product.price <= budgetPerSet) score += 5;
      else score -= 25;
      const avgSlot = Math.floor(budgetPerSet / itemCount);
      if (product.price <= avgSlot) score += 4;
      else if (product.price > avgSlot * 1.5) score -= 8;
    }
  } else {
    const maxPrice = input.budgetMax ?? input.budgetMin;
    if (maxPrice != null && product.price != null && product.price > 0) {
      if (product.price <= maxPrice) score += 5;
      else score -= 20;
    }
  }

  if (input.quantity != null && input.quantity > 0 && (product.stockAvailable ?? 0) > 0) {
    if ((product.stockAvailable ?? 0) >= input.quantity) score += 8;
    else score -= 15;
  }

  if ((product.stockAvailable ?? 0) > 500) score += 2;

  return score;
}

/** Жёсткие фильтры: категории, бюджет на позицию, остатки под тираж */
export function filterCatalogForRequest(
  catalog: CatalogProduct[],
  input: CatalogFilterInput,
): CatalogProduct[] {
  catalog = catalog.filter((p) => {
    const price = p.price ?? 0;
    if (price > 0 && price < 50) return false;
    return true;
  });

  const { allowedItems, forbiddenItems } = reconcileBriefConstraints(
    input.userPrompt,
    input.allowedItems,
    input.forbiddenItems,
  );

  const junkFiltered = catalog.filter((p) => {
    if ((p.price ?? 0) > 0 && (p.price ?? 0) < 20) return false;
    if ((p.name?.trim().length ?? 0) < 5) return false;
    return true;
  });
  const baseCatalog = junkFiltered.length > 0 ? junkFiltered : catalog;

  let filtered = filterCatalogByBriefBuckets(baseCatalog, allowedItems, forbiddenItems);
  filtered = filterCatalogByNameConstraints(filtered, allowedItems, forbiddenItems, input.userPrompt);
  filtered = ensureMandatoryBriefProducts(baseCatalog, filtered, input.userPrompt);
  filtered = filterCatalogByBlacklist(
    filtered,
    input.blacklistedProductIds ?? [],
    input.blacklistedSupplierIds ?? [],
  );

  const tirage = input.quantity ?? 0;
  if (tirage > 0) {
    const withStock = filtered.filter((p) => (p.stockAvailable ?? 0) >= tirage);
    if (withStock.length >= 8) filtered = withStock;
  }

  const withPrice = filtered.filter((p) => p.price != null && p.price > 0);
  if (withPrice.length >= 8) filtered = withPrice;

  const withImage = filtered.filter((p) => hasValidProductImage(p));
  if (withImage.length >= 4) filtered = withImage;

  const junkFree = filtered.filter((p) => scoreBriefRelevance(p, input.userPrompt, input.colors) > -70);
  if (junkFree.length >= 8) filtered = junkFree;

  const budgetPerSet =
    input.budgetPerSet ?? resolveBudgetPerSet(input.budgetMin, input.budgetMax);
  const itemCount = resolveTargetItemCount(input);

  if (budgetPerSet != null && budgetPerSet > 0) {
    const unitCap = maxUnitPriceForSet(budgetPerSet, itemCount);
    const byBudget = filtered.filter((p) => p.price == null || p.price <= budgetPerSet);
    if (byBudget.length >= 8) filtered = byBudget;

    const bySlot = filtered.filter((p) => p.price == null || p.price <= unitCap);
    if (bySlot.length >= 8) filtered = bySlot;
  } else {
    const maxItemPrice = input.budgetMax ?? input.budgetMin;
    if (maxItemPrice != null && maxItemPrice > 0) {
      const byBudget = filtered.filter((p) => p.price == null || p.price <= maxItemPrice);
      if (byBudget.length >= 8) filtered = byBudget;
    }
  }

  return filtered.length > 0 ? filtered : baseCatalog;
}

/** Сокращаем каталог до top-N кандидатов для LLM (полный каталог 2000+ SKU) */
export async function shortlistCatalogForLlm(
  catalog: CatalogProduct[],
  input: CatalogFilterInput,
  maxItems = 120,
): Promise<CatalogProduct[]> {
  if (catalog.length <= maxItems) return catalog;

  const scored = catalog
    .map((p) => ({ product: p, score: scoreProductForBrief(p, input) }))
    .sort((a, b) => b.score - a.score || (a.product.price ?? 0) - (b.product.price ?? 0));

  if (catalog.length > 2000) await yieldEventLoop();

  const top = scored.slice(0, maxItems * 2).map((s) => s.product);

  // Разнообразие типов товаров: не более ~15% шортлиста одного типа (ручка, powerbank, кружка…)
  const byType = new Map<string, number>();
  const typeCap = Math.max(5, Math.floor(maxItems * 0.15));
  const diversified: CatalogProduct[] = [];

  for (const p of top) {
    if (diversified.length >= maxItems) break;
    const type = detectConceptProductType(p);
    const n = byType.get(type) ?? 0;
    if (n >= typeCap) continue;
    diversified.push(p);
    byType.set(type, n + 1);
  }

  for (const p of top) {
    if (diversified.length >= maxItems) break;
    if (!diversified.some((x) => x.id === p.id)) diversified.push(p);
  }

  return diversified.slice(0, maxItems);
}

export { estimateSetTotalPrice } from './set-budget.util';

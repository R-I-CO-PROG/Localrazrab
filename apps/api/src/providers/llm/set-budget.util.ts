import type { CatalogProduct } from './catalog.util';
import { isVariantBlocked, productVariantKey } from './catalog-variant.util';
import {
  ConceptDiversityTracker,
  detectConceptProductType,
  detectMandatoryConceptTypesFromBrief,
} from './concept-diversity.util';
import { ensureConceptProducts } from './concept-product-picker.util';
import { budgetWeightForType } from '../../concept/product-taxonomy';

export function estimateSetTotalPrice(products: CatalogProduct[]): number {
  return products.reduce((sum, p) => sum + (p.price ?? 0), 0);
}

/** Целевое освоение бюджета набора: 85–100% от лимита (если budgetMin не задан) */
export const TARGET_SPEND_RATIO = 0.85;

/** Целевое освоение бюджета набора */
export function resolveSetBudgetRange(
  budgetMin?: number | null | string,
  budgetMax?: number | null | string,
): { floor: number; cap: number } {
  const parsedBudgetMin = typeof budgetMin === 'string' && budgetMin === 'undefined' ? null : budgetMin;
  const parsedBudgetMax = typeof budgetMax === 'string' && budgetMax === 'undefined' ? null : budgetMax;
  const cap = Math.max(0, (parsedBudgetMax as number) ?? (parsedBudgetMin as number) ?? DEFAULT_PER_SET_BUDGET);
  if (cap <= 0) return { floor: 0, cap: 0 };
  const floor =
    (parsedBudgetMin != null && (parsedBudgetMin as number) > 0)
      ? Math.min((parsedBudgetMin as number), cap)
      : Math.round(cap * TARGET_SPEND_RATIO);
  return { floor, cap };
}

/** @deprecated use resolveSetBudgetRange */
export function targetSpendForSet(perSetBudget: number): { floor: number; cap: number } {
  return resolveSetBudgetRange(null, perSetBudget);
}

/** Вес типа при распределении бюджета по слотам — из единой таксономии. */
export function slotBudgetWeight(type: string): number {
  return budgetWeightForType(type);
}

/** Целевая цена одного слота при распределении бюджета набора */
export function targetPriceForSlot(
  perSetBudget: number,
  slotTypes: string[],
  slotType: string,
): number {
  if (perSetBudget <= 0 || !slotTypes.length) return 0;
  const weights = slotTypes.map((t) => slotBudgetWeight(t));
  const totalWeight = weights.reduce((a, b) => a + b, 0) || slotTypes.length;
  const slotWeight = slotBudgetWeight(slotType);
  return (perSetBudget * slotWeight) / totalWeight;
}

/** Мягкий бонус 0..8 за близость цены к целевой (не выше maxUnitPrice) */
export function scorePriceFit(
  price: number,
  targetPrice: number,
  maxUnitPrice: number,
): number {
  if (price > maxUnitPrice) return -100;
  if (targetPrice <= 0 || price <= 0) return 0;
  const deviation = Math.abs(price - targetPrice) / Math.max(targetPrice, 1);
  return Math.max(0, 8 - deviation * 8);
}

/** Верхняя граница разумного бюджета одного набора (не тираж / не общий проект). */
export const PER_SET_BUDGET_CEILING = 100_000;
export const DEFAULT_PER_SET_BUDGET = 50_000;

/**
 * Бюджет одного набора (₽): cap для enforceSetBudget.
 * Берёт budgetMax из запроса; budgetMin — нижняя граница (upgrade), не подменяет cap.
 * Не умножает на quantity и не делит общий бюджет на тираж.
 */
export function resolveBudgetPerSet(
  budgetMin?: number | null | string,
  budgetMax?: number | null | string,
): number | null {
  const parsedBudgetMin = typeof budgetMin === 'string' && budgetMin === 'undefined' ? null : budgetMin;
  const parsedBudgetMax = typeof budgetMax === 'string' && budgetMax === 'undefined' ? null : budgetMax;

  const min = parsedBudgetMin != null && (parsedBudgetMin as number) > 0 ? (parsedBudgetMin as number) : null;
  const max = parsedBudgetMax != null && (parsedBudgetMax as number) > 0 ? (parsedBudgetMax as number) : null;

  if (max == null && min == null) return DEFAULT_PER_SET_BUDGET; // Default budget if none provided
  // If only one is provided, use it for both min and max for a single value budget
  if (max == null && min != null) return min;
  if (min == null && max != null) return max;

  if (max != null) {
    if (
      min != null &&
      max > PER_SET_BUDGET_CEILING &&
      min <= PER_SET_BUDGET_CEILING
    ) {
      return min;
    }
    if (min != null && max > min * 50 && max > PER_SET_BUDGET_CEILING) {
      return min;
    }
    return Math.min(max, PER_SET_BUDGET_CEILING);
  }

  return min != null ? Math.min(min, PER_SET_BUDGET_CEILING) : null;
}

/** Лог/проверка: budgetPerSet должен лежать в коридоре брифа. */
export function assertBudgetPerSetInRange(
  budgetPerSet: number | null,
  budgetMin?: number | null,
  budgetMax?: number | null,
  log?: (message: string) => void,
): void {
  if (budgetPerSet == null || budgetPerSet <= 0) return;

  const lo = budgetMin != null && budgetMin > 0 ? budgetMin : 0;
  const hiRaw = budgetMax != null && budgetMax > 0 ? budgetMax : budgetPerSet;
  const hi = Math.min(hiRaw, PER_SET_BUDGET_CEILING);

  if (budgetPerSet < lo || budgetPerSet > hi * 1.02) {
    log?.(
      `budgetPerSet=${budgetPerSet} outside [${lo}, ${hi}] (budgetMin=${budgetMin}, budgetMax=${budgetMax})`,
    );
  }
}

export function maxUnitPriceForSet(budgetPerSet: number, itemCount: number): number {
  const slots = Math.max(1, itemCount);
  const avg = budgetPerSet / slots;
  return Math.min(budgetPerSet, Math.ceil(avg * 1.35));
}

function findBudgetReplacement(
  result: CatalogProduct[],
  catalog: CatalogProduct[],
  budgetPerSet: number,
  blockedIds: Set<string>,
  blockedVariants: Set<string>,
): { slotIdx: number; replacement: CatalogProduct; newTotal: number } | null {
  const currentTotal = estimateSetTotalPrice(result);
  let bestUnder: { slotIdx: number; replacement: CatalogProduct; newTotal: number } | null = null;
  let bestReduction: {
    slotIdx: number;
    replacement: CatalogProduct;
    newTotal: number;
    saved: number;
  } | null = null;

  for (let slotIdx = 0; slotIdx < result.length; slotIdx++) {
    const current = result[slotIdx];
    const curPrice = current.price ?? 0;
    const localTypes = new Set(
      result
        .map((p, i) => (i === slotIdx ? null : detectConceptProductType(p)))
        .filter(Boolean) as string[],
    );

    for (const candidate of catalog) {
      if (candidate.id === current.id) continue;
      if (result.some((x, i) => i !== slotIdx && x.id === candidate.id)) continue;
      if (
        isVariantBlocked(candidate, blockedIds, blockedVariants) &&
        !result.some((x) => x.id === candidate.id)
      ) {
        continue;
      }
      const type = detectConceptProductType(candidate);
      if (localTypes.has(type)) continue;
      const candPrice = candidate.price ?? 0;
      if (candPrice >= curPrice) continue;

      const newTotal = currentTotal - curPrice + candPrice;
      if (newTotal <= budgetPerSet) {
        if (!bestUnder || newTotal > bestUnder.newTotal) {
          bestUnder = { slotIdx, replacement: candidate, newTotal };
        }
        continue;
      }

      const saved = curPrice - candPrice;
      if (!bestReduction || saved > bestReduction.saved) {
        bestReduction = { slotIdx, replacement: candidate, newTotal, saved };
      }
    }
  }

  if (bestUnder) return bestUnder;
  if (bestReduction) {
    return {
      slotIdx: bestReduction.slotIdx,
      replacement: bestReduction.replacement,
      newTotal: bestReduction.newTotal,
    };
  }
  return null;
}

/** Ужимает набор до budgetPerSet, сохраняя уникальность типов; не опустошает ниже minCount. */
export function enforceSetBudget(
  products: CatalogProduct[],
  catalog: CatalogProduct[],
  budgetPerSet: number,
  blockedIds: Set<string>,
  blockedVariants: Set<string>,
  seed = 0,
  minCount = 0,
  brief = '',
): CatalogProduct[] {
  if (!products.length || budgetPerSet <= 0) return products;

  const original = [...products];
  let result = [...products];
  const maxAttempts = Math.max(result.length * catalog.length, 32);

  for (let attempt = 0; attempt < maxAttempts && estimateSetTotalPrice(result) > budgetPerSet; attempt++) {
    const best = findBudgetReplacement(result, catalog, budgetPerSet, blockedIds, blockedVariants);
    if (!best) break;
    result[best.slotIdx] = best.replacement;
  }

  if (!result.length && original.length > 0) {
    result = [...original].sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
    while (result.length > minCount && estimateSetTotalPrice(result) > budgetPerSet) {
      let expensiveIdx = 0;
      for (let i = 1; i < result.length; i++) {
        if ((result[i].price ?? 0) > (result[expensiveIdx].price ?? 0)) expensiveIdx = i;
      }
      result.splice(expensiveIdx, 1);
    }
  }

  const targetCount = Math.max(minCount, result.length > 0 ? Math.min(result.length, original.length) : 0);
  if (targetCount > 0 && result.length < targetCount) {
    const tracker = new ConceptDiversityTracker(new Set());
    const affordable = catalog.filter((p) => (p.price ?? 0) <= budgetPerSet);
    result = ensureConceptProducts(
      result,
      affordable.length >= targetCount ? affordable : catalog,
      targetCount,
      { title: '', composition: brief.slice(0, 120), brief },
      blockedIds,
      blockedVariants,
      tracker,
      seed + 17,
      false,
    );
    if (estimateSetTotalPrice(result) > budgetPerSet) {
      result = enforceSetBudget(
        result,
        catalog,
        budgetPerSet,
        blockedIds,
        blockedVariants,
        seed + 33,
        minCount,
        brief,
      );
    }
  }

  for (let pass = 0; pass < maxAttempts && estimateSetTotalPrice(result) > budgetPerSet; pass++) {
    const best = findBudgetReplacement(result, catalog, budgetPerSet, blockedIds, blockedVariants);
    if (!best || best.newTotal > budgetPerSet) break;
    result[best.slotIdx] = best.replacement;
  }

  return result;
}

/** Один набор: уникальные типы, релевантность брифу, лимит суммы */
export function enforceSingleSetComposition(
  products: CatalogProduct[],
  catalog: CatalogProduct[],
  desiredCount: number,
  budgetPerSet: number | null | undefined,
  seed = 0,
  brief = '',
  composition = '',
): CatalogProduct[] {
  const mandatoryTypes = detectMandatoryConceptTypesFromBrief(brief);
  const tracker = new ConceptDiversityTracker(new Set(mandatoryTypes));
  const blockedIds = new Set<string>();
  const blockedVariants = new Set<string>();

  let pool = catalog;
  if (budgetPerSet != null && budgetPerSet > 0) {
    const affordable = catalog.filter((p) => p.price == null || p.price <= budgetPerSet);
    if (affordable.length >= desiredCount) pool = affordable;
  }

  const context = {
    title: composition.trim().slice(0, 80) || brief.trim().slice(0, 80),
    composition: composition || brief,
    brief,
  };

  let result = ensureConceptProducts(
    products,
    pool,
    desiredCount,
    context,
    blockedIds,
    blockedVariants,
    tracker,
    seed,
    false,
    undefined,
    mandatoryTypes,
  );

  if (budgetPerSet != null && budgetPerSet > 0 && result.length > 0) {
    result = enforceSetBudget(result, pool, budgetPerSet, blockedIds, blockedVariants, seed, 0, brief);
    if (result.length < desiredCount) {
      result = ensureConceptProducts(
        result,
        pool,
        desiredCount,
        context,
        blockedIds,
        blockedVariants,
        tracker,
        seed + 99,
        false,
        undefined,
        mandatoryTypes,
      );
    }
  }

  return result.slice(0, desiredCount);
}

export function filterProductsBySetBudget(
  products: CatalogProduct[],
  budgetPerSet: number,
): CatalogProduct[] {
  return products.filter((p) => p.price == null || p.price <= budgetPerSet);
}

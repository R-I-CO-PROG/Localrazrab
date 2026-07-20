import { defaultItemCount, parseItemCountBounds } from './parse-desired-count';
import { estimateSetSizeFromBrief } from './catalog-direct-search.util';

export interface ProductCountBounds {
  min: number;
  max: number;
  useLimit: boolean;
}

/**
 * Сколько предметов «по бюджету»: чем выше бюджет — тем больше И дороже позиций
 * (а не 3 мелочи и не 12 копеечных дженериков). Банды подобраны так, что премиум-набор
 * осваивает бюджет качественными позициями:
 *   ≤10k → 3-4 (avg ~2.5-3k), 25k → 4-5, 50k → 4-6, 80k → 5-7 (avg ~11-16k), 100k+ → 6-8.
 * Возвращает мягкий диапазон [min,max] (разные концепции берут разное число в этих рамках).
 */
export function budgetBasedItemBounds(
  budgetPerSet: number | null | undefined,
): { min: number; max: number } | null {
  if (budgetPerSet == null || budgetPerSet <= 0) return null;
  if (budgetPerSet <= 3000) return { min: 3, max: 4 };
  if (budgetPerSet <= 10000) return { min: 3, max: 4 };
  if (budgetPerSet <= 25000) return { min: 4, max: 5 };
  if (budgetPerSet <= 50000) return { min: 4, max: 6 };
  if (budgetPerSet <= 90000) return { min: 5, max: 7 };
  return { min: 6, max: 8 };
}

const clampBounds = (min: number, max: number) => {
  const lo = Math.max(1, Math.min(12, Math.round(min)));
  const hi = Math.max(lo, Math.min(12, Math.round(max)));
  return { min: lo, max: hi };
};

/**
 * Кэп по бюджету для СМЫСЛОВОЙ оценки: не раздуваем набор так, чтобы позиции стали копеечными
 * (~<300₽/шт). «Застолье» на 1000₽ → 3 предмета, а не 7. Точечный товар (min=max=1) не трогаем.
 */
const capBySemanticBudget = (
  bounds: { min: number; max: number },
  budgetPerSet: number | null | undefined,
): { min: number; max: number } => {
  if (!budgetPerSet || budgetPerSet <= 0) return bounds;
  const cap = Math.max(1, Math.floor(budgetPerSet / 300));
  // Кап МОЖЕТ опустить и max, и min ниже смысловой оценки: «застолье на 1000₽» → 3 позиции,
  // а не 5 по ~200₽. Раньше Math.max(bounds.min, cap) не давал капу пробить пол.
  const max = Math.max(1, Math.min(bounds.max, cap));
  const min = Math.min(bounds.min, max);
  return { min, max };
};

export function resolveProductCountBounds(request: {
  userPrompt: string;
  setItemCount?: number | null;
  useProductCountLimit?: boolean | null;
  minProductsPerSet?: number | null;
  maxProductsPerSet?: number | null;
  /** Бюджет одного набора — для оценки числа предметов, если оно не задано явно. */
  budgetPerSet?: number | null;
}): ProductCountBounds {
  const useLimit = request.useProductCountLimit !== false;

  // 1) ЯВНЫЕ поля min/max запроса (только при включённой галочке лимита) — высший приоритет.
  if (useLimit && (request.minProductsPerSet != null || request.maxProductsPerSet != null)) {
    const b = clampBounds(
      request.minProductsPerSet ?? request.maxProductsPerSet ?? 4,
      request.maxProductsPerSet ?? request.minProductsPerSet ?? request.minProductsPerSet ?? 4,
    );
    return { ...b, useLimit };
  }

  // 2) ЯВНОЕ число/диапазон в ТЕКСТЕ брифа («набор из 5», «4-6 предметов»).
  const fromBrief = parseItemCountBounds(request.userPrompt);
  if (fromBrief) return { ...clampBounds(fromBrief.min, fromBrief.max), useLimit };

  // 3) ДИНАМИЧЕСКАЯ смысловая оценка: точечный товар → 1, «застолье»/сюжет → 5-7, перечислены
  //    N товаров → ~N. Заменяет прежний статичный дефолт «4 штуки» осмысленным размером набора.
  const semantic = estimateSetSizeFromBrief(request.userPrompt);
  if (semantic) {
    const capped = capBySemanticBudget(semantic, request.budgetPerSet);
    return { ...clampBounds(capped.min, capped.max), useLimit };
  }

  // 4) Оценка по бюджету (набор должен осваивать бюджет, а не быть из 3 мелочей).
  const byBudget = budgetBasedItemBounds(request.budgetPerSet);
  if (byBudget) return { ...clampBounds(byBudget.min, byBudget.max), useLimit };

  // 5) Дефолт.
  const n = request.setItemCount ?? defaultItemCount(request.userPrompt);
  return { ...clampBounds(n, n), useLimit };
}

export function pickConceptItemCount(bounds: ProductCountBounds, conceptIndex: number): number {
  if (bounds.min === bounds.max) return bounds.min;
  const span = bounds.max - bounds.min + 1;
  return bounds.min + (conceptIndex % span);
}

export function averageItemCount(bounds: ProductCountBounds): number {
  return Math.round((bounds.min + bounds.max) / 2);
}

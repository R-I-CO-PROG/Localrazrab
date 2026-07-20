/**
 * РАЗНОЕ ЧИСЛО ТОВАРОВ в креативных наборах: LLM склонна давать всем наборам одинаковый размер —
 * детерминированно варьируем по паттерну.
 *
 * Инвариант: порядок `items` — это порядок ответа LLM, а НЕ «must первыми» (нигде не сортируется:
 * ideator normalize() и mergeConcept копируют items как есть). Поэтому голый `slice(0, target)`
 * выбрасывал ОБЯЗАТЕЛЬНУЮ позицию, если модель поставила «nice» раньше «must». Режем только
 * nice-хвост, никогда не опускаемся ниже числа must и сохраняем исходный порядок (нарратив набора
 * завязан на него).
 */
export const CREATIVE_SIZE_PATTERN = [5, 3, 4, 5, 3, 4];
const MIN_ITEMS = 3;

export interface PrioritizedItem {
  priority?: string;
}

/** Целевой размер набора #index: не ниже min, не ниже числа must, не выше наличного. */
export function targetSetSize(itemCount: number, mustCount: number, index: number): number {
  const patterned = CREATIVE_SIZE_PATTERN[index % CREATIVE_SIZE_PATTERN.length];
  return Math.min(itemCount, Math.max(MIN_ITEMS, mustCount, patterned));
}

/** Обрезает набор до целевого размера, снимая ТОЛЬКО nice-позиции с хвоста. */
export function trimItemsPreservingMust<T extends PrioritizedItem>(items: T[], index: number): T[] {
  if (!Array.isArray(items) || items.length <= MIN_ITEMS) return items;
  const mustCount = items.filter((it) => it?.priority === 'must').length;
  const target = targetSetSize(items.length, mustCount, index);
  if (target >= items.length) return items;
  let toDrop = items.length - target;
  const keep = items.slice();
  for (let j = keep.length - 1; j >= 0 && toDrop > 0; j--) {
    if (keep[j]?.priority === 'must') continue; // must неприкосновенны
    keep.splice(j, 1);
    toDrop--;
  }
  return keep;
}

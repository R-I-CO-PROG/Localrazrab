import type { CatalogProduct } from './catalog.util';

/**
 * Реализуемость набора: можно ли физически отгрузить тираж.
 * Для B2B-подарков это не косметика — набор с товаром остатка 1 при тираже 155
 * невозможно исполнить. Единый источник истины для скоринга, сборки и вывода.
 */

/** Покрывает ли остаток товара тираж (при тираже ≤ 0 — ограничения нет). */
export function productFulfillsTirage(
  product: CatalogProduct,
  tirage: number | null | undefined,
): boolean {
  const t = tirage ?? 0;
  if (t <= 0) return true;
  return (product.stockAvailable ?? 0) >= t;
}

/** Сколько единиц не хватает под тираж (0 — хватает или тираж не задан). */
export function productStockShortfall(
  product: CatalogProduct,
  tirage: number | null | undefined,
): number {
  const t = tirage ?? 0;
  if (t <= 0) return 0;
  return Math.max(0, t - (product.stockAvailable ?? 0));
}

/** Ранг для сортировки: 1 — товар покрывает тираж, 0 — нет. */
export function fulfillmentRank(
  product: CatalogProduct,
  tirage: number | null | undefined,
): number {
  return productFulfillsTirage(product, tirage) ? 1 : 0;
}

export type FulfillmentStatus = 'ok' | 'partial' | 'risky';

export interface SetFulfillment {
  status: FulfillmentStatus;
  tirage: number;
  totalCount: number;
  coveredCount: number;
  /** Позиции с нехваткой остатка: id, название, остаток, сколько не хватает. */
  shortItems: Array<{
    id: string;
    name: string;
    stockAvailable: number;
    shortfall: number;
  }>;
}

/**
 * Сводка реализуемости набора под тираж:
 *  - ok      — все позиции покрывают тираж (или тираж не задан);
 *  - partial — часть покрывает, часть нет;
 *  - risky   — ни одна позиция не покрывает тираж.
 */
export function summarizeSetFulfillment(
  products: CatalogProduct[],
  tirage: number | null | undefined,
): SetFulfillment {
  const t = tirage ?? 0;
  const totalCount = products.length;
  if (t <= 0 || totalCount === 0) {
    return { status: 'ok', tirage: Math.max(0, t), totalCount, coveredCount: totalCount, shortItems: [] };
  }

  const shortItems = products
    .filter((p) => !productFulfillsTirage(p, t))
    .map((p) => ({
      id: p.id,
      name: p.name,
      stockAvailable: p.stockAvailable ?? 0,
      shortfall: productStockShortfall(p, t),
    }));

  const coveredCount = totalCount - shortItems.length;
  const status: FulfillmentStatus =
    shortItems.length === 0 ? 'ok' : coveredCount === 0 ? 'risky' : 'partial';

  return { status, tirage: t, totalCount, coveredCount, shortItems };
}

/** Человекочитаемая пометка нехватки остатка для UI. */
export function formatStockShortfall(stockAvailable: number, tirage: number): string {
  return `остаток ${stockAvailable} шт при тираже ${tirage}`;
}

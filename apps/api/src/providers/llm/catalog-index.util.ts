import type { CatalogProduct } from './catalog.util';
import { detectConceptProductType } from './concept-diversity.util';
import { catalogImbaPath, imbaCategoryBranch } from '../../catalog/imba-category-overrides';
import {
  type CatalogFilterInput,
  scoreProductForBrief,
} from './catalog-filter.util';
import { yieldEventLoop } from '../../common/yield-event-loop';

export interface CompactCatalogRow {
  name: string;
  /** IMBA path или упрощённая категория */
  category: string;
  price: number | null;
  stock: number;
}

export interface CatalogOverviewCategory {
  name: string;
  count: number;
  samples: string[];
}

export interface CatalogOverview {
  totalProducts: number;
  /** Полный размер каталога в БД (51k), если известен */
  totalInDatabase?: number;
  categories: CatalogOverviewCategory[];
  productTypes: Array<{ type: string; count: number }>;
}

export interface CatalogPipelineResult {
  totalInDb: number;
  filtered: import('./catalog.util').CatalogProduct[];
  relevance: import('./catalog.util').CatalogProduct[];
  forLlm: import('./catalog.util').CatalogProduct[];
  /** Широкий пул всех категорий (до relevance/eco-сужения) — для диверсификации
   *  и добора нишевых брифов, где relevance схлопывается до десятков SKU. */
  broad: import('./catalog.util').CatalogProduct[];
  overview: CatalogOverview;
  typeIndex: Map<string, import('./catalog.util').CatalogProduct[]>;
}

const DEFAULT_STRATIFIED_MAX = 480;

/** Компактная строка каталога для LLM (меньше токенов) */
export function toCompactCatalogRow(product: CatalogProduct): CompactCatalogRow {
  return {
    name: product.name,
    category: product.subcategory?.trim() || product.category,
    price: product.price ?? null,
    stock: product.stockAvailable ?? 0,
  };
}

/** Обзор каталога в scope — LLM видит структуру релевантного среза */
export function buildCatalogOverview(
  catalog: CatalogProduct[],
  totalInDatabase?: number,
): CatalogOverview {
  const byCategory = new Map<string, CatalogProduct[]>();
  const byType = new Map<string, number>();

  for (const product of catalog) {
    const path = product.subcategory?.trim();
    const cat = path ? imbaCategoryBranch(path, 2) : product.category || 'Прочее';
    const list = byCategory.get(cat) ?? [];
    list.push(product);
    byCategory.set(cat, list);

    const type = detectConceptProductType(product);
    byType.set(type, (byType.get(type) ?? 0) + 1);
  }

  const categories: CatalogOverviewCategory[] = [...byCategory.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([name, products]) => ({
      name,
      count: products.length,
      samples: products.slice(0, 4).map((p) => p.name),
    }));

  const productTypes = [...byType.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => ({ type, count }));

  return {
    totalProducts: catalog.length,
    totalInDatabase,
    categories,
    productTypes,
  };
}

/**
 * Стратифицированная выборка из всего каталога для LLM:
 * top-N по каждому типу товара + покрытие категорий + глобальный top.
 * В отличие от shortlistCatalogForLlm (120 SKU) даёт LLM видимость ~400+ позиций.
 */
export async function stratifiedCatalogForLlm(
  catalog: CatalogProduct[],
  input: CatalogFilterInput,
  maxItems = DEFAULT_STRATIFIED_MAX,
): Promise<CatalogProduct[]> {
  if (catalog.length <= maxItems) return catalog;

  const scored = catalog
    .map((p) => ({ product: p, score: scoreProductForBrief(p, input) }))
    .sort((a, b) => b.score - a.score || (a.product.price ?? 0) - (b.product.price ?? 0));

  if (catalog.length > 2000) await yieldEventLoop();

  const perTypeCap = Math.max(6, Math.min(12, Math.floor(maxItems / 45)));
  const byType = new Map<string, CatalogProduct[]>();

  for (const { product } of scored) {
    const type = detectConceptProductType(product);
    const list = byType.get(type) ?? [];
    if (list.length >= perTypeCap) continue;
    list.push(product);
    byType.set(type, list);
  }

  const picked = new Map<string, CatalogProduct>();
  for (const products of byType.values()) {
    for (const p of products) picked.set(p.id, p);
  }

  // Минимум 1–2 SKU из каждой IMBA-ветки (если влезает в лимит)
  const byCategory = new Map<string, CatalogProduct[]>();
  for (const { product } of scored) {
    const path = catalogImbaPath(product);
    const cat = path.includes(' / ') ? imbaCategoryBranch(path, 2) : path;
    const list = byCategory.get(cat) ?? [];
    if (list.length >= 2) continue;
    list.push(product);
    byCategory.set(cat, list);
  }
  for (const products of byCategory.values()) {
    for (const p of products) picked.set(p.id, p);
  }

  // Добираем глобальным top-score до лимита
  for (const { product } of scored) {
    if (picked.size >= maxItems) break;
    picked.set(product.id, product);
  }

  // Небольшая доля «исследовательских» позиций вне top — для разнообразия
  const exploreSlots = Math.min(40, Math.floor(maxItems * 0.08));
  const midStart = Math.floor(scored.length * 0.35);
  const midPool = scored.slice(midStart, midStart + exploreSlots * 4);
  let added = 0;
  for (const { product } of midPool) {
    if (picked.size >= maxItems || added >= exploreSlots) break;
    if (picked.has(product.id)) continue;
    picked.set(product.id, product);
    added++;
  }

  return [...picked.values()].slice(0, maxItems);
}

export function buildCatalogAgentPayload(
  catalogSample: CatalogProduct[],
  overview: CatalogOverview,
  extra: Record<string, unknown> = {},
) {
  return {
    catalog_overview: overview,
    catalog_total_in_scope: overview.totalProducts,
    catalog_sample_size: catalogSample.length,
    catalog_products: catalogSample.map(toCompactCatalogRow),
    catalog_note:
      'catalog_products — репрезентативная выборка из всего каталога (по типам и IMBA-категориям). ' +
      'category в catalog_products — полный IMBA path (напр. «Продукция / Кухня и посуда / …»). ' +
      'catalog_overview.categories — агрегат по веткам IMBA (уровень 1–2). ' +
      'Выбирайте ТОЛЬКО name из catalog_products (точное совпадение). ' +
      'После отбора система сопоставит SKU с полным каталогом.',
    ...extra,
  };
}

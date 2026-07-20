import type { CatalogProduct } from '../providers/llm/catalog.util';
import { resolveCatalogImageUrl } from '../products/product-image.util';

/** Товары из снимка запроса — единственный источник правды для генерации */
export function resolveProductsFromSnapshot(
  snapshot: Record<string, unknown>,
  fullCatalog: CatalogProduct[],
  llmFallback: CatalogProduct[],
): CatalogProduct[] {
  const ids = (snapshot.productIds as string[]) ?? [];
  const names = (snapshot.productNames as string[]) ?? [];

  const byId = new Map(fullCatalog.map((p) => [p.id, p]));
  const byName = new Map(fullCatalog.map((p) => [p.name.toLowerCase(), p]));

  if (ids.length > 0) {
    const picked: CatalogProduct[] = [];
    for (const id of ids) {
      const product = byId.get(String(id));
      if (product) picked.push(product);
    }
    if (picked.length > 0) return picked;
  }

  if (names.length === 0) return llmFallback;

  const picked: CatalogProduct[] = [];
  for (const name of names) {
    const product = byName.get(String(name).toLowerCase());
    if (product) picked.push(product);
  }

  return picked.length > 0 ? picked : llmFallback;
}

/** URL референсов из снимка (точные фото выбранных SKU) или из каталога */
export function resolveCatalogImageUrlsFromSnapshot(
  snapshot: Record<string, unknown>,
  products: CatalogProduct[],
): string[] {
  const snapshotUrls = (snapshot.catalogImageUrls as string[] | undefined) ?? [];
  if (snapshotUrls.length === products.length && snapshotUrls.every((u) => u?.trim())) {
    return snapshotUrls;
  }
  return products.map((p) => resolveCatalogImageUrl(p));
}

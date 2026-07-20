import type { CatalogProduct } from '../providers/llm/catalog.util';
export declare function resolveProductsFromSnapshot(snapshot: Record<string, unknown>, fullCatalog: CatalogProduct[], llmFallback: CatalogProduct[]): CatalogProduct[];
export declare function resolveCatalogImageUrlsFromSnapshot(snapshot: Record<string, unknown>, products: CatalogProduct[]): string[];

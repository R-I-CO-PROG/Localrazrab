import type { CatalogProduct } from './catalog.util';
export declare function productVariantKey(product: CatalogProduct): string;
export declare function indexCatalogByName(catalog: CatalogProduct[]): Map<string, CatalogProduct[]>;
export declare function pickBestColorVariant(candidates: CatalogProduct[], brandColors?: string[]): CatalogProduct;
export declare function dedupeProductsByVariant(products: CatalogProduct[], excludeVariantKeys?: Set<string>): CatalogProduct[];
export declare function upgradeToBrandColorVariants(products: CatalogProduct[], catalog: CatalogProduct[], brandColors?: string[]): CatalogProduct[];
export declare function isVariantBlocked(product: CatalogProduct, blockedIds: Set<string>, blockedVariants: Set<string>): boolean;

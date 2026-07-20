import type { CatalogProduct } from './catalog.util';
export declare function filterCatalogByNameConstraints(catalog: CatalogProduct[], allowedItems: string[], forbiddenItems: string[], userPrompt?: string): CatalogProduct[];
export declare function ensureMandatoryBriefProducts(fullCatalog: CatalogProduct[], filtered: CatalogProduct[], userPrompt: string): CatalogProduct[];

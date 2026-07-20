export interface CatalogColor {
    name: string;
    hex?: string | null;
    code?: string | null;
}
export interface CatalogProduct {
    id: string;
    name: string;
    category: string;
    subcategory?: string | null;
    description?: string | null;
    sourceId?: string | null;
    externalId?: string | null;
    price?: number | null;
    currency?: string | null;
    stockAvailable?: number;
    colors?: CatalogColor[];
    silhouetteImageUrl: string;
    catalogImageUrl?: string | null;
    imageUrl?: string | null;
    sourceUrl?: string | null;
}
export declare function filterCatalogByBlacklist(catalog: CatalogProduct[], productIds?: string[], supplierIds?: string[]): CatalogProduct[];
export declare function isClothingProductName(name: string): boolean;
export declare function promptRequestsClothing(userPrompt: string): boolean;
export declare function filterCatalogByConstraints(catalog: CatalogProduct[], allowedItems: string[], forbiddenItems: string[]): CatalogProduct[];
export declare function resolveLlmProductSelection(llmItems: string[], catalog: CatalogProduct[], userProductNames: string[], respectUserSelection: boolean, desiredCount?: number, strictCount?: boolean, options?: {
    excludeVariantKeys?: Set<string>;
    brandColors?: string[];
}): CatalogProduct[];
export declare function pickDefaultProducts(catalog: CatalogProduct[], hintNames?: string[], count?: number, options?: {
    excludeVariantKeys?: Set<string>;
    brandColors?: string[];
}): CatalogProduct[];
export declare function stubPickProductsFromBrief(catalog: CatalogProduct[], userPrompt: string, category: string, desiredCount?: number): CatalogProduct[];

import type { CatalogProduct } from './catalog.util';
export declare function resolveTargetItemCount(input: CatalogFilterInput): number;
export interface CatalogFilterInput {
    userPrompt: string;
    projectCategory?: string | null;
    quantity?: number | null;
    budgetMin?: number | null;
    budgetMax?: number | null;
    budgetPerSet?: number | null;
    setItemCount?: number | null;
    useProductCountLimit?: boolean;
    minProductsPerSet?: number | null;
    maxProductsPerSet?: number | null;
    colors: string[];
    allowedItems: string[];
    forbiddenItems: string[];
    blacklistedProductIds?: string[];
    blacklistedSupplierIds?: string[];
}
export declare function scoreProductForBrief(product: CatalogProduct, input: CatalogFilterInput): number;
export declare function filterCatalogForRequest(catalog: CatalogProduct[], input: CatalogFilterInput): CatalogProduct[];
export declare function shortlistCatalogForLlm(catalog: CatalogProduct[], input: CatalogFilterInput, maxItems?: number): Promise<CatalogProduct[]>;
export { estimateSetTotalPrice } from './set-budget.util';

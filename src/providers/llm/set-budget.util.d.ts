import type { CatalogProduct } from './catalog.util';
export declare function estimateSetTotalPrice(products: CatalogProduct[]): number;
export declare const TARGET_SPEND_RATIO = 0.85;
export declare function resolveSetBudgetRange(budgetMin?: number | null, budgetMax?: number | null): {
    floor: number;
    cap: number;
};
export declare function targetSpendForSet(perSetBudget: number): {
    floor: number;
    cap: number;
};
export declare function slotBudgetWeight(type: string): number;
export declare function targetPriceForSlot(perSetBudget: number, slotTypes: string[], slotType: string): number;
export declare function scorePriceFit(price: number, targetPrice: number, maxUnitPrice: number): number;
export declare const PER_SET_BUDGET_CEILING = 100000;
export declare function resolveBudgetPerSet(budgetMin?: number | null, budgetMax?: number | null): number | null;
export declare function assertBudgetPerSetInRange(budgetPerSet: number | null, budgetMin?: number | null, budgetMax?: number | null, log?: (message: string) => void): void;
export declare function maxUnitPriceForSet(budgetPerSet: number, itemCount: number): number;
export declare function enforceSetBudget(products: CatalogProduct[], catalog: CatalogProduct[], budgetPerSet: number, blockedIds: Set<string>, blockedVariants: Set<string>, seed?: number, minCount?: number): CatalogProduct[];
export declare function enforceSingleSetComposition(products: CatalogProduct[], catalog: CatalogProduct[], desiredCount: number, budgetPerSet: number | null | undefined, seed?: number, brief?: string, composition?: string): CatalogProduct[];
export declare function filterProductsBySetBudget(products: CatalogProduct[], budgetPerSet: number): CatalogProduct[];

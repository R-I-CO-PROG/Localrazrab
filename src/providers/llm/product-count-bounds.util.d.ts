export interface ProductCountBounds {
    min: number;
    max: number;
    useLimit: boolean;
}
export declare function budgetBasedItemBounds(budgetPerSet: number | null | undefined): {
    min: number;
    max: number;
} | null;
export declare function resolveProductCountBounds(request: {
    userPrompt: string;
    setItemCount?: number | null;
    useProductCountLimit?: boolean | null;
    minProductsPerSet?: number | null;
    maxProductsPerSet?: number | null;
    budgetPerSet?: number | null;
}): ProductCountBounds;
export declare function pickConceptItemCount(bounds: ProductCountBounds, conceptIndex: number): number;
export declare function averageItemCount(bounds: ProductCountBounds): number;

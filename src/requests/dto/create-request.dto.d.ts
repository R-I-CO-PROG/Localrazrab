export declare class CreateRequestDto {
    title?: string;
    userPrompt?: string;
    category?: string;
    budgetMin?: number;
    budgetMax?: number;
    quantity?: number;
    colors?: string[];
    allowedItems?: string[];
    forbiddenItems?: string[];
    setItemCount?: number;
    useProductCountLimit?: boolean;
    minProductsPerSet?: number;
    maxProductsPerSet?: number;
    conceptCount?: number;
    visualizationCount?: number;
    notes?: string;
    productIds?: string[];
    blacklistedProductIds?: string[];
    blacklistedSupplierIds?: string[];
}

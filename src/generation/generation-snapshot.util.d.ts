type RequestWithRelations = {
    title: string;
    userPrompt: string;
    category: string;
    budgetMin: number | null;
    budgetMax: number | null;
    quantity: number | null;
    colors: unknown;
    allowedItems: unknown;
    forbiddenItems: unknown;
    notes: string | null;
    items: Array<{
        productId: string;
        product: {
            name: string;
            category: string;
            silhouetteImageUrl: string;
            catalogImageUrl?: string | null;
        };
    }>;
    assets: Array<{
        type: string;
        url: string;
    }>;
};
export declare function buildGenerationInputSnapshot(request: RequestWithRelations, options: {
    mode: 'mockup' | 'ai';
    aiStyle: 'catalog' | 'creative';
    debug: boolean;
    publicApiUrl: string;
    revision?: number;
    chosenIdeaTitle?: string;
    productTargetColors?: Array<{
        productId: string;
        color: string;
    }>;
    sceneBrief?: string;
}): {
    title: string;
    userPrompt: string;
    category: string;
    budgetMin: number | null;
    budgetMax: number | null;
    quantity: number | null;
    colors: unknown;
    allowedItems: unknown;
    forbiddenItems: unknown;
    notes: string | null;
    productNames: string[];
    productIds: string[];
    silhouetteUrls: string[];
    catalogImageUrls: string[];
    products: {
        id: string;
        name: string;
        category: string;
    }[];
    productTargetColors: {
        productId: string;
        color: string;
    }[];
    assets: {
        type: string;
        url: string;
    }[];
    hasLogo: boolean;
    logoUrl: string | null;
    logoPublicUrl: string | null;
    generationMode: "mockup" | "ai";
    aiStyle: "catalog" | "creative";
    debug: boolean;
    revision: number;
    chosenIdeaTitle: string | null;
    sceneBrief: string | null;
};
export {};

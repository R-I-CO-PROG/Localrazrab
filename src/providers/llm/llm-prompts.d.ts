export declare function buildLlmSystemPromptForScene(): string;
export declare function buildLlmSystemPrompt(respectUserProducts?: boolean): string;
export declare function buildLlmSystemPromptForCreative(): string;
export declare function buildLlmSystemPromptForBriefParse(): string;
export declare function buildLlmSystemPromptForSuggest(): string;
export declare function buildLlmSystemPromptForCatalogConcepts(): string;
export declare function buildLlmSystemPromptForProductAdd(): string;
export declare function resolveLlmSystemPrompt(input: {
    sceneOnly?: boolean;
    creativeMode?: boolean;
    suggestMode?: boolean;
    briefParseMode?: boolean;
    catalogConceptsMode?: boolean;
    productAddMode?: boolean;
}, respectUser?: boolean): string;
export declare const LLM_SYSTEM_PROMPT: string;
export declare function buildLlmUserMessage(input: Record<string, unknown>): string;
export declare function buildLlmUserPayload(input: {
    userPrompt: string;
    category: string;
    quantity?: number | null;
    budgetMin?: number | null;
    budgetMax?: number | null;
    colors: string[];
    allowedItems: string[];
    forbiddenItems: string[];
    productNames: string[];
    catalogProducts?: Array<{
        id: string;
        name: string;
        category: string;
        externalId?: string | null;
        price?: number | null;
        stockAvailable?: number;
        colors?: Array<{
            name: string;
            hex?: string | null;
        }>;
    }>;
    desiredItemCount?: number;
    hasLogo?: boolean;
    logoUrl?: string | null;
    notes?: string | null;
    catalogConceptsMode?: boolean;
    mandatoryConceptTypes?: string[];
}, options?: {
    respectUserProducts?: boolean;
    suggestMode?: boolean;
    productAddMode?: boolean;
    currentSetProducts?: string[];
    addRequest?: string;
}): {
    mode: string;
    add_request: string;
    quantity_tirage: number | null;
    colors: string[] | null;
    stock_rule: string | null;
    current_set_products: string[] | null;
    desired_item_count: number;
    catalog: {
        id: string;
        name: string;
        category: string;
        sku: string | null;
        price_rub: number | null;
        stock_available: number | null;
        colors: string[];
    }[];
    catalog_size: number;
    lock_user_products: boolean;
    task: string;
} | {
    category_diversity?: {
        within_set_max_per_type: number;
        optional_type_max_concepts: number;
        mandatory_type_max_concepts: number;
        mandatory_types_from_brief: {
            type: string;
            label: string;
        }[];
        rule: string;
    } | undefined;
    set_composition?: {
        max_per_product_type_in_set: number;
        forbidden_in_one_set: string[];
        rule: string;
    } | undefined;
    current_set_products?: string[] | undefined;
    mode: string;
    task: string;
    category: string;
    quantity: number | null | undefined;
    budget: {
        min: number | null | undefined;
        max: number | null | undefined;
    };
    budget_per_set: number | null;
    budget_rule: string | null;
    colors: string[];
    brand_colors_hex: string[] | null;
    brand_colors_required: string | null;
    logo_branding_required: string | null;
    preferred_categories: string[];
    forbidden: string[];
    desired_item_count: number;
    user_products: string[] | null;
    lock_user_products: boolean;
    catalog: {
        id: string;
        name: string;
        category: string;
        sku: string | null;
        price_rub: number | null;
        stock_available: number | null;
        colors: string[];
    }[];
    catalog_size: number;
    has_logo: boolean;
    logo_uploaded: boolean;
    notes: string | null;
    add_request?: undefined;
    quantity_tirage?: undefined;
    stock_rule?: undefined;
};

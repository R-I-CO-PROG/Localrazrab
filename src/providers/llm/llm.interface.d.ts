import type { CatalogProduct } from './catalog.util';
export interface LlmGenerationInput {
    userPrompt: string;
    category: string;
    quantity?: number | null;
    budgetMin?: number | null;
    budgetMax?: number | null;
    colors: string[];
    allowedItems: string[];
    forbiddenItems: string[];
    productNames: string[];
    catalogProducts?: CatalogProduct[];
    desiredItemCount?: number;
    hasLogo?: boolean;
    logoUrl?: string | null;
    notes?: string | null;
    sceneOnly?: boolean;
    creativeMode?: boolean;
    suggestMode?: boolean;
    briefParseMode?: boolean;
    catalogConceptsMode?: boolean;
    mandatoryConceptTypes?: string[];
    productAddMode?: boolean;
    currentSetProductNames?: string[];
    excludeVariantKeys?: string[];
    addRequestHint?: string;
}
export type LlmInterpretMode = 'suggest' | 'generation';
export interface LlmGenerationOutput {
    items: string[];
    composition: string;
    style: string;
    image_prompt: string;
    negative_prompt: string;
}
export interface LlmProvider {
    generate(input: LlmGenerationInput): Promise<LlmGenerationOutput>;
}

import { LlmGenerationOutput } from '../providers/llm/llm.interface';
export interface GenerationSnapshot {
    userPrompt?: string;
    category?: string;
    quantity?: number | null;
    colors?: string[];
    productNames?: string[];
    logoUrl?: string | null;
    hasLogo?: boolean;
}
export declare function buildProductMockupPrompt(llmOutput: LlmGenerationOutput, snapshot: GenerationSnapshot): string;
export declare function buildCompactImagePrompt(llmOutput: LlmGenerationOutput, snapshot: GenerationSnapshot): string;
export declare const buildPollinationsPrompt: typeof buildProductMockupPrompt;

import { LlmGenerationInput, LlmGenerationOutput } from './llm.interface';
export interface LlmBriefParseJson {
    category?: string;
    quantity?: number;
    set_item_count?: number;
    budget_min?: number;
    budget_max?: number;
    budget_scope?: 'per_set' | 'total';
    colors?: string[];
    allowed_items?: string[];
    named_items?: string[];
    forbidden_items?: string[];
    mandatory_types?: string[];
    alternative_type_groups?: string[][];
    notes?: string;
}
export interface LlmCatalogConceptJson {
    title: string;
    composition: string;
    style: string;
    items: string[];
}
export interface LlmCatalogConceptsJson {
    concepts: LlmCatalogConceptJson[];
}
export declare function parseCatalogConceptsJson(content: string): LlmCatalogConceptsJson;
export declare function parseLlmBriefJson(content: string): LlmBriefParseJson;
export declare function buildLlmOutputFromContent(content: string, input: LlmGenerationInput): LlmGenerationOutput;
export declare function parseLlmJson(content: string): LlmGenerationOutput;

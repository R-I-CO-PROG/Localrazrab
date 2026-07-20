export interface GenerationHistory {
    productIds: string[];
    productVariantKeys?: string[];
    conceptTitles: string[];
    themeAxes: string[];
    generationCount: number;
}
export declare function extractFromConceptsOutput(conceptsOutput: unknown): {
    productIds: string[];
    productVariantKeys: string[];
    conceptTitles: string[];
    themeAxes: string[];
};
export declare function readGenerationHistory(routerOutput: unknown): GenerationHistory | null;
export declare function mergeGenerationHistory(existing: GenerationHistory | null, latest: {
    productIds: string[];
    productVariantKeys?: string[];
    conceptTitles: string[];
    themeAxes: string[];
}): GenerationHistory;
export declare function buildPreviousResultsPayload(history: GenerationHistory | null | undefined): {
    product_ids: string[];
    concept_titles: string[];
    theme_axes: string[];
    previous_generation_count: number;
} | null;
export declare function normalizeConceptKey(text: string): string;
export declare function isSimilarConceptTitle(a: string, b: string): boolean;

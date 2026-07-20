export type ConceptResultVariant = {
    id: string;
    imageUrl: string;
    revision: number;
    finishedAt: string;
    refinementBrief?: string | null;
};
export type ConceptGenerationResult = {
    chosenIdeaTitle: string;
    resultImageUrl: string;
    productIds: string[];
    revision: number;
    finishedAt: string;
    variants: ConceptResultVariant[];
};
export type ConceptResultsMap = Record<string, ConceptGenerationResult>;
export declare function conceptResultKey(title?: string | null): string;
export declare function parseConceptResults(raw: unknown): ConceptResultsMap;
export declare function mergeConceptResult(existing: unknown, entry: {
    chosenIdeaTitle: string;
    resultImageUrl: string;
    productIds: string[];
    revision: number;
    finishedAt?: Date | string | null;
    refinementBrief?: string | null;
    variantId?: string;
}): ConceptResultsMap;
export declare function backfillConceptResultsFromGeneration(generation: {
    resultImageUrl?: string | null;
    inputSnapshot?: unknown;
    finishedAt?: Date | null;
    conceptResults?: unknown;
}): ConceptResultsMap;
export declare function getConceptResult(conceptResults: unknown, chosenIdeaTitle?: string | null): ConceptGenerationResult | null;

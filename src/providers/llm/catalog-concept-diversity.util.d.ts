import type { CatalogIdeatorIdea } from '../../agents/contracts';
import { type GenerationHistory } from '../../agents/previous-generation.util';
export declare function catalogIdeaSlotSignature(idea: {
    productSlots?: Array<{
        type: string;
    }>;
    title?: string;
}): string;
export declare function pickDiverseCatalogIdeas<T extends {
    title: string;
}>(ranked: T[], ideasByTitle: Map<string, CatalogIdeatorIdea>, limit: number, generationHistory?: GenerationHistory | null): T[];

import type { CatalogIdeatorIdea } from '../../agents/contracts';
export declare function generateLocalCatalogIdeas(input: {
    userPrompt: string;
    category?: string | null;
    desiredItemCount: number;
    mandatoryTypes: string[];
    namedTypes?: string[];
    namedItems?: string[];
    directedMode?: boolean;
    alternativeTypeGroups?: string[][];
    count?: number;
}): CatalogIdeatorIdea[];

import type { Concept, CriticOutput, CriticTopIdea, IdeatorIdea, IdeatorOutput } from './contracts';
export declare function buildConceptNarrative(full: IdeatorIdea | undefined, top: CriticTopIdea): string;
export declare function buildConcepts(ideatorOutput: IdeatorOutput | null, criticOutput: CriticOutput | null, meta?: {
    usedFallback?: boolean;
    fallbackReason?: string;
}): Array<Concept & {
    usedFallback?: boolean;
    fallbackReason?: string;
}>;
export declare function findConceptByTitle(concepts: Concept[], title: string): Concept | undefined;
export declare function findIdeatorIdeaByTitle(ideatorOutput: IdeatorOutput | null, title: string): IdeatorIdea | undefined;

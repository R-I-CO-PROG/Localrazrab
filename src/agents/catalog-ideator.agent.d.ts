import { ConfigService } from '@nestjs/config';
import { OpenrouterAgentClient } from './openrouter-agent.client';
import { AgentBriefContext } from './brief-context.util';
import type { CatalogIdeatorOutput } from './contracts';
import type { AgentDebugTraceFn } from './agent-debug.types';
import type { CatalogOverview } from '../providers/llm/catalog-index.util';
import { type GenerationHistory } from './previous-generation.util';
export type CatalogIdeatorResult = CatalogIdeatorOutput & {
    usedFallback: boolean;
    fallbackReason?: string;
};
export interface CatalogIdeatorInput extends AgentBriefContext {
    desiredItemCount: number;
    budgetPerSet: number | null;
    mandatoryTypes: string[];
    namedTypes?: string[];
    directedMode?: boolean;
    namedItems?: string[];
    alternativeTypeGroups?: string[][];
    catalogOverview: CatalogOverview;
    trace?: AgentDebugTraceFn;
    generationHistory?: GenerationHistory | null;
}
export declare class CatalogIdeatorAgent {
    private readonly openrouter;
    private readonly config;
    private readonly logger;
    constructor(openrouter: OpenrouterAgentClient, config: ConfigService);
    private isFastPipeline;
    private ideatorTargets;
    private ideatorTimeoutMs;
    private ideatorMaxTokens;
    generateIdeas(input: CatalogIdeatorInput): Promise<CatalogIdeatorResult>;
    private buildLocalResult;
    private mergeWithLocal;
    private generateIdeasFromLlm;
    private mergeUniqueIdeas;
    private normTitle;
    private resolveSlotType;
    private archetypeIndex;
    private fillSlotsFromArchetype;
    private buildDirectedSlots;
    private normalizeSlots;
    private padSlotsToDesiredCount;
    private normalize;
}

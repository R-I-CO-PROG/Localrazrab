import { ConfigService } from '@nestjs/config';
import { LlmBriefService } from '../providers/llm/llm-brief.service';
import { LlmProviderFactory } from '../providers/llm/llm.provider';
import type { Concept, CatalogIdeatorOutput, CriticOutput } from './contracts';
import type { AgentBriefContext } from './brief-context.util';
import { CatalogIdeatorAgent } from './catalog-ideator.agent';
import { CatalogCriticAgent } from './catalog-critic.agent';
import type { AgentDebugTraceFn } from './agent-debug.types';
import type { GenerationHistory } from './previous-generation.util';
import { OpenrouterAgentClient } from './openrouter-agent.client';
export interface CatalogDiscoverResult {
    concepts: Concept[];
    ideatorOutput?: CatalogIdeatorOutput;
    criticOutput?: CriticOutput;
    pipeline: 'ideator_critic' | 'legacy_llm' | 'fallback';
    timingMs?: number;
    timingStages?: Record<string, number>;
}
export declare class CatalogConceptService {
    private readonly llmBrief;
    private readonly llmFactory;
    private readonly config;
    private readonly catalogIdeator;
    private readonly catalogCritic;
    private readonly openrouter;
    private readonly logger;
    constructor(llmBrief: LlmBriefService, llmFactory: LlmProviderFactory, config: ConfigService, catalogIdeator: CatalogIdeatorAgent, catalogCritic: CatalogCriticAgent, openrouter: OpenrouterAgentClient);
    private targetConceptCount;
    discoverConcepts(briefInput: AgentBriefContext, request: {
        userPrompt: string;
        category: string;
        budgetMin: number | null;
        budgetMax: number | null;
        quantity: number | null;
        setItemCount?: number | null;
        useProductCountLimit?: boolean | null;
        minProductsPerSet?: number | null;
        maxProductsPerSet?: number | null;
        colors: unknown;
        allowedItems: unknown;
        forbiddenItems: unknown;
        blacklistedProductIds?: unknown;
        blacklistedSupplierIds?: unknown;
        assets: Array<{
            type: string;
            url?: string;
        }>;
    }, options?: {
        trace?: AgentDebugTraceFn;
        generationHistory?: GenerationHistory | null;
    }): Promise<CatalogDiscoverResult>;
    private resolveSetItemCount;
    private normalizeHexColors;
    private callLegacyCatalogConceptsLlm;
    private buildFallbackConcepts;
    private toConcept;
    private gatherConceptCandidates;
    private fixSetCohesion;
    private refillEmptyConceptProducts;
    private mapProductsToConcept;
}

import { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { LlmProviderFactory } from './llm.provider';
import { LlmGenerationInput, LlmGenerationOutput, LlmInterpretMode } from './llm.interface';
import { buildLlmUserPayload } from './llm-prompts';
import { CatalogProduct } from './catalog.util';
import { type CatalogFilterInput } from './catalog-filter.util';
import { type CatalogPipelineResult } from './catalog-index.util';
import type { CatalogPipelineTiming } from './catalog-pipeline-timing.util';
import { type ParsedBriefResult } from '../../requests/parse-brief.util';
export interface BriefInterpretResult {
    output: LlmGenerationOutput;
    products: CatalogProduct[];
    provider: string;
    modelUsed: string | null;
    usedFallback: boolean;
    error: string | null;
    userPayload: ReturnType<typeof buildLlmUserPayload>;
}
export declare class LlmBriefService implements OnModuleInit {
    private readonly config;
    private readonly prisma;
    private readonly llmFactory;
    private readonly logger;
    private catalogCache;
    private readonly catalogCacheTtlMs;
    constructor(config: ConfigService, prisma: PrismaService, llmFactory: LlmProviderFactory);
    onModuleInit(): void;
    private warmCatalogCache;
    prepareCatalogPipeline(input: CatalogFilterInput, stratifiedMax?: number, timing?: CatalogPipelineTiming): Promise<CatalogPipelineResult>;
    isRealLlmEnabled(): boolean;
    private mapProductRow;
    loadProductsByIds(ids: string[]): Promise<CatalogProduct[]>;
    loadFullCatalog(): Promise<CatalogProduct[]>;
    loadCatalog(allowedItems: string[], forbiddenItems: string[]): Promise<CatalogProduct[]>;
    buildInput(params: {
        userPrompt: string;
        category: string;
        quantity?: number | null;
        budgetMin?: number | null;
        budgetMax?: number | null;
        colors: string[];
        allowedItems: string[];
        forbiddenItems: string[];
        productNames: string[];
        catalog: CatalogProduct[];
        hasLogo?: boolean;
        logoUrl?: string | null;
        notes?: string | null;
        sceneOnly?: boolean;
        creativeMode?: boolean;
        catalogConceptsMode?: boolean;
        productAddMode?: boolean;
        desiredItemCount?: number;
        mandatoryConceptTypes?: string[];
    }): LlmGenerationInput;
    parseBriefFromPrompt(userPrompt: string): Promise<ParsedBriefResult & {
        source: string;
    }>;
    private mapLlmBriefParseOutput;
    interpretForSuggest(input: LlmGenerationInput, eligibleCatalog?: CatalogProduct[]): Promise<BriefInterpretResult>;
    interpretForProductAdd(input: LlmGenerationInput, eligibleCatalog?: CatalogProduct[]): Promise<BriefInterpretResult>;
    interpretForGeneration(input: LlmGenerationInput, eligibleCatalog?: CatalogProduct[]): Promise<BriefInterpretResult>;
    interpret(input: LlmGenerationInput, eligibleCatalog?: CatalogProduct[], options?: {
        mode?: LlmInterpretMode;
    }): Promise<BriefInterpretResult>;
    getSystemPrompt(respectUserProducts: boolean, creativeMode?: boolean): string;
    getUserMessage(userPayload: ReturnType<typeof buildLlmUserPayload>): string;
}

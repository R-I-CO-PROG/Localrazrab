import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { LlmProviderFactory } from '../providers/llm/llm.provider';
import { ImageProviderFactory } from '../providers/image/image.provider';
import { LlmBriefService } from '../providers/llm/llm-brief.service';
import { ConceptPromptService } from '../agents/concept-prompt.service';
import { OpenrouterImageProvider } from '../providers/image/openrouter-image.provider';
export declare class GenerationProcessor implements OnModuleInit, OnModuleDestroy {
    private readonly config;
    private readonly prisma;
    private readonly llmFactory;
    private readonly llmBrief;
    private readonly imageFactory;
    private readonly conceptPrompt;
    private readonly openrouter;
    private readonly logger;
    private worker;
    constructor(config: ConfigService, prisma: PrismaService, llmFactory: LlmProviderFactory, llmBrief: LlmBriefService, imageFactory: ImageProviderFactory, conceptPrompt: ConceptPromptService, openrouter: OpenrouterImageProvider);
    onModuleInit(): void;
    onModuleDestroy(): Promise<void>;
    private buildLlmInput;
    private process;
    private processRefine;
}

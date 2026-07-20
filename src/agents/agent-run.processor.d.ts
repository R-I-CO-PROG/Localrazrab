import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { IdeatorAgent } from './ideator.agent';
import { CriticAgent } from './critic.agent';
import { ConceptPreviewService } from './concept-preview.service';
import { AgentDebugService } from './agent-debug.service';
import { CatalogConceptService } from './catalog-concept.service';
export declare class AgentRunProcessor implements OnModuleInit, OnModuleDestroy {
    private readonly config;
    private readonly prisma;
    private readonly ideator;
    private readonly critic;
    private readonly conceptPreview;
    private readonly catalogConcepts;
    private readonly agentDebug;
    private readonly logger;
    private worker;
    constructor(config: ConfigService, prisma: PrismaService, ideator: IdeatorAgent, critic: CriticAgent, conceptPreview: ConceptPreviewService, catalogConcepts: CatalogConceptService, agentDebug: AgentDebugService);
    onModuleInit(): void;
    onModuleDestroy(): Promise<void>;
    private process;
    private buildBriefInput;
    private setStep;
}

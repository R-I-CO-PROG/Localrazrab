import { PrismaService } from '../prisma/prisma.service';
import { PromptBuilderAgent } from './prompt-builder.agent';
import type { Concept, PromptBuilderOutput } from './contracts';
import type { AgentDebugTraceFn } from './agent-debug.types';
export declare class ConceptPromptService {
    private readonly prisma;
    private readonly promptBuilder;
    constructor(prisma: PrismaService, promptBuilder: PromptBuilderAgent);
    buildPromptForGeneration(requestId: string, chosenIdeaTitle: string, trace?: AgentDebugTraceFn): Promise<{
        promptOutput: PromptBuilderOutput;
        concept: Concept;
    }>;
}

import { OpenrouterAgentClient } from './openrouter-agent.client';
import type { CriticTopIdea, IdeatorIdea, PromptBuilderOutput, Concept } from './contracts';
import type { AgentDebugTraceFn } from './agent-debug.types';
export declare class PromptBuilderAgent {
    private readonly openrouter;
    private readonly logger;
    constructor(openrouter: OpenrouterAgentClient);
    buildPrompt(input: {
        userQuery: string;
        chosenIdea: IdeatorIdea | CriticTopIdea | Concept | {
            title: string;
            description?: string;
        };
        category?: string;
        budgetMin?: number | null;
        budgetMax?: number | null;
        quantity?: number | null;
        colors?: string[];
        allowedItems?: string[];
        forbiddenItems?: string[];
        notes?: string | null;
        hasLogo?: boolean;
        trace?: AgentDebugTraceFn;
    }): Promise<PromptBuilderOutput>;
    private normalize;
}

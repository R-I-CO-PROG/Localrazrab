import { OpenrouterAgentClient } from './openrouter-agent.client';
import { AgentBriefContext } from './brief-context.util';
import type { CatalogIdeatorIdea, CriticOutput } from './contracts';
import type { AgentDebugTraceFn } from './agent-debug.types';
export declare class CatalogCriticAgent {
    private readonly openrouter;
    private readonly logger;
    constructor(openrouter: OpenrouterAgentClient);
    pickTop5(ideas: CatalogIdeatorIdea[], brief: AgentBriefContext & {
        desiredItemCount: number;
        budgetPerSet: number | null;
        mandatoryTypes: string[];
    }, trace?: AgentDebugTraceFn): Promise<CriticOutput>;
    private normalize;
    private violatesForbidden;
    private supplementToFive;
}

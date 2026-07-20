import { OpenrouterAgentClient } from './openrouter-agent.client';
import { AgentBriefContext } from './brief-context.util';
import type { CriticOutput, IdeatorIdea } from './contracts';
import type { AgentDebugTraceFn } from './agent-debug.types';
export declare class CriticAgent {
    private readonly openrouter;
    private readonly logger;
    constructor(openrouter: OpenrouterAgentClient);
    pickTop5(ideas: IdeatorIdea[], brief: AgentBriefContext, trace?: AgentDebugTraceFn): Promise<CriticOutput>;
    private normalize;
    private violatesForbidden;
    private supplementToFive;
}

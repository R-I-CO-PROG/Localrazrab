import { OpenrouterAgentClient } from './openrouter-agent.client';
import { AgentBriefContext } from './brief-context.util';
import { IdeatorOutput } from './contracts';
import type { AgentDebugTraceFn } from './agent-debug.types';
export type IdeatorResult = IdeatorOutput & {
    usedFallback: boolean;
    fallbackReason?: string;
};
export declare class IdeatorAgent {
    private readonly openrouter;
    private readonly logger;
    constructor(openrouter: OpenrouterAgentClient);
    generateIdeas(input: AgentBriefContext & {
        trace?: AgentDebugTraceFn;
    }): Promise<IdeatorResult>;
    private mergeUniqueIdeas;
    private normTitle;
    private normalize;
    private isBlacklisted;
}

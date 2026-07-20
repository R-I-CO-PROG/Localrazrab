import { OpenrouterAgentClient } from './openrouter-agent.client';
import type { RouterOutput } from './contracts';
import type { AgentDebugTraceFn } from './agent-debug.types';
export declare class RouterAgent {
    private readonly openrouter;
    private readonly logger;
    constructor(openrouter: OpenrouterAgentClient);
    route(input: {
        userQuery: string;
        category?: string;
        selectedProductNames?: string[];
        catalogCategories?: string[];
        trace?: AgentDebugTraceFn;
    }): Promise<RouterOutput>;
    ruleBasedRoute(userQuery: string): RouterOutput;
    private extractColors;
    private normalize;
}

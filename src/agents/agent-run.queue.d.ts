import type { GenerationHistory } from './previous-generation.util';
export declare const AGENT_RUN_QUEUE = "agent-run";
export type AgentRunJobData = {
    agentRunId: string;
    requestId: string;
    debug?: boolean;
    aiStyle?: 'catalog' | 'creative';
    generationHistory?: GenerationHistory | null;
};
export declare function isAgentsEnabled(config: {
    get: (k: string, d?: string) => string | undefined;
}): boolean;
export declare function isCreativeAgentPipelineEnabled(config: {
    get: (k: string, d?: string) => string | undefined;
}): boolean;

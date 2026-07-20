import { ConfigService } from '@nestjs/config';
import { AgentDebugTraceFn } from './agent-debug.types';
export interface AgentChatOptions {
    systemPrompt: string;
    userMessage: string;
    modelEnvKey: string;
    maxTokensEnvKey: string;
    defaultMaxTokens: number;
    agentName?: string;
    trace?: AgentDebugTraceFn;
}
export declare class OpenrouterAgentClient {
    private readonly config;
    private readonly logger;
    constructor(config: ConfigService);
    isEnabled(): boolean;
    private resolveModels;
    private getApiKey;
    chatJson(opts: AgentChatOptions): Promise<string>;
    private callOnce;
}

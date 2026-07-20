import { ConfigService } from '@nestjs/config';
import { LlmProvider } from './llm.interface';
import { StubLlmProvider } from './stub-llm.provider';
import { DeepseekLlmProvider } from './deepseek-llm.provider';
import { GeminiLlmProvider } from './gemini-llm.provider';
import { OpenrouterLlmProvider } from './openrouter-llm.provider';
export declare const LLM_PROVIDER = "LLM_PROVIDER";
export declare class LlmProviderFactory {
    private readonly config;
    private readonly stub;
    private readonly deepseek;
    private readonly gemini;
    private readonly openrouter;
    private readonly logger;
    constructor(config: ConfigService, stub: StubLlmProvider, deepseek: DeepseekLlmProvider, gemini: GeminiLlmProvider, openrouter: OpenrouterLlmProvider);
    getProvider(): LlmProvider;
    getEffectiveProviderName(): string;
    getStubProvider(): StubLlmProvider;
    private resolveNamedProvider;
    getGenerationProviderChain(): Array<{
        name: string;
        provider: LlmProvider;
    }>;
    getGenerationProvider(): LlmProvider;
    getGenerationProviderName(): string;
    getBriefParseProviderChain(): Array<{
        name: string;
        provider: LlmProvider;
    }>;
    getProviderName(): string;
}

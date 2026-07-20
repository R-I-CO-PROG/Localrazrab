import { ConfigService } from '@nestjs/config';
import { LlmProvider, LlmGenerationInput, LlmGenerationOutput } from './llm.interface';
export declare class OpenrouterLlmProvider implements LlmProvider {
    private readonly config;
    private readonly logger;
    lastModelUsed: string | null;
    constructor(config: ConfigService);
    private resolveModels;
    generate(input: LlmGenerationInput): Promise<LlmGenerationOutput>;
    private extractContent;
    private callModel;
}

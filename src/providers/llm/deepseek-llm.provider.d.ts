import { ConfigService } from '@nestjs/config';
import { LlmProvider, LlmGenerationInput, LlmGenerationOutput } from './llm.interface';
export declare class DeepseekLlmProvider implements LlmProvider {
    private readonly config;
    private readonly logger;
    constructor(config: ConfigService);
    generate(input: LlmGenerationInput): Promise<LlmGenerationOutput>;
}

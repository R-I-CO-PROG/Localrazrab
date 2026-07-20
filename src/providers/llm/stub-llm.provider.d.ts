import { LlmProvider, LlmGenerationInput, LlmGenerationOutput } from './llm.interface';
export declare class StubLlmProvider implements LlmProvider {
    generate(input: LlmGenerationInput): Promise<LlmGenerationOutput>;
}

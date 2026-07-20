import { LlmGenerationOutput } from '../providers/llm/llm.interface';
import { GenerationSnapshot } from './prompt-builder';
import type { IdeatorItem } from '../agents/contracts';
export declare function buildAiImagePrompt(llmOutput: LlmGenerationOutput, snapshot: GenerationSnapshot & {
    userPrompt?: string;
}, logoHint?: string, usedRealLlm?: boolean): string;
export declare function buildCreativeAiImagePrompt(llmOutput: LlmGenerationOutput, snapshot: GenerationSnapshot & {
    userPrompt?: string;
}, logoHint?: string, usedRealLlm?: boolean, sceneBrief?: string, options?: {
    deferLogoToPostComposite?: boolean;
    conceptItems?: IdeatorItem[];
}): string;
export declare function buildCreativeAiNegativePrompt(llmOutput: LlmGenerationOutput, snapshot: GenerationSnapshot, usedRealLlm?: boolean, options?: {
    deferLogoToPostComposite?: boolean;
}): string;
export declare function buildAiNegativePrompt(llmOutput: LlmGenerationOutput, snapshot: GenerationSnapshot, usedRealLlm?: boolean): string;

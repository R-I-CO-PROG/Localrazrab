import { GenerationSnapshot } from './prompt-builder';
export declare function buildAiRenderPrompt(snapshot: GenerationSnapshot & {
    userPrompt?: string;
}, logoHint?: string): string;
export declare function buildAiRenderNegative(snapshot: GenerationSnapshot): string;
export declare function buildAiScenePrompt(snapshot: GenerationSnapshot & {
    userPrompt?: string;
}): string;
export declare function buildAiBrandingPassPrompt(snapshot: GenerationSnapshot & {
    userPrompt?: string;
}, logoHint: string): string;
export declare function buildAiBrandedSinglePassPrompt(snapshot: GenerationSnapshot & {
    userPrompt?: string;
}, logoHint: string): string;
export declare function buildAiSceneNegative(snapshot: GenerationSnapshot): string;
export declare function buildAiBrandingNegative(snapshot: GenerationSnapshot): string;
export declare const buildAiStudioPrompt: typeof buildAiScenePrompt;
export declare const buildAiStudioNegative: typeof buildAiSceneNegative;
export declare const buildAiEnhancePrompt: typeof buildAiBrandedSinglePassPrompt;
export declare const buildAiEnhanceNegative: typeof buildAiBrandingNegative;

import { GenerationSnapshot } from './prompt-builder';
export declare function buildHfFluxPrompt(snapshot: GenerationSnapshot & {
    userPrompt?: string;
}, scenePrompt?: string): string;

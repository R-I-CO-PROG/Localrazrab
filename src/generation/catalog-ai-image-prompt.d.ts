import { LlmGenerationOutput } from '../providers/llm/llm.interface';
import { GenerationSnapshot } from './prompt-builder';
import { type CatalogProductColorSpec } from './catalog-product-color-rules.util';
export declare const CATALOG_PREMIUM_GIFT_BOX_SCENE = "Premium corporate welcome gift box with lid open, photographed from above at a slight angle. Matte black or charcoal rigid presentation box with custom-fit inner compartments and dividers \u2014 every product nestled in its own slot, neatly folded or standing, like a luxury B2B unboxing. Soft diffused studio lighting, subtle shadows, tactile fabric and material detail, cohesive monochrome palette, high-end gift-set catalog photography.";
export declare function inferCatalogSceneEnvironment(brief?: string, composition?: string, style?: string): string;
export declare function buildCatalogAiImagePrompt(llmOutput: LlmGenerationOutput, snapshot: GenerationSnapshot & {
    userPrompt?: string;
}, logoHint?: string, usedRealLlm?: boolean, colorSpecs?: CatalogProductColorSpec[], sceneBrief?: string, options?: {
    deferLogoToPostComposite?: boolean;
}): string;
export declare function buildCatalogAiNegativePrompt(llmOutput: LlmGenerationOutput, snapshot: GenerationSnapshot, usedRealLlm?: boolean, options?: {
    deferLogoToPostComposite?: boolean;
}): string;

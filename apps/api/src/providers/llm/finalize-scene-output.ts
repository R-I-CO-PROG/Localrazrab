import { LlmGenerationOutput } from './llm.interface';
import { enforceBrandColorsInPrompt } from '../../generation/brand-colors.util';

export function finalizeSceneLlmOutput(
  output: LlmGenerationOutput,
  colors: string[],
): LlmGenerationOutput {
  return {
    ...output,
    image_prompt: enforceBrandColorsInPrompt(output.image_prompt ?? '', colors),
  };
}

/** Каталожная сцена: цвета SKU по правилам каталога */
export function finalizeCatalogSceneLlmOutput(output: LlmGenerationOutput): LlmGenerationOutput {
  const catalogRules =
    'Catalog color rule: match reference photo OR recolor only to a color explicitly listed for that SKU in the catalog. Never use brand palette or unlisted colors. One cohesive lifestyle environment scene — not white background cutouts.';

  const cleaned = (output.image_prompt ?? '')
    .replace(/assign each brand_colors_hex[^.]*\./gi, '')
    .replace(/MUST assign each brand[^.]*\./gi, '')
    .replace(/Recolor each product[^.]*\./gi, '')
    .replace(/Each product body in its assigned brand color[^.]*\./gi, '')
    .replace(/brand_colors_hex is MANDATORY[^.]*\./gi, '')
    .trim();

  const image_prompt = [catalogRules, cleaned].filter(Boolean).join(' ').slice(0, 600);

  const negative_prompt = [
    output.negative_prompt ?? '',
    'white background, isolated cutout, unlisted color recolor, brand palette recolor, wrong product colors, catalog grid, product collage',
  ]
    .filter(Boolean)
    .join(', ');

  return { ...output, image_prompt, negative_prompt };
}

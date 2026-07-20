import { Injectable } from '@nestjs/common';
import { LlmProvider, LlmGenerationInput, LlmGenerationOutput } from './llm.interface';
import { stubPickProductsFromBrief } from './catalog.util';
import { defaultItemCount } from './parse-desired-count';
import { shouldRespectUserProducts } from './respect-user-products';

@Injectable()
export class StubLlmProvider implements LlmProvider {
  async generate(input: LlmGenerationInput): Promise<LlmGenerationOutput> {
    const catalog = input.catalogProducts ?? [];
    const count = input.desiredItemCount ?? defaultItemCount(input.userPrompt);
    const respectUser = shouldRespectUserProducts(input);

    const items =
      respectUser || input.sceneOnly
        ? input.productNames
        : catalog.length > 0
          ? stubPickProductsFromBrief(catalog, input.userPrompt, input.category, count).map(
              (p) => p.name,
            )
          : input.productNames;

    const colorHint =
      input.colors.length > 0
        ? `brand palette ${input.colors.join(' and ')}`
        : 'dark corporate neutrals';
    const briefHint = input.userPrompt.trim().slice(0, 120);
    const themeHint = `${input.category}${input.quantity ? ` for ${input.quantity} units` : ''}`;

    return {
      items,
      composition: `Концепция «${input.category}»: ${items.join(', ')}${input.quantity ? ` · тираж ${input.quantity} шт.` : ''}. ${briefHint || 'Корпоративный набор под бренд.'}`,
      style: briefHint.toLowerCase().includes('премиум') || briefHint.toLowerCase().includes('premium')
        ? 'Премиальный каталожный'
        : briefHint.toLowerCase().includes('скейт') ||
            briefHint.toLowerCase().includes('скеит') ||
            briefHint.toLowerCase().includes('skater') ||
            briefHint.toLowerCase().includes('street')
          ? 'Скейт / streetwear'
          : briefHint.toLowerCase().includes('минимал') || briefHint.toLowerCase().includes('tech')
            ? 'Минималистичный tech'
            : 'Современный корпоративный',
      image_prompt: [
        'Ultra photorealistic branded merchandise studio photography, 8k.',
        `Exactly ${items.length} item(s), no extras: ${items.join(', ')}.`,
        `${themeHint}. Dominant ${colorHint} — tinted studio lighting, subtle color wash on background and product accents.`,
        'Thematic product arrangement matching brief mood, not a random generic lineup.',
        'Realistic materials, soft directional light with brand-colored rim light, natural shadows.',
        input.hasLogo
          ? 'Client logo as realistic print or engraving on each item surface.'
          : 'Clean merchandise surfaces ready for branding.',
        briefHint ? `Creative direction: ${briefHint}.` : '',
        'No people, no hands, no watermark.',
      ]
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 450),
      negative_prompt:
        'blurry, missing items, extra objects, wrong count, text overlay, watermark, people, hands, distorted logo, low quality, cartoon',
    };
  }
}

import { GenerationSnapshot } from './prompt-builder';
import { describeProductEn } from './product-visual-en.util';
import {
  assignBrandColorsToProducts,
  colorizeProductDescription,
  enforceBrandColorsInPrompt,
  formatBrandPalettePrompt,
  formatPerProductColorAssignments,
} from './brand-colors.util';

/** Короткий промпт для FLUX txt2img (HF лимит ~480 символов) */
export function buildHfFluxPrompt(
  snapshot: GenerationSnapshot & { userPrompt?: string },
  scenePrompt?: string,
): string {
  const names = snapshot.productNames ?? [];
  const count = names.length;
  const assigned = assignBrandColorsToProducts(snapshot.colors, count);
  const itemsEn = names
    .map((n, i) => colorizeProductDescription(describeProductEn(n), assigned[i]))
    .join(', ');
  const brief = snapshot.userPrompt?.trim().slice(0, 60);
  const palette = formatBrandPalettePrompt(snapshot.colors);
  const perProduct = formatPerProductColorAssignments(names, snapshot.colors);

  const parts = [
    palette,
    perProduct,
    'Ultra photorealistic corporate merchandise product photo, 8k studio.',
    count > 0 ? `Exactly ${count} items: ${itemsEn}.` : 'Corporate branded gift set.',
    'Each product in assigned brand color; soft directional studio lighting, realistic materials.',
    brief ? `Mood: ${brief}.` : '',
  ];

  if (scenePrompt?.trim()) {
    parts.push(enforceBrandColorsInPrompt(scenePrompt.trim(), snapshot.colors).slice(0, 180));
  }

  return parts
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 480);
}

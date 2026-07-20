import { LlmGenerationOutput } from '../providers/llm/llm.interface';
import { formatBrandPalettePrompt } from './brand-colors.util';
import {
  buildLogoApplicationPrompt,
  stripBlankLogoPhrases,
} from './product-logo-branding.util';

export interface GenerationSnapshot {
  userPrompt?: string;
  category?: string;
  quantity?: number | null;
  colors?: string[];
  productNames?: string[];
  logoUrl?: string | null;
  hasLogo?: boolean;
}

/** Промпт для фотореалистичного мокапа набора (как на референсе) */
export function buildProductMockupPrompt(
  llmOutput: LlmGenerationOutput,
  snapshot: GenerationSnapshot,
): string {
  const products = snapshot.productNames ?? llmOutput.items ?? [];
  const productListEn = products.join(', ');
  const colorList = (snapshot.colors ?? []).join(', ');
  const category = snapshot.category ?? 'Welcome Pack';
  const styleHint = llmOutput.style || 'minimal tech corporate';

  const palette = formatBrandPalettePrompt(snapshot.colors);
  const logoPart = buildLogoApplicationPrompt(products, { hasLogo: snapshot.hasLogo });
  const llmScene = snapshot.hasLogo
    ? stripBlankLogoPhrases(llmOutput.image_prompt?.trim() ?? '')
    : llmOutput.image_prompt?.trim() ?? '';

  const parts = [
    'Professional 3D product photography, corporate gift set mockup, premium catalog shot.',
    `Theme: ${category}, style ${styleHint}.`,
    productListEn
      ? `The set includes exactly these items arranged together in one frame: ${productListEn}.`
      : llmScene,
    palette || (colorList ? `Dominant brand colors: ${colorList}, matte finishes.` : ''),
    logoPart,
    'Moody studio lighting, soft shadows, dark charcoal gradient background, photorealistic, sharp focus, 8k commercial product render.',
    'Flat lay composition, all items visible, no people, no extra props, no text overlay, no watermark.',
    llmScene,
  ];

  return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().slice(0, 1200);
}

/** Короткий промпт для Stable Horde / Pollinations — меньше очередь, стабильнее API */
export function buildCompactImagePrompt(
  llmOutput: LlmGenerationOutput,
  snapshot: GenerationSnapshot,
): string {
  const products = snapshot.productNames ?? llmOutput.items ?? [];
  const productList = products.join(', ');
  const colors = (snapshot.colors ?? []).slice(0, 3).join(', ');
  const category = snapshot.category ?? 'Welcome Pack';
  const logoHint = snapshot.hasLogo
    ? buildLogoApplicationPrompt(products, { hasLogo: true }).slice(0, 120) + ','
    : 'unbranded corporate merchandise,';

  const core = llmOutput.image_prompt?.trim() || `corporate gift set: ${productList}`;

  return [
    'Photorealistic product mockup, studio shot, dark gradient background,',
    logoHint,
    `items: ${productList}.`,
    colors ? `Colors: ${colors}.` : '',
    `${category} set.`,
    core,
  ]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}

/** @deprecated alias */
export const buildPollinationsPrompt = buildProductMockupPrompt;

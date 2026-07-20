import { getImprintMethod, type ImprintMethodCode } from './imprint-methods';

export interface PrecisionPromptImprint {
  methodCode: ImprintMethodCode;
  colorCount: number;
  sizeMm?: { w: number; h: number };
  zoneNameRu?: string | null;
  /** Что наносим: 'client logo' | 'the text "ACME"' */
  contentDescription: string;
}

export interface PrecisionPromptInput {
  outputMode: 'edit' | 'studio';
  productNameRu: string;
  materialRu?: string | null;
  productDimsCm?: { widthCm?: number | null; heightCm?: number | null; depthCm?: number | null } | null;
  imprints: PrecisionPromptImprint[];
}

/** Преамбулы перед каждым референсом. Порядок отправки: source, draft, art, zone. */
export const PRECISION_REF_PREAMBLES = {
  source:
    'REFERENCE 1 — THE ORIGINAL PRODUCT PHOTO. Preserve it exactly: same product shape, proportions, color, material, camera angle, framing, background and lighting. This is the photo you are editing.',
  draft:
    'REFERENCE 2 — POSITIONING GUIDE. It shows the product with each imprint pasted flat exactly where it must go. This is the SINGLE SOURCE OF TRUTH for WHERE each imprint sits, how big it is and its rotation: the final imprint must land on the product surface at exactly this spot and size — never moved, never resized to fill the frame, never relocated to the background, a corner, or below/beside the product. The flat pasted look itself is NOT the desired appearance — re-render that mark as a real, physically applied imprint that follows the surface.',
  art: 'REFERENCE 3 — THE ARTWORK MASTER. Reproduce this exact mark: exact shapes, exact proportions, exact letterforms. Never invent a different emblem.',
  zone: 'REFERENCE 4 — SUPPLIER IMPRINT-AREA DIAGRAM. It shows the area of the product where branding is technically allowed.',
} as const;

function buildNegativePrompt(input: PrecisionPromptInput): string {
  // Two or more imprints may legitimately share the same content (e.g. the
  // same logo on the front and back of a product). In that case the positive
  // prompt intentionally repeats "Imprint N: client logo..." for each zone,
  // so banning "duplicate logo copies" in the negative prompt would directly
  // contradict the request. Only include that ban when nothing is repeated.
  const hasRepeatedContent =
    new Set(input.imprints.map((i) => i.contentDescription)).size < input.imprints.length;

  return [
    'flat pasted logo overlay',
    'sticker on the product',
    'photoshop logo stamp',
    'floating logo',
    'watermark',
    'white rectangle behind logo',
    'black square behind logo',
    'semi-transparent logo',
    // Частая ошибка для ТЕКСТА: крупная подпись/ярлык под товаром или на фоне
    'text as a caption',
    'text label below the product',
    'floating text on the background',
    'large brand title text',
    'imprint on the background',
    'imprint beside or below the product',
    'imprint not on the product surface',
    'oversized imprint filling the frame',
    ...(hasRepeatedContent ? [] : ['duplicate logo copies']),
    'changed product shape',
    'changed product color',
    'different camera angle',
    'blurry imprint',
    'unreadable logo',
  ].join(', ');
}

/** true, если содержимое — текст (contentDescription формата `the text "..."`) */
function isTextContent(contentDescription: string): boolean {
  return /^the text\b/i.test(contentDescription.trim());
}

function colorClause(imp: PrecisionPromptImprint): string {
  const method = getImprintMethod(imp.methodCode);
  if (method.colorMode === 'mono') return 'rendered in a single tone';
  if (method.colorMode === 'relief') return 'rendered with no pigment at all, only relief';
  if (method.colorMode === 'foil') return 'rendered in metallic foil';
  if (method.colorMode === 'full') return 'rendered in full color';
  return `rendered in ${imp.colorCount} spot ${imp.colorCount === 1 ? 'color' : 'colors'}`;
}

function productScaleClause(input: PrecisionPromptInput): string {
  const d = input.productDimsCm;
  if (!d) return '';
  const parts = [d.widthCm, d.heightCm, d.depthCm].filter((x): x is number => typeof x === 'number');
  if (parts.length === 0) return '';
  return ` The product measures about ${parts.join('×')} cm, so judge the imprint scale against it.`;
}

function imprintLine(imp: PrecisionPromptImprint, index: number): string {
  const method = getImprintMethod(imp.methodCode);
  const zone = imp.zoneNameRu?.trim() ? ` in the zone «${imp.zoneNameRu.trim()}»` : '';
  const size = imp.sizeMm ? `, physical size ${imp.sizeMm.w}×${imp.sizeMm.h} mm` : '';
  // Для текста добавляем явное указание: это маленький физический оттиск, а не подпись
  const textGuard = isTextContent(imp.contentDescription)
    ? ' This is a small text mark physically applied onto the product surface at the exact spot marked in reference 2 — it sits on the product and follows its curvature; it is NOT a caption, title, product label or floating text and must not be enlarged.'
    : '';
  return [
    `Imprint ${index + 1}: ${imp.contentDescription}${zone}${size}, placed exactly where reference 2 marks it, on the product surface.`,
    `Applied by ${method.labelRu} (${imp.methodCode}), ${colorClause(imp)}.`,
    `It must look like ${method.physicsEn}.${textGuard}`,
  ].join(' ');
}

export function buildPrecisionImprintPrompt(input: PrecisionPromptInput): {
  prompt: string;
  negativePrompt: string;
} {
  const n = input.imprints.length;
  const material = input.materialRu?.trim() ? ` The product surface is ${input.materialRu.trim()}.` : '';

  const framing =
    input.outputMode === 'edit'
      ? 'Edit reference 1 in place. Do not change the background, do not change the lighting, keep an identical camera angle, framing and product geometry. Only the imprints are added.'
      : 'Re-photograph the same product in a clean professional studio scene: replace ONLY the background with a neutral seamless studio backdrop and relight with soft directional light. Keep the same product with its shape, proportions, colour, material, orientation, size and position in the frame identical to reference 1, so every imprint stays at the exact same spot on the product as marked in reference 2.';

  const prompt = [
    `Photorealistic product photography of ${input.productNameRu}.${material}${productScaleClause(input)}`,
    framing,
    `Apply exactly ${n} ${n === 1 ? 'imprint' : 'imprints'}, each at the EXACT position, size and rotation marked in reference 2, directly on the product surface. Never add any mark on the background, in a corner, or below/beside the product, and never render an imprint as a caption, title or floating label. No extra marks anywhere in the frame.`,
    input.imprints.map(imprintLine).join(' '),
    'Every imprint must follow the surface curvature, perspective, occlusion and the scene lighting of reference 1, with the physical depth and finish of its production method, and must sit only on the product surface.',
    'The result must look like a real branded item photographed on set, never like a graphic pasted on top of a photo.',
  ]
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  return { prompt, negativePrompt: buildNegativePrompt(input) };
}

const SCENE_VARIATIONS = [
  'a different camera angle and tighter framing',
  'a fresh top-down flat-lay composition',
  'a three-quarter hero angle with softer directional light',
  'a re-arranged layout with more depth and a different background',
  'a wider editorial composition with generous negative space',
];

export function buildRefinementImagePrompt(opts: {
  refinementBrief: string;
  userPrompt?: string;
  composition?: string;
  productNames?: string[];
  hasLogo?: boolean;
  isCatalog?: boolean;
  /** true → полностью НОВАЯ композиция (кнопка «Пересоздать» без точечной правки). */
  wantsNewComposition?: boolean;
  /** индекс попытки — для вариативности между пересозданиями. */
  variationIndex?: number;
}): string {
  const brief = opts.refinementBrief.trim();
  const variation =
    SCENE_VARIATIONS[(opts.variationIndex ?? 0) % SCENE_VARIATIONS.length];

  // Абсолютная верность товаров — иначе при пересоздании зарядка «менялась на другую»,
  // менялся материал сумки, блокноту «дорисовывались кольца».
  const productLock = opts.productNames?.length
    ? `The set contains EXACTLY these products: ${opts.productNames.join(', ')}. Each product MUST stay 100% IDENTICAL to its reference photo — the same exact item, model, shape, proportions, material, texture and color. Do NOT swap any product for a different one, do NOT change its material, and do NOT add or remove any detail (no extra rings, holes, straps, buttons or decorations drawn onto products). Show ONLY these products, nothing else.`
    : 'Keep every product 100% identical to its reference photo — do not swap, alter, or add details to any product.';

  const logoLine = opts.hasLogo
    ? opts.isCatalog
      ? 'Keep the client logo on product surfaces only — no floating logo panels, stickers in air, or duplicate logo cards in the background.'
      : 'Keep the client logo visible on all branded products.'
    : 'Keep every product completely blank and unbranded — do NOT invent or add any logo, brand mark or text.';

  const avoid =
    'Avoid: different or swapped product, altered product material, added or removed product details, decorations or rings drawn onto products, extra unlisted items, distorted or stretched products, watermark, people, hands, text overlay.';

  if (opts.wantsNewComposition) {
    return [
      'Re-arrange the SAME real products into a NEW premium branded-merchandise hero photograph — change ONLY the scene, not the products.',
      brief ? `Client wishes: ${brief}.` : '',
      opts.composition ? `Concept: ${opts.composition.slice(0, 180)}.` : '',
      productLock,
      'The attached reference images (the exact product photos and the previous render) define the exact products — reproduce them faithfully. You may change the arrangement/angle/background/lighting but NOT the products themselves.',
      `Compose a clearly different scene: ${variation}, new lighting and setting, with the exact same items unchanged.`,
      logoLine,
      'Single cohesive premium photorealistic scene.',
      avoid,
    ]
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 2000);
  }

  // Точечная правка: применяем ИМЕННО запрошенное изменение (в т.ч. перестановку), товары не трогаем.
  return [
    'Edit this branded corporate merchandise photograph to apply the client refinement — make the requested change clearly and correctly visible.',
    `Client refinement (apply this exactly): ${brief}.`,
    productLock,
    'The FIRST reference is the current visualization; the others are the exact product photos. Apply the requested change (including moving/re-arranging items if asked) while keeping every product identical to its reference. Everything not mentioned in the refinement stays as in the current visualization.',
    logoLine,
    'Single cohesive premium photorealistic scene.',
    avoid,
  ]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 2000);
}

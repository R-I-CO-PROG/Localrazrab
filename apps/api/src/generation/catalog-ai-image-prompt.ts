import { LlmGenerationOutput } from '../providers/llm/llm.interface';
import { GenerationSnapshot } from './prompt-builder';
import {
  buildCatalogAiLogoReferencePrompt,
  stripBlankLogoPhrases,
  CATALOG_LOGO_NEGATIVE_PROMPT,
  CATALOG_LOGO_INTEGRATION_FOOTER,
} from './product-logo-branding.util';
import {
  type CatalogProductColorSpec,
  formatCatalogColorRulesForPrompt,
  catalogColorNegativePromptAddendum,
} from './catalog-product-color-rules.util';
import { isOversizedType } from '../concept/product-taxonomy';

/** Размер товара для промпта: имя + самое длинное измерение (см) + класс. */
export interface CatalogProductSizeSpec {
  name: string;
  longestCm: number;
  sizeClass: string;
}

/**
 * Правило относительного масштаба с КОНКРЕТНЫМИ размерами: даём модели реальные габариты
 * каждого товара (см), чтобы кружка (~12 см) была заметно меньше рюкзака (~45 см). Без
 * данных (< 2 товаров с размером) — вернём пусто, останется общая фраза про пропорции.
 */
export function formatCatalogSizeRulesForPrompt(sizes: CatalogProductSizeSpec[]): string {
  const known = sizes.filter((s) => s.longestCm > 0);
  if (known.length < 2) return '';
  const list = sizes
    .map((s, i) =>
      s.longestCm > 0
        ? `Product ${i + 1} "${s.name}" ≈ ${Math.round(s.longestCm)} cm`
        : `Product ${i + 1} "${s.name}" (typical size)`,
    )
    .join('; ');
  return (
    `PRODUCT SCALE — real-world longest dimension of each item: ${list}. ` +
    'Render every product at its correct size RELATIVE to the others: an item with a larger cm value MUST look proportionally larger in the scene. ' +
    'Never render a small item (mug, pen, powerbank ~10-15 cm) as large as a big one (backpack, blanket, umbrella ~45-90 cm).'
  );
}

/** Премиальная раскладка без коробки (когда переключатель «в коробке» выключен). */
export const CATALOG_FLAT_LAY_SCENE =
  'Premium editorial flat-lay: all products elegantly arranged directly on a clean neutral styled surface (light wood, linen or matte paper), photographed top-down under soft daylight, generous negative space, cohesive palette, tactile material detail, high-end catalog styling — NO gift box, NO foam insert.';

/**
 * Раскладка каталог-фото: коробка / коробка+крупное рядом / флэт-лей.
 * Крупногабаритные предметы (чемодан/зонт-трость/большой рюкзак) в ложемент не влезают —
 * ставим их рядом с коробкой в правильном масштабе.
 */
function resolveCatalogLayout(giftBox: boolean, hasOversized: boolean): {
  layoutLine: string;
  integrationLine: string;
  useBoxScene: boolean;
  relaxFlatLayNegatives: boolean;
} {
  if (!giftBox) {
    return {
      layoutLine:
        'MANDATORY LAYOUT: premium editorial FLAT LAY — products beautifully and sellably arranged directly on a clean styled surface (NO gift box, NO compartments), top-down, generous negative space, cohesive palette.',
      integrationLine:
        'Products arranged as a cohesive flat-lay with realistic shadows and material contact — NO gift box, NO foam insert.',
      useBoxScene: false,
      relaxFlatLayNegatives: true,
    };
  }
  if (hasOversized) {
    return {
      layoutLine:
        'MANDATORY LAYOUT: small and medium products nested inside an open premium presentation gift box with fitted compartments; oversized items (suitcase, large bag/backpack, cane umbrella) stand UPRIGHT BESIDE the box on the same styled surface, correctly scaled — NEVER crammed inside the box.',
      integrationLine:
        'Small items integrated into fitted box compartments; large items placed next to the box with correct real-world scale, shadows and material contact.',
      useBoxScene: true,
      relaxFlatLayNegatives: true,
    };
  }
  return {
    layoutLine:
      'MANDATORY LAYOUT: all products inside an open premium presentation gift box with custom compartments — NOT scattered on a random surface, NOT a plain flat lay on stone or concrete.',
    integrationLine:
      'Products integrated into fitted box compartments with realistic scale, shadows and material contact.',
    useBoxScene: true,
    relaxFlatLayNegatives: false,
  };
}

/** Премиальная коробка-презентация (референс welcome-pack) */
export const CATALOG_PREMIUM_GIFT_BOX_SCENE =
  'Premium corporate welcome gift box with lid open, photographed from above at a slight angle. Matte black or charcoal rigid presentation box with custom-fit inner compartments and dividers — every product nestled in its own slot, neatly folded or standing, like a luxury B2B unboxing. Soft diffused studio lighting, subtle shadows, tactile fabric and material detail, cohesive monochrome palette, high-end gift-set catalog photography.';

/** Среда для lifestyle-сцены по брифу / composition */
export function inferCatalogSceneEnvironment(
  brief?: string,
  composition?: string,
  style?: string,
): string {
  const text = `${brief ?? ''} ${composition ?? ''} ${style ?? ''}`.toLowerCase();

  if (/пикник|picnic|отдых|активн|outdoor|парк|лужай|grass|travel|поездк/i.test(text)) {
    return 'Outdoor lifestyle scene: picnic on green grass in a park, natural daylight, blanket on grass, products resting naturally on the blanket and grass — full environmental context with depth.';
  }
  if (/офис|desk|рабоч|office|tech|it/i.test(text)) {
    return 'Modern workspace scene: premium open gift box on a wooden desk, soft window light, subtle office background blur, products visible inside fitted compartments.';
  }
  if (/event|мероприят|конференц/i.test(text)) {
    return 'Event-themed premium gift box presentation: open box with fitted compartments on a styled surface, professional commercial photography atmosphere.';
  }

  return CATALOG_PREMIUM_GIFT_BOX_SCENE;
}

export function buildCatalogAiImagePrompt(
  llmOutput: LlmGenerationOutput,
  snapshot: GenerationSnapshot & { userPrompt?: string },
  logoHint?: string,
  usedRealLlm = false,
  colorSpecs: CatalogProductColorSpec[] = [],
  sceneBrief?: string,
  options?: {
    deferLogoToPostComposite?: boolean;
    /** Переключатель «собрать в подарочную коробку (ложемент)». По умолчанию включён. */
    giftBoxEnabled?: boolean;
    /** slug-типы товаров набора — для детекции крупногабарита (чемодан/зонт). */
    productTypes?: string[];
    /** Размеры товаров (см) для правильного относительного масштаба на картинке. */
    productSizes?: CatalogProductSizeSpec[];
  },
): string {
  const deferLogo = Boolean(options?.deferLogoToPostComposite);
  const includeLogo = snapshot.hasLogo && !deferLogo;
  const giftBox = options?.giftBoxEnabled !== false;
  const hasOversized = (options?.productTypes ?? []).some(isOversizedType);
  const layout = resolveCatalogLayout(giftBox, hasOversized);
  const names = snapshot.productNames ?? llmOutput.items ?? [];
  const count = names.length;
  const brief = snapshot.userPrompt?.trim();
  const composition = llmOutput.composition?.trim();
  const style = llmOutput.style?.trim();

  const colorRules = formatCatalogColorRulesForPrompt(colorSpecs);
  const sizeRules = formatCatalogSizeRulesForPrompt(options?.productSizes ?? []);

  const refProducts = names
    .map(
      (name, i) =>
        `Product ${i + 1} "${name}": reproduce EXACTLY from catalog reference image ${i + 1} — identical shape, proportions, design, material and color (ignore stock branding on photo)`,
    )
    .join('. ');

  let sceneDesc: string;
  if (usedRealLlm && llmOutput.image_prompt?.trim().length > 40) {
    const cleaned = llmOutput.image_prompt
      .replace(/assign each brand_colors_hex[^.]*\./gi, '')
      .replace(/MUST assign each brand[^.]*\./gi, '')
      .replace(/Recolor each product[^.]*\./gi, '')
      .replace(/Each product body in its assigned brand color[^.]*\./gi, '')
      .trim();
    // stripBlankLogoPhrases удаляет «unbranded / no logo / blank surface» — это НУЖНО только
    // когда лого ПРИМЕНЯЕТСЯ. Без лого эти фразы защищают от выдуманных логотипов — оставляем.
    sceneDesc = includeLogo ? stripBlankLogoPhrases(cleaned) : cleaned;
  } else {
    sceneDesc = layout.useBoxScene
      ? inferCatalogSceneEnvironment(brief, composition, style)
      : CATALOG_FLAT_LAY_SCENE;
  }

  const logoBlock = includeLogo
    ? buildCatalogAiLogoReferencePrompt(names, { logoHint: logoHint || undefined })
    : '';

  // ПОЖЕЛАНИЕ ПОЛЬЗОВАТЕЛЯ К ФОНУ/СЦЕНЕ — авторитетно и В НАЧАЛЕ (всегда переживает лимит 2400,
  // не жертвует лого-инструкциями в хвосте). Форвард-референс «игнорируй любой другой фон ниже»
  // перебивает и захардкоженную сцену, и LLM-интерьер. Раньше это была слабая приписка в середине
  // («follow as extra creative direction»), проигрывавшая детальному описанию сцены.
  const sceneOverride = sceneBrief?.trim()
    ? `USER BACKGROUND & SCENE OVERRIDE — HIGHEST PRIORITY (applies to the setting only): ${sceneBrief.trim().slice(0, 400)}. ` +
      `The background, surface and setting MUST be exactly this and OVERRIDE any other background, surface, interior or scene mentioned anywhere else below. ` +
      `Keep every product identical and keep the required layout — change ONLY the background/scene.`
    : '';

  // ПОРЯДОК ПО ПРИОРИТЕТУ: override + идентичность товаров + лого-референс ВПЕРЁД (переживут срез
  // тела), потом раскладка, потом многословное вступление и описание сцены (низкий приоритет —
  // режется первым). Раньше длинный prose «PRODUCT FIDELITY» стоял ДО списка товаров и выталкивал
  // CLOSED SET за лимит.
  const parts = [
    sceneOverride,
    `Exactly ${count} catalog products together in ONE scene: ${refProducts}.`,
    `CLOSED SET — depict ONLY these ${count} products: ${names.join(', ')}. Do NOT add ANY other object, product, gadget, watch, food or prop that is not in this exact list.`,
    colorRules ||
      'CRITICAL: match reference photo colors unless recoloring to another color listed for that same SKU in the catalog.',
    includeLogo ? logoBlock : '',
    layout.layoutLine,
    // ↓ низкоприоритетное: вступительный prose, масштаб, описание сцены — режется первым при переполнении.
    'Premium commercial product photography for a corporate gift catalog — aspirational welcome-pack aesthetic, tactile, purchase-ready.',
    'Shot like a high-end B2B gift-set campaign: soft studio key light, natural fill, realistic contact shadows, subtle color grading, 8K photorealistic detail.',
    'PRODUCT FIDELITY: use each attached catalog photo as the ground-truth for that PRODUCT ONLY — keep its exact shape, proportions, design, material and color; do not redraw, warp or restyle the product. IMPORTANT: the reference photos are product cutouts — do NOT copy their plain/white/studio backgrounds. Compose the true-to-reference products beautifully into the premium scene, with rich lighting and depth — a polished commercial hero shot, not products dropped on a bare surface.',
    // Data-driven масштаб с реальными см, если он есть; иначе — общая фраза про пропорции.
    sizeRules ||
      'Maintain correct real-world relative proportions between items — a suitcase, backpack or large bag is FAR larger than a mug, bottle, notebook or pen; never render a suitcase the size of a thermos.',
    'Single unified scene where every product looks desirable and real — luxury unboxing hero shot, NOT stock clipart or catalog grid.',
    // При явном переопределении укорачиваем описание сцены (её фон всё равно перебит override).
    sceneOverride ? sceneDesc.slice(0, 700) : sceneDesc,
    // Низкоприоритетную «отсебятину» (Story/Mood/Brief) опускаем при явном переопределении сцены.
    !sceneOverride && composition ? `Story: ${composition.slice(0, 220)}.` : '',
    !sceneOverride && style ? `Mood: ${style}.` : '',
    !sceneOverride && brief ? `Brief: ${brief.slice(0, 160)}.` : '',
    layout.integrationLine,
    layout.useBoxScene
      ? 'NOT a catalog grid, NOT isolated items on pure white, NOT a collage of cutouts, NOT random tabletop flat lay without packaging.'
      : 'NOT a catalog grid, NOT isolated items on pure white, NOT a collage of cutouts.',
  ];

  // КРИТИЧНЫЙ ХВОСТ — брендинг + «без людей». Он ОБЯЗАН уцелеть: раньше стоял в самом конце общего
  // массива и первым уходил под нож лимита 2400 (особенно после добавления override в начало).
  // Резервируем под него место и режем СЕРЕДИНУ тела (описание сцены), а не эти инструкции.
  const criticalTail = [
    includeLogo
      ? 'Client logo from the LAST reference image must appear ON every visible product as factory-applied branding — never floating, never in the background.'
      : 'CRITICAL — NO BRANDING: every product must be completely blank and unbranded. Do NOT invent, add, imagine or apply ANY logo, brand mark, emblem, monogram, wordmark, label, sticker, badge or text on any product surface. The reference catalog photos may contain vendor/stock logos — REMOVE and OMIT them: reproduce only the product shape, color and material, leaving all surfaces clean and empty.',
    includeLogo ? 'Logo integration must respect each product material (print, embroidery, engraving, foil) — never a flat pasted photo overlay.' : '',
    includeLogo
      ? 'Apply branding only within a realistic printable zone for that product and material (e.g. flat front panel, chest, handle wrap) at a production-realistic size — do NOT alter, reshape or resize the product to fit the logo. The result must look exactly like the real manufactured item.'
      : '',
    includeLogo
      ? 'FORBIDDEN: floating logo in empty space, duplicate logo copies between products, logo on background or table, logo on gift box exterior or lid, logo on packaging cardboard or foam, centered standalone logo emblem, sticker in mid-air.'
      : '',
    includeLogo ? CATALOG_LOGO_INTEGRATION_FOOTER : '',
    'No people, no hands, no watermarks, no captions.',
  ]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  const body = parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  // Лимит 3000 (было 2400): сам image-провайдер длину не режет, 2400 — самоназначенный. Для набора
  // из 4 товаров + лого + пользовательский override критичного контента (идентичность товаров +
  // брендинг + фон) genuinely > 2400; 3000 ≈ 750 токенов — с запасом в пределах модели.
  const room = Math.max(0, 3000 - criticalTail.length - 1);
  return `${body.slice(0, room).trim()} ${criticalTail}`.replace(/\s+/g, ' ').trim().slice(0, 3000);
}

export function buildCatalogAiNegativePrompt(
  llmOutput: LlmGenerationOutput,
  snapshot: GenerationSnapshot,
  usedRealLlm = false,
  options?: {
    deferLogoToPostComposite?: boolean;
    giftBoxEnabled?: boolean;
    productTypes?: string[];
  },
): string {
  const deferLogo = Boolean(options?.deferLogoToPostComposite);
  const includeLogo = snapshot.hasLogo && !deferLogo;
  const giftBox = options?.giftBoxEnabled !== false;
  const base =
    usedRealLlm && llmOutput.negative_prompt?.trim()
      ? llmOutput.negative_prompt.trim()
      : 'blurry, low quality, wrong count, extra products, missing items';

  // Без лого — активно запрещаем ЛЮБЫЕ выдуманные логотипы/надписи на товарах.
  const logoNegative = includeLogo
    ? CATALOG_LOGO_NEGATIVE_PROMPT
    : 'any logo, brand logo, invented logo, hallucinated logo, brand mark, emblem, monogram, wordmark, company name, product branding, printed text on product, label, sticker, badge, watermark logo, stock or vendor logo from reference photo,';

  return [
    base,
    logoNegative,
    // Закрытый набор: никаких предметов вне списка (часы/сумки/чемоданы, если их нет в наборе).
    'extra unlisted products, any item not in the product list, extra watch, extra gadget, extra bag, extra food, added props not in the set,',
    // ВСЕГДА исключаем дешёвый/пустой фон и «продукты на голой поверхности».
    'pure white background, plain studio backdrop, empty bare surface, stone slab background, concrete tabletop, cheap mockup background, isolated cutout, product collage, catalog grid, floating products, scattered messy items,',
    // «Плоская раскладка / без коробки» штрафуем ТОЛЬКО когда коробка включена.
    giftBox ? 'random surface flat lay, products without a gift box,' : '',
    'wrong scale, disproportionate sizes, tiny suitcase, giant mug,',
    'redesigned product, altered product shape, wrong proportions, distorted geometry, restyled product, invented product details, product does not match reference photo, warped product,',
    catalogColorNegativePromptAddendum() + ',',
    'flat vector, cartoon, watermark, people, hands, text overlay, amateur lighting, plastic CGI look,',
  ]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

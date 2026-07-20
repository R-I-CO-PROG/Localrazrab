"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildLocalCatalogSceneGenerationOutput = buildLocalCatalogSceneGenerationOutput;
exports.buildLocalSceneGenerationOutput = buildLocalSceneGenerationOutput;
exports.buildLocalCreativeGenerationOutput = buildLocalCreativeGenerationOutput;
const product_visual_en_util_1 = require("../../generation/product-visual-en.util");
const brand_colors_util_1 = require("../../generation/brand-colors.util");
const ai_enhance_prompt_1 = require("../../generation/ai-enhance.prompt");
const catalog_ai_image_prompt_1 = require("../../generation/catalog-ai-image-prompt");
const creative_merch_visual_util_1 = require("../../generation/creative-merch-visual.util");
const product_logo_branding_util_1 = require("../../generation/product-logo-branding.util");
function detectStyleRu(brief) {
    const t = brief.toLowerCase();
    if (t.includes('премиум') || t.includes('premium') || t.includes('vip'))
        return 'Премиальный каталожный';
    if (t.includes('скейт') || t.includes('скеит') || t.includes('skater') || t.includes('street')) {
        return 'Скейт / streetwear';
    }
    if (t.includes('эко') || t.includes('eco') || t.includes('green'))
        return 'Эко-мерч';
    if (t.includes('минимал') || t.includes('tech') || t.includes('it'))
        return 'Минималистичный tech';
    if (t.includes('welcome') || t.includes('онбординг'))
        return 'Welcome pack';
    if (t.includes('event') || t.includes('мероприят'))
        return 'Event kit';
    return 'Современный корпоративный';
}
function sceneLayoutEn(count, names) {
    const clothing = names.some((n) => /футбол|поло|худи|свитшот|кепк|бини|носок/i.test(n));
    if (clothing && count === 3) {
        return 'Studio apparel flat lay: garments in dynamic skater-style composition, all items visible.';
    }
    if (count === 1)
        return 'Single hero product centered on studio surface.';
    if (count === 2)
        return 'Two products side by side, balanced studio composition.';
    if (count === 3)
        return 'Three products in triangular balanced arrangement on studio floor.';
    return 'Premium corporate gift set flat lay, every item clearly visible.';
}
function buildLocalCatalogSceneGenerationOutput(input) {
    const items = input.productNames.length > 0 ? [...input.productNames] : [];
    const count = items.length;
    const brief = input.userPrompt.trim();
    const itemsEn = items.map((n) => (0, product_visual_en_util_1.describeProductEn)(n) || n).join('; ');
    const sceneEnv = (0, catalog_ai_image_prompt_1.inferCatalogSceneEnvironment)(brief);
    const image_prompt = [
        'Ultra photorealistic lifestyle corporate merchandise photograph.',
        `Exactly ${count} catalog products with EXACT colors from reference photos: ${itemsEn}.`,
        'Do NOT recolor products to brand palette — preserve catalog SKU colors and materials.',
        'Recolor from reference photo ONLY when target color is listed for that SKU (multi-variant catalog items).',
        sceneEnv,
        input.hasLogo
            ? 'Apply brand logo on products via appropriate print/embroidery — do not change product base color.'
            : 'Clean catalog-accurate product surfaces.',
        brief ? `Creative direction: ${brief.slice(0, 100)}.` : '',
        'No people, no hands, no watermarks, not white background cutouts.',
    ]
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 480);
    const composition = [
        `Концепция «${input.category}»: ${items.join(', ')}.`,
        input.quantity ? `Тираж ${input.quantity} шт.` : '',
        brief ? brief.slice(0, 160) : 'Корпоративный набор под бренд.',
    ]
        .filter(Boolean)
        .join(' ');
    const snapshot = {
        productNames: items,
        colors: input.colors,
        category: input.category,
        hasLogo: input.hasLogo,
        userPrompt: input.userPrompt,
    };
    return {
        items,
        composition,
        style: detectStyleRu(brief),
        image_prompt,
        negative_prompt: 'white background, isolated cutout, recolored products, wrong colors, product collage, catalog grid, blurry, people, hands, watermark',
    };
}
function buildLocalSceneGenerationOutput(input) {
    const items = input.sceneOnly && input.productNames.length > 0
        ? [...input.productNames]
        : input.productNames.length > 0
            ? [...input.productNames]
            : [];
    const count = items.length;
    const brief = input.userPrompt.trim();
    const assigned = (0, brand_colors_util_1.assignBrandColorsToProducts)(input.colors, count);
    const itemsEn = items
        .map((n, i) => (0, brand_colors_util_1.colorizeProductDescription)((0, product_visual_en_util_1.describeProductEn)(n), assigned[i]))
        .join('; ');
    const paletteBlock = (0, brand_colors_util_1.formatBrandPalettePrompt)(input.colors);
    const perProduct = (0, brand_colors_util_1.formatPerProductColorAssignments)(items, input.colors);
    const paletteRu = input.colors.slice(0, 3).join(', ') || '—';
    const image_prompt = [
        paletteBlock,
        perProduct,
        'Ultra photorealistic branded merchandise studio photography, 8k commercial catalog.',
        `Exactly ${count} physical products: ${itemsEn}.`,
        sceneLayoutEn(count, items),
        'Each product in its assigned brand color; studio lighting tinted by palette.',
        'Realistic fabric metal ceramic plastic textures, soft directional rim light, natural shadows.',
        input.hasLogo
            ? 'Blank unbranded product surfaces with clear flat areas for logo placement on each item.'
            : 'Clean unbranded merchandise surfaces.',
        brief ? `Creative direction: ${brief.slice(0, 100)}.` : '',
        'No people, no hands, no watermarks, no extra props.',
    ]
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 480);
    const composition = [
        `Концепция «${input.category}»: ${items.join(', ')}.`,
        input.quantity ? `Тираж ${input.quantity} шт.` : '',
        brief ? brief.slice(0, 160) : 'Корпоративный набор под бренд.',
        `Палитра: ${paletteRu}.`,
    ]
        .filter(Boolean)
        .join(' ');
    const snapshot = {
        productNames: items,
        colors: input.colors,
        category: input.category,
        hasLogo: input.hasLogo,
        userPrompt: input.userPrompt,
    };
    return {
        items,
        composition,
        style: detectStyleRu(brief),
        image_prompt,
        negative_prompt: (0, ai_enhance_prompt_1.buildAiRenderNegative)(snapshot),
    };
}
function buildLocalCreativeGenerationOutput(input) {
    const brief = input.userPrompt.trim();
    const paletteBlock = (0, brand_colors_util_1.formatBrandPalettePrompt)(input.colors);
    const paletteRu = input.colors.slice(0, 3).join(', ') || '—';
    const image_prompt = [
        creative_merch_visual_util_1.CREATIVE_MERCH_SCENE_GUARDRAILS,
        paletteBlock,
        'Ultra photorealistic corporate merch product photograph, 8k studio quality.',
        brief
            ? `Set mood inspired by brief (products only, not industry illustration): ${brief.slice(0, 200)}.`
            : 'Premium branded gift-set products.',
        input.colors.length > 0
            ? 'Brand palette visible on product bodies and accents.'
            : 'Cohesive brand-colored product styling.',
        input.hasLogo ? (0, product_logo_branding_util_1.buildCreativeLogoApplicationPrompt)() : '',
        'No watermarks, no taxis, no streets, no vehicles, no people.',
    ]
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 1800);
    const composition = [
        'Свободная концепция по вашему описанию.',
        brief ? brief.slice(0, 200) : '',
        `Палитра: ${paletteRu}.`,
    ]
        .filter(Boolean)
        .join(' ');
    return {
        items: [],
        composition,
        style: detectStyleRu(brief),
        image_prompt,
        negative_prompt: `blurry, low quality, watermark, cartoon, ${creative_merch_visual_util_1.CREATIVE_MERCH_NEGATIVE_EXTRA}`,
    };
}
//# sourceMappingURL=local-scene-prompt.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildAiEnhanceNegative = exports.buildAiEnhancePrompt = exports.buildAiStudioNegative = exports.buildAiStudioPrompt = void 0;
exports.buildAiRenderPrompt = buildAiRenderPrompt;
exports.buildAiRenderNegative = buildAiRenderNegative;
exports.buildAiScenePrompt = buildAiScenePrompt;
exports.buildAiBrandingPassPrompt = buildAiBrandingPassPrompt;
exports.buildAiBrandedSinglePassPrompt = buildAiBrandedSinglePassPrompt;
exports.buildAiSceneNegative = buildAiSceneNegative;
exports.buildAiBrandingNegative = buildAiBrandingNegative;
const brand_colors_util_1 = require("./brand-colors.util");
const product_visual_en_util_1 = require("./product-visual-en.util");
const product_logo_branding_util_1 = require("./product-logo-branding.util");
function describeProduct(name, productHex) {
    return (0, brand_colors_util_1.colorizeProductDescription)((0, product_visual_en_util_1.describeProductEn)(name) || `premium corporate ${name}`, productHex);
}
function layoutHint(count) {
    if (count === 2)
        return 'Two products side by side on dark studio surface.';
    if (count === 3)
        return 'Three products in balanced flat lay on dark desk.';
    if (count >= 4) {
        return 'Premium welcome pack flat lay: thermos or tall item back, notebook center, pen front, bag or box right.';
    }
    return 'Single hero product centered on dark studio surface.';
}
function buildAiRenderPrompt(snapshot, logoHint) {
    const products = snapshot.productNames ?? [];
    const count = products.length;
    const assigned = (0, brand_colors_util_1.assignBrandColorsToProducts)(snapshot.colors, count);
    const items = products.map((n, i) => describeProduct(n, assigned[i])).join(', ');
    const palette = (0, brand_colors_util_1.formatBrandPalettePrompt)(snapshot.colors);
    const perProduct = (0, brand_colors_util_1.formatPerProductColorAssignments)(products, snapshot.colors);
    const brief = snapshot.userPrompt?.trim();
    const hasLogo = snapshot.hasLogo && Boolean(logoHint?.trim());
    const parts = [
        palette,
        perProduct,
        'Ultra photorealistic corporate merchandise product photography, 8k catalog shot.',
        `Exactly ${count} real physical products in one scene: ${items}.`,
        'Each product body in its assigned brand color — not all identical black when palette has chromatic colors.',
        layoutHint(count),
        'Studio background tinted by brand palette, natural shadows.',
    ];
    if (hasLogo) {
        parts.push((0, product_logo_branding_util_1.buildLogoApplicationPrompt)(products, { hasLogo: true, logoHint }));
    }
    else {
        parts.push('Products completely blank — no logos, no text, no prints, unbranded surfaces.');
    }
    parts.push('No people, no hands, no watermarks, no captions, no extra objects.');
    if (brief)
        parts.push(`Mood: ${brief.slice(0, 80)}.`);
    return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().slice(0, 1200);
}
function buildAiRenderNegative(snapshot) {
    const count = snapshot.productNames?.length ?? 0;
    const hasLogo = snapshot.hasLogo;
    const products = snapshot.productNames ?? [];
    const drinkware = products.some((n) => /кружк|стакан|термокруж|термос|бутылк|бамбуков/i.test(n));
    const parts = [
        `not ${count} items, wrong count, extra products, missing items,`,
        'flat vector, silhouette, clip art, cartoon, 2d,',
        'blurry, low quality, people, hands, white background, cluttered',
        (0, brand_colors_util_1.buildPaletteComplianceNegative)(snapshot.colors),
    ];
    if (drinkware) {
        parts.push('disposable paper cup, plastic takeaway cup, coffee lid, single-use cup, fast-food cup,');
    }
    const hasHoodie = products.some((n) => /худи/i.test(n));
    const hasSweatshirt = products.some((n) => /свитшот/i.test(n));
    const hasCap = products.some((n) => /кепк/i.test(n));
    const hasNotebook = products.some((n) => /блокнот|блок для/i.test(n));
    if (!hasHoodie && !hasSweatshirt) {
        parts.push('hoodie, sweatshirt, zip-up jacket, bomber jacket,');
    }
    if (!hasCap)
        parts.push('baseball cap,');
    if (!hasNotebook)
        parts.push('notebook, notepad,');
    if (hasLogo) {
        parts.unshift('sticker logo, floating logo, pasted overlay, decal,', 'wrong logo, fake branding, random text, watermark,', 'deformed products,');
    }
    else {
        parts.unshift('logo, branding, text, letters, watermark,');
    }
    return parts.join(' ');
}
function buildAiScenePrompt(snapshot) {
    return buildAiRenderPrompt(snapshot);
}
function buildAiBrandingPassPrompt(snapshot, logoHint) {
    return buildAiRenderPrompt(snapshot, logoHint);
}
function buildAiBrandedSinglePassPrompt(snapshot, logoHint) {
    return buildAiRenderPrompt(snapshot, logoHint);
}
function buildAiSceneNegative(snapshot) {
    return buildAiRenderNegative({ ...snapshot, hasLogo: false });
}
function buildAiBrandingNegative(snapshot) {
    return buildAiRenderNegative(snapshot);
}
exports.buildAiStudioPrompt = buildAiScenePrompt;
exports.buildAiStudioNegative = buildAiSceneNegative;
exports.buildAiEnhancePrompt = buildAiBrandedSinglePassPrompt;
exports.buildAiEnhanceNegative = buildAiBrandingNegative;
//# sourceMappingURL=ai-enhance.prompt.js.map
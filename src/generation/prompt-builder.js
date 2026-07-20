"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildPollinationsPrompt = void 0;
exports.buildProductMockupPrompt = buildProductMockupPrompt;
exports.buildCompactImagePrompt = buildCompactImagePrompt;
const brand_colors_util_1 = require("./brand-colors.util");
const product_logo_branding_util_1 = require("./product-logo-branding.util");
function buildProductMockupPrompt(llmOutput, snapshot) {
    const products = snapshot.productNames ?? llmOutput.items ?? [];
    const productListEn = products.join(', ');
    const colorList = (snapshot.colors ?? []).join(', ');
    const category = snapshot.category ?? 'Welcome Pack';
    const styleHint = llmOutput.style || 'minimal tech corporate';
    const palette = (0, brand_colors_util_1.formatBrandPalettePrompt)(snapshot.colors);
    const logoPart = (0, product_logo_branding_util_1.buildLogoApplicationPrompt)(products, { hasLogo: snapshot.hasLogo });
    const llmScene = snapshot.hasLogo
        ? (0, product_logo_branding_util_1.stripBlankLogoPhrases)(llmOutput.image_prompt?.trim() ?? '')
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
function buildCompactImagePrompt(llmOutput, snapshot) {
    const products = snapshot.productNames ?? llmOutput.items ?? [];
    const productList = products.join(', ');
    const colors = (snapshot.colors ?? []).slice(0, 3).join(', ');
    const category = snapshot.category ?? 'Welcome Pack';
    const logoHint = snapshot.hasLogo
        ? (0, product_logo_branding_util_1.buildLogoApplicationPrompt)(products, { hasLogo: true }).slice(0, 120) + ','
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
exports.buildPollinationsPrompt = buildProductMockupPrompt;
//# sourceMappingURL=prompt-builder.js.map
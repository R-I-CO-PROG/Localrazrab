"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildAiImagePrompt = buildAiImagePrompt;
exports.buildCreativeAiImagePrompt = buildCreativeAiImagePrompt;
exports.buildCreativeAiNegativePrompt = buildCreativeAiNegativePrompt;
exports.buildAiNegativePrompt = buildAiNegativePrompt;
const ai_enhance_prompt_1 = require("./ai-enhance.prompt");
const brand_colors_util_1 = require("./brand-colors.util");
const product_logo_branding_util_1 = require("./product-logo-branding.util");
const creative_merch_visual_util_1 = require("./creative-merch-visual.util");
function buildAiImagePrompt(llmOutput, snapshot, logoHint, usedRealLlm = false) {
    const count = snapshot.productNames?.length ?? llmOutput.items.length;
    const names = snapshot.productNames ?? llmOutput.items ?? [];
    const palette = (0, brand_colors_util_1.formatBrandPalettePrompt)(snapshot.colors);
    let core;
    if (usedRealLlm && llmOutput.image_prompt?.trim().length > 40) {
        const sanitized = snapshot.hasLogo
            ? (0, product_logo_branding_util_1.stripBlankLogoPhrases)(llmOutput.image_prompt.trim())
            : llmOutput.image_prompt.trim();
        core = (0, brand_colors_util_1.enforceBrandColorsInPrompt)(sanitized, snapshot.colors, names);
    }
    else {
        core = (0, ai_enhance_prompt_1.buildAiRenderPrompt)(snapshot, logoHint);
    }
    const perProduct = (0, brand_colors_util_1.formatPerProductColorAssignments)(names, snapshot.colors);
    const parts = [palette, perProduct, core];
    if (snapshot.hasLogo) {
        parts.push((0, product_logo_branding_util_1.buildLogoApplicationPrompt)(names, { hasLogo: true, logoHint: logoHint || undefined }));
    }
    parts.push(`Exactly ${count} products, no extra objects.`);
    return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().slice(0, 1200);
}
function buildCreativeAiImagePrompt(llmOutput, snapshot, logoHint, usedRealLlm = false, sceneBrief, options) {
    const deferLogo = Boolean(options?.deferLogoToPostComposite);
    const includeLogo = snapshot.hasLogo && !deferLogo;
    const palette = (0, brand_colors_util_1.formatBrandPalettePrompt)(snapshot.colors, { creative: true });
    const conceptItems = options?.conceptItems ?? [];
    const productList = (0, creative_merch_visual_util_1.formatCreativeProductList)(conceptItems);
    const productNamesFromSnapshot = snapshot.productNames?.filter(Boolean) ?? [];
    const productLine = productList ||
        (productNamesFromSnapshot.length > 0
            ? `Exactly ${productNamesFromSnapshot.length} physical branded products in frame: ${productNamesFromSnapshot.join('; ')}.`
            : '');
    let core = llmOutput.image_prompt?.trim() ?? '';
    if (usedRealLlm && core.length > 40) {
        core = snapshot.hasLogo ? (0, product_logo_branding_util_1.stripBlankLogoPhrases)(core) : core;
    }
    else if (snapshot.userPrompt?.trim()) {
        core = [
            'Ultra photorealistic corporate merch product photograph, 8k studio quality.',
            productLine,
            palette,
        ]
            .filter(Boolean)
            .join(' ');
    }
    const parts = [creative_merch_visual_util_1.CREATIVE_MERCH_SCENE_GUARDRAILS, palette, productLine, core];
    const scene = sceneBrief?.trim();
    if (scene) {
        parts.push(`User scene instructions (follow as additional creative direction for composition, ` +
            `camera angle, lighting, background and mood): ${scene.slice(0, 600)}.`);
    }
    if (includeLogo) {
        const names = productNamesFromSnapshot.length
            ? productNamesFromSnapshot
            : conceptItems.map((i) => i.notes || i.productType);
        if (names.length > 0) {
            parts.push((0, product_logo_branding_util_1.buildCatalogAiLogoReferencePrompt)(names, {
                logoHint: logoHint || undefined,
                refLayout: 'logo-only',
            }));
            parts.push((0, product_logo_branding_util_1.buildLogoApplicationPrompt)(names, { hasLogo: true, logoHint: logoHint || undefined }));
            parts.push(product_logo_branding_util_1.CATALOG_LOGO_INTEGRATION_FOOTER);
        }
        else {
            parts.push((0, product_logo_branding_util_1.buildCreativeLogoApplicationPrompt)(logoHint));
        }
    }
    else if (deferLogo) {
        parts.push('All branded objects must have clean blank surfaces without any logos, text or branding marks.');
    }
    if (includeLogo) {
        parts.push('Client logo from reference image ONLY — integrate on each product surface; NEVER invent a different emblem, cube icon, or paste reference as floating overlay.');
    }
    parts.push('No watermarks, no extra text overlays unless part of the logo.');
    parts.push('FORBIDDEN in frame: taxis, cars, streets, traffic, office interiors, people — only the merch products listed above.');
    return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().slice(0, 2400);
}
function buildCreativeAiNegativePrompt(llmOutput, snapshot, usedRealLlm = false, options) {
    const deferLogo = Boolean(options?.deferLogoToPostComposite);
    const includeLogo = snapshot.hasLogo && !deferLogo;
    if (usedRealLlm && llmOutput.negative_prompt?.trim()) {
        const base = llmOutput.negative_prompt.trim();
        if (includeLogo) {
            return `${base}, ${product_logo_branding_util_1.CATALOG_LOGO_NEGATIVE_PROMPT}`;
        }
        if (deferLogo) {
            return `${base}, any logos on products, branding marks, printed emblems, stickers`;
        }
        return base;
    }
    const parts = [
        'blurry, low quality, watermark, text overlay, distorted logo, sticker overlay, cartoon, clip art',
        creative_merch_visual_util_1.CREATIVE_MERCH_NEGATIVE_EXTRA,
    ];
    if (includeLogo) {
        parts.unshift(product_logo_branding_util_1.CATALOG_LOGO_NEGATIVE_PROMPT);
    }
    else if (deferLogo) {
        parts.unshift('any logos on products, branding marks, printed emblems, stickers,');
    }
    return parts.join(' ');
}
function buildAiNegativePrompt(llmOutput, snapshot, usedRealLlm = false) {
    if (usedRealLlm && llmOutput.negative_prompt?.trim()) {
        return llmOutput.negative_prompt.trim();
    }
    return (0, ai_enhance_prompt_1.buildAiRenderNegative)(snapshot);
}
//# sourceMappingURL=llm-image-prompt.js.map
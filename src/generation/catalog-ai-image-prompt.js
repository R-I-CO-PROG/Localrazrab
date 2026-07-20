"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CATALOG_PREMIUM_GIFT_BOX_SCENE = void 0;
exports.inferCatalogSceneEnvironment = inferCatalogSceneEnvironment;
exports.buildCatalogAiImagePrompt = buildCatalogAiImagePrompt;
exports.buildCatalogAiNegativePrompt = buildCatalogAiNegativePrompt;
const product_logo_branding_util_1 = require("./product-logo-branding.util");
const catalog_product_color_rules_util_1 = require("./catalog-product-color-rules.util");
exports.CATALOG_PREMIUM_GIFT_BOX_SCENE = 'Premium corporate welcome gift box with lid open, photographed from above at a slight angle. Matte black or charcoal rigid presentation box with custom-fit inner compartments and dividers — every product nestled in its own slot, neatly folded or standing, like a luxury B2B unboxing. Soft diffused studio lighting, subtle shadows, tactile fabric and material detail, cohesive monochrome palette, high-end gift-set catalog photography.';
function inferCatalogSceneEnvironment(brief, composition, style) {
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
    return exports.CATALOG_PREMIUM_GIFT_BOX_SCENE;
}
function buildCatalogAiImagePrompt(llmOutput, snapshot, logoHint, usedRealLlm = false, colorSpecs = [], sceneBrief, options) {
    const deferLogo = Boolean(options?.deferLogoToPostComposite);
    const includeLogo = snapshot.hasLogo && !deferLogo;
    const names = snapshot.productNames ?? llmOutput.items ?? [];
    const count = names.length;
    const brief = snapshot.userPrompt?.trim();
    const composition = llmOutput.composition?.trim();
    const style = llmOutput.style?.trim();
    const colorRules = (0, catalog_product_color_rules_util_1.formatCatalogColorRulesForPrompt)(colorSpecs);
    const refProducts = names
        .map((name, i) => `Product ${i + 1} "${name}": catalog reference image ${i + 1} — shape, color and material only (ignore stock branding on photo)`)
        .join('. ');
    let sceneDesc;
    if (usedRealLlm && llmOutput.image_prompt?.trim().length > 40) {
        sceneDesc = (0, product_logo_branding_util_1.stripBlankLogoPhrases)(llmOutput.image_prompt
            .replace(/assign each brand_colors_hex[^.]*\./gi, '')
            .replace(/MUST assign each brand[^.]*\./gi, '')
            .replace(/Recolor each product[^.]*\./gi, '')
            .replace(/Each product body in its assigned brand color[^.]*\./gi, '')
            .trim());
    }
    else {
        sceneDesc = inferCatalogSceneEnvironment(brief, composition, style);
    }
    const logoBlock = includeLogo
        ? (0, product_logo_branding_util_1.buildCatalogAiLogoReferencePrompt)(names, { logoHint: logoHint || undefined })
        : '';
    const parts = [
        'Premium commercial product photography for a corporate gift catalog — aspirational welcome-pack aesthetic, tactile, purchase-ready.',
        'Shot like a high-end B2B gift-set campaign: soft studio key light, natural fill, realistic contact shadows, subtle color grading, 8K photorealistic detail.',
        'MANDATORY LAYOUT: all products inside an open premium presentation gift box with custom compartments — NOT scattered on a random surface, NOT a plain flat lay on stone or concrete.',
        'Single unified scene where every product looks desirable and real — luxury unboxing hero shot, NOT stock clipart or catalog grid.',
        `Exactly ${count} catalog products together in ONE scene: ${refProducts}.`,
        colorRules ||
            'CRITICAL: match reference photo colors unless recoloring to another color listed for that same SKU in the catalog.',
        includeLogo ? logoBlock : '',
        sceneDesc,
        composition ? `Story: ${composition.slice(0, 220)}.` : '',
        style ? `Mood: ${style}.` : '',
        brief ? `Brief: ${brief.slice(0, 160)}.` : '',
        sceneBrief?.trim()
            ? `Additional user instructions for the scene (follow as extra creative direction, without breaking the rules above): ${sceneBrief.trim().slice(0, 600)}.`
            : '',
        'Products integrated into fitted box compartments with realistic scale, shadows and material contact.',
        'NOT a catalog grid, NOT isolated items on pure white, NOT a collage of cutouts, NOT random tabletop flat lay without packaging.',
        includeLogo
            ? 'Client logo from the LAST reference image must appear ON every visible product as factory-applied branding — never floating, never in the background.'
            : deferLogo
                ? 'Generate completely unbranded products — no logos, no prints, no emblems on any surface.'
                : '',
        includeLogo
            ? 'Logo integration must respect each product material (print, embroidery, engraving, foil) — never a flat pasted photo overlay.'
            : '',
        includeLogo
            ? 'FORBIDDEN: floating logo in empty space, duplicate logo copies between products, logo on background or table, logo on gift box exterior or lid, logo on packaging cardboard or foam, centered standalone logo emblem, sticker in mid-air.'
            : '',
        includeLogo ? product_logo_branding_util_1.CATALOG_LOGO_INTEGRATION_FOOTER : '',
    ];
    parts.push('No people, no hands, no watermarks, no captions.');
    return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().slice(0, 2400);
}
function buildCatalogAiNegativePrompt(llmOutput, snapshot, usedRealLlm = false, options) {
    const deferLogo = Boolean(options?.deferLogoToPostComposite);
    const includeLogo = snapshot.hasLogo && !deferLogo;
    const base = usedRealLlm && llmOutput.negative_prompt?.trim()
        ? llmOutput.negative_prompt.trim()
        : 'blurry, low quality, wrong count, extra products, missing items';
    const logoNegative = includeLogo ? product_logo_branding_util_1.CATALOG_LOGO_NEGATIVE_PROMPT : '';
    return [
        base,
        logoNegative,
        'pure white background, isolated cutout, product collage, catalog grid, floating products, random surface flat lay, stone slab background, concrete tabletop, scattered items without box,',
        (0, catalog_product_color_rules_util_1.catalogColorNegativePromptAddendum)() + ',',
        'flat vector, cartoon, watermark, people, hands, text overlay, cheap mockup, amateur lighting, plastic CGI look,',
    ]
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
}
//# sourceMappingURL=catalog-ai-image-prompt.js.map
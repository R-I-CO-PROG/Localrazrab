"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CATALOG_LOGO_INTEGRATION_FOOTER = exports.CATALOG_LOGO_AVOID_PROMPT = exports.OPENROUTER_CATALOG_LOGO_REF_PREAMBLE = exports.OPENROUTER_LOGO_REF_PREAMBLE = exports.CATALOG_LOGO_NEGATIVE_PROMPT = void 0;
exports.getProductLogoBranding = getProductLogoBranding;
exports.buildPerProductLogoBrandingLine = buildPerProductLogoBrandingLine;
exports.buildPerProductLogoBrandingBlock = buildPerProductLogoBrandingBlock;
exports.buildCreativeAiLogoReferencePrompt = buildCreativeAiLogoReferencePrompt;
exports.buildCreativeLogoApplicationPrompt = buildCreativeLogoApplicationPrompt;
exports.buildCatalogAiLogoReferencePrompt = buildCatalogAiLogoReferencePrompt;
exports.buildLogoApplicationPrompt = buildLogoApplicationPrompt;
exports.stripBlankLogoPhrases = stripBlankLogoPhrases;
const logo_surface_util_1 = require("./logo-surface.util");
function getProductLogoBranding(productNameRu) {
    const n = productNameRu.toLowerCase();
    const surface = (0, logo_surface_util_1.detectLogoSurface)(productNameRu);
    if (n.includes('ручк') || n.includes('карандаш')) {
        return {
            methodEn: 'pad print (pad printing)',
            placementEn: 'barrel, centered facing camera, small crisp mark',
            surface,
        };
    }
    if (n.includes('кружк') || n.includes('стакан') || n.includes('бамбуков')) {
        return {
            methodEn: 'ceramic decal / wrap print',
            placementEn: 'front mug body center, following cylinder curvature',
            surface: 'cylinder',
        };
    }
    if (n.includes('термокруж')) {
        return {
            methodEn: 'screen print or vinyl wrap',
            placementEn: 'front insulated mug body, below handle',
            surface: 'cylinder',
        };
    }
    if (n.includes('термос') || n.includes('бутылк')) {
        return {
            methodEn: 'laser engraving or matte pad print',
            placementEn: 'front metal/flask body center',
            surface: 'cylinder',
        };
    }
    if (n.includes('футбол') || n.includes('поло') || n.includes('худи') || n.includes('свитшот')) {
        return {
            methodEn: 'left-chest embroidery or screen print',
            placementEn: 'left chest panel, 8–10 cm from collar',
            surface: 'fabric',
        };
    }
    if (n.includes('кепк') || n.includes('бини')) {
        return {
            methodEn: '3D embroidery or flat embroidery',
            placementEn: 'front crown panel center',
            surface: 'fabric',
        };
    }
    if (n.includes('носок')) {
        return {
            methodEn: 'jacquard knit or screen print',
            placementEn: 'outer ankle area',
            surface: 'fabric',
        };
    }
    if (n.includes('блокнот') || n.includes('блок для') || n.includes('ежедневник')) {
        return {
            methodEn: 'foil stamp or deboss',
            placementEn: 'front hardcover center, aligned with spine',
            surface: 'flat',
        };
    }
    if (n.includes('graphite') ||
        n.includes('графит') ||
        (n.includes('набор') && (n.includes('блокн') || n.includes('ручк')))) {
        return {
            methodEn: 'foil stamp or pad print',
            placementEn: 'notebook cover center and pen barrel if visible in the set',
            surface: 'flat',
        };
    }
    if (n.includes('папк')) {
        return {
            methodEn: 'foil stamp or screen print',
            placementEn: 'front cover center',
            surface: 'flat',
        };
    }
    if (n.includes('шоппер') || n.includes('сумк') || n.includes('рюкзак') || n.includes('мешок')) {
        return {
            methodEn: 'screen print or heat transfer',
            placementEn: 'front fabric panel center',
            surface: 'fabric',
        };
    }
    if (n.includes('чехол') ||
        n.includes('sleeve') ||
        n.includes('кейс') ||
        n.includes('case') ||
        n.includes('обложк')) {
        return {
            methodEn: 'deboss, emboss or subtle screen print',
            placementEn: 'front panel center, following padding/quilt texture',
            surface: 'fabric',
        };
    }
    if (n.includes('ноутбук') || n.includes('laptop')) {
        return {
            methodEn: 'UV print or laser engraving',
            placementEn: 'lid center, aligned with perspective',
            surface: 'flat',
        };
    }
    if (n.includes('powerbank') || n.includes('power bank') || n.includes('зарядк') || n.includes('флешк') || n.includes('usb')) {
        return {
            methodEn: 'laser engraving or UV pad print',
            placementEn: 'flat top face center',
            surface: 'flat',
        };
    }
    if (n.includes('колонк') || n.includes('speaker')) {
        return {
            methodEn: 'laser engraving or pad print',
            placementEn: 'front grille or flat side panel',
            surface: 'flat',
        };
    }
    if (n.includes('брелок')) {
        return {
            methodEn: 'laser engraving',
            placementEn: 'metal tag face center',
            surface: 'flat',
        };
    }
    if (n.includes('ланьярд')) {
        return {
            methodEn: 'woven jacquard or screen print',
            placementEn: 'strap below clip, repeating or single centered mark',
            surface: 'fabric',
        };
    }
    if (n.includes('зонт')) {
        return {
            methodEn: 'screen print',
            placementEn: 'outer canopy panel facing camera',
            surface: 'fabric',
        };
    }
    if (n.includes('коврик')) {
        return {
            methodEn: 'sublimation print',
            placementEn: 'top surface corner or center, lying flat',
            surface: 'flat',
        };
    }
    if (n.includes('органайзер')) {
        return {
            methodEn: 'pad print or laser mark',
            placementEn: 'front tray lip center',
            surface: 'flat',
        };
    }
    if (n.includes('визитниц') || n.includes('картхолдер') || n.includes('card holder')) {
        return {
            methodEn: 'deboss or foil stamp',
            placementEn: 'front leather panel center',
            surface: 'flat',
        };
    }
    if (n.includes('подставк') || n.includes('держатель')) {
        return {
            methodEn: 'laser engraving',
            placementEn: 'front wooden face center',
            surface: 'flat',
        };
    }
    if (n.includes('welcome') ||
        n.includes('onboarding') ||
        n.includes('подарочн') ||
        n.includes('коробк') ||
        n.includes('kit') ||
        n.includes('выращив')) {
        return {
            methodEn: 'foil stamp or spot UV on packaging',
            placementEn: 'box lid or front panel center',
            surface: 'flat',
        };
    }
    if (n.includes('тарелк') || n.includes('ланчбокс')) {
        return {
            methodEn: 'pad print or decal',
            placementEn: 'top outer surface center',
            surface: 'flat',
        };
    }
    return {
        methodEn: surface === 'fabric' ? 'screen print' : surface === 'cylinder' ? 'wrap print' : 'pad print or laser engraving',
        placementEn: 'primary visible face center',
        surface,
    };
}
function buildPerProductLogoBrandingLine(productNameRu, index) {
    const b = getProductLogoBranding(productNameRu);
    return `Item ${index + 1} (${productNameRu}): ${b.methodEn} on ${b.placementEn}`;
}
function buildPerProductLogoBrandingBlock(productNames) {
    if (productNames.length === 0)
        return '';
    return productNames.map((name, i) => buildPerProductLogoBrandingLine(name, i)).join('; ');
}
function buildCreativeAiLogoReferencePrompt(productNames, options) {
    return buildCatalogAiLogoReferencePrompt(productNames, {
        ...options,
        refLayout: 'logo-only',
    });
}
function buildCreativeLogoApplicationPrompt(logoHint) {
    const hint = logoHint?.trim()
        ? `Reference image is the EXACT client logo (${logoHint.trim()}). `
        : 'Reference image is the EXACT client logo file. ';
    return [
        hint,
        'MANDATORY: reproduce this exact logo visibly ON the surface of the main branded product/object in the scene.',
        'Integrate as realistic print, wrap, engraving or embroidery matching the material — NOT a sticker, NOT floating overlay, NOT watermark, NO black square behind logo.',
        'NEVER invent a different emblem or paste the reference as a floating semi-transparent layer.',
        'NEVER place the logo as a large centered emblem, standalone graphic, floating panel or background element in the middle of the frame — it must sit on a product surface only.',
        'Logo readable, correct proportions, follows perspective, surface curvature and scene lighting.',
    ]
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
}
exports.CATALOG_LOGO_NEGATIVE_PROMPT = 'unbranded products, blank product surfaces, missing logo on products, clean products without logo, floating logos, logo stickers in air, flat pasted logo overlay, photoshop logo stamp, identical logo copy on every surface, wireframe logo, dotted logo outline, sketch logo ghost, detached logo panels, logo rectangles in background, duplicate logo overlays, logo collage, logo badges not on products, standalone centered logo emblem, white rectangle behind logo, black square behind logo, semi-transparent logo on background, logo ghost on table, logo on gift box exterior, logo on box lid, logo on packaging cardboard, logo on foam insert, multiple duplicate logo stamps,';
exports.OPENROUTER_LOGO_REF_PREAMBLE = 'ATTACHED IMAGE: CLIENT LOGO master file (transparent PNG mark). DESIGN GUIDE ONLY — use it to know the exact logo artwork for factory printing ON product surfaces (merchandise items only). FORBIDDEN: reproducing this image on gift box exterior, box lid, inner box walls, table, background, or as separate graphics, corner stickers, watermarks, floating panels, semi-transparent overlays, or duplicate logo stamps anywhere in the scene.';
exports.OPENROUTER_CATALOG_LOGO_REF_PREAMBLE = `${exports.OPENROUTER_LOGO_REF_PREAMBLE} Apply logo ONLY on visible merchandise inside the box (apparel, cap, bottle, etc.) — NEVER on the presentation box cardboard, foam insert, or packaging exterior.`;
exports.CATALOG_LOGO_AVOID_PROMPT = 'unbranded products, missing logos, floating logos in air, flat pasted logo overlays, photoshop logo stamps, wireframe logo, dotted logo outline, logo ghost in background, detached logo stickers, duplicate logo panels, white rectangle behind logo, semi-transparent logo overlay on background, logo watermark on scene,';
exports.CATALOG_LOGO_INTEGRATION_FOOTER = [
    'Client logo from the LAST reference image must appear ON every visible product as factory-applied branding — never floating, never in the background.',
    'Logo integration must respect each product material (print, embroidery, engraving, foil) — never a flat pasted photo overlay.',
    'FORBIDDEN: floating logo in empty space, duplicate logo copies between products, logo on background or table, centered standalone logo emblem, sticker in mid-air.',
].join(' ');
function catalogLogoMaterialRules() {
    return [
        'Material realism: embroidery shows thread texture and follows fabric weave; pad print conforms to curved barrels and plastics; laser engraving is recessed into metal with edge highlights; foil/deboss on notebooks catches directional light; screen print on bags sits in the fabric grain.',
        'Each imprint must follow that product\'s surface curvature, perspective, occlusion, shadows and scene lighting.',
        'FORBIDDEN: pasting the logo file as a flat 2D picture on top of products; identical copy-paste stamp on every item; floating logo; sticker overlay; white/black rectangle behind logo; watermark; logo panel in the background.',
        'The generated image must look like factory-produced branded merchandise photographed on set — not a Photoshop overlay.',
    ].join(' ');
}
function buildCatalogAiLogoReferencePrompt(productNames, options) {
    const layout = options?.refLayout ?? 'catalog-products-then-logo';
    const n = productNames.length;
    const perProduct = buildPerProductLogoBrandingBlock(productNames);
    if (layout === 'logo-only') {
        const hint = options?.logoHint?.trim()
            ? ` Logo design from reference: ${options.logoHint.trim()}.`
            : '';
        const productLines = productNames
            .map((name, i) => `Product ${i + 1} "${name}" — apply client logo as factory imprint on visible surface only.`)
            .join(' ');
        return [
            `REFERENCE IMAGE 1 is the CLIENT LOGO master file ONLY (transparent PNG mark — design guide, NOT a placement template, NOT to paste on background, table, corners or empty space).${hint}`,
            productLines,
            `Use the logo from reference 1 as the brand imprint master and INTEGRATE it physically onto each visible product in the scene — the reference must NEVER appear as its own layer in the output.`,
            perProduct ? `Per-product branding method (mandatory): ${perProduct}.` : '',
            catalogLogoMaterialRules(),
        ]
            .filter(Boolean)
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();
    }
    if (layout === 'scene-then-logo') {
        const hint = options?.logoHint?.trim()
            ? ` Logo design from reference 2: ${options.logoHint.trim()}.`
            : '';
        return [
            `REFERENCE IMAGE 1 is the CURRENT SCENE — preserve products and layout. REFERENCE IMAGE 2 is the CLIENT LOGO mark (design only — NOT a placement template).${hint}`,
            perProduct ? `Per-product branding method (mandatory): ${perProduct}.` : '',
            'Use the logo from reference 2 and INTEGRATE it physically onto each visible product in the scene.',
            catalogLogoMaterialRules(),
        ]
            .filter(Boolean)
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();
    }
    const logoRefNum = n + 1;
    const hint = options?.logoHint?.trim()
        ? ` Logo design from ref ${logoRefNum}: ${options.logoHint.trim()}.`
        : '';
    const productLines = productNames.map((name, i) => `Ref ${i + 1} "${name}" — clean catalog photo (shape, color, material only; ignore stock branding on photo).`);
    return [
        `REFERENCE IMAGES ORDER: refs 1–${n} are UNBRANDED catalog product photos; ref ${logoRefNum} is the CLIENT LOGO mark (transparent PNG, design only — NOT a placement template).${hint}`,
        productLines.join(' '),
        `Use the logo from ref ${logoRefNum} as the brand imprint master and INTEGRATE it physically onto each visible merchandise item in the scene — NEVER on the gift box exterior, lid, inner walls, foam or table.`,
        `Per-product branding method (mandatory): ${perProduct}.`,
        catalogLogoMaterialRules(),
    ]
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
}
function buildLogoApplicationPrompt(productNames, options) {
    if (!options?.hasLogo) {
        return 'Unbranded products with clean blank surfaces, no logos, no text.';
    }
    if (productNames.length === 0) {
        return buildCreativeLogoApplicationPrompt(options.logoHint);
    }
    const perProduct = buildPerProductLogoBrandingBlock(productNames);
    const hint = options.logoHint?.trim()
        ? `Use EXACT client logo from reference (${options.logoHint.trim()}). `
        : 'Use EXACT client logo from reference image. ';
    return [
        hint,
        `LOGO ON EVERY LISTED PRODUCT — per-item application: ${perProduct}.`,
        `Render exactly ${productNames.length} logo imprints total — one per listed product, zero extra logos.`,
        'Integrated into material (print/engrave/embroidery), NOT a sticker, NOT floating overlay, NOT a separate logo panel in the scene, NO black square behind logo.',
        'The logo reference image is ONLY a design guide — apply the mark ON each product surface; never render it as a floating object or background element.',
        'If a product area is not visible, keep logo hidden on that product rather than adding extra logo elsewhere in the scene.',
        'Logo follows surface curvature, perspective and scene lighting; sharp edges, realistic depth.',
    ]
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
}
function stripBlankLogoPhrases(prompt) {
    return prompt
        .replace(/\bblank\s+(space|area|spot)\s+for\s+logo\b/gi, '')
        .replace(/\bleave\s+(a\s+)?(flat\s+)?(area|space|spot)\s+for\s+logo\b/gi, '')
        .replace(/\b(unbranded|no\s+logo|without\s+logo)\b/gi, '')
        .replace(/\b(generic|abstract|placeholder|sample|fake)\s+(logo|emblem|icon|monogram|symbol)\b/gi, '')
        .replace(/\b(cube|box|3d)\s+(logo|emblem|icon)\b/gi, '')
        .replace(/\binvent(ed|ing)?\s+(a\s+)?(logo|emblem|branding)\b/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
}
//# sourceMappingURL=product-logo-branding.util.js.map
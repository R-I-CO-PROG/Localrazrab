"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hexToColorDescription = hexToColorDescription;
exports.isNeutralHex = isNeutralHex;
exports.assignBrandColorsToProducts = assignBrandColorsToProducts;
exports.formatPerProductColorAssignments = formatPerProductColorAssignments;
exports.formatBrandPalettePrompt = formatBrandPalettePrompt;
exports.buildPaletteComplianceNegative = buildPaletteComplianceNegative;
exports.enforceBrandColorsInPrompt = enforceBrandColorsInPrompt;
exports.colorizeProductDescription = colorizeProductDescription;
const HEX_PRESETS = {
    ffffff: 'white',
    fff: 'white',
    '1a1a1a': 'charcoal black',
    '000000': 'black',
    '3b82f6': 'royal blue',
    '7c5cfc': 'violet purple',
    '22c55e': 'green',
    '9ca3af': 'neutral gray',
};
function normalizeHex(hex) {
    const raw = hex.replace('#', '').trim().toLowerCase();
    return raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw.padStart(6, '0').slice(0, 6);
}
function hexToColorDescription(hex, opts) {
    const h = normalizeHex(hex);
    const preset = HEX_PRESETS[h];
    let result;
    if (preset) {
        result = `${preset} ${hex.toUpperCase()}`;
    }
    else {
        const r = parseInt(h.slice(0, 2), 16);
        const g = parseInt(h.slice(2, 4), 16);
        const b = parseInt(h.slice(4, 6), 16);
        if (r > 200 && g < 80 && b < 80)
            result = `red ${hex.toUpperCase()}`;
        else if (b > r + 40 && b > g + 20)
            result = `blue ${hex.toUpperCase()}`;
        else if (g > r + 30 && g > b + 20)
            result = `green ${hex.toUpperCase()}`;
        else if (r > 180 && g > 180 && b < 100)
            result = `yellow ${hex.toUpperCase()}`;
        else if (r > 160 && b > 160 && g < 120)
            result = `purple ${hex.toUpperCase()}`;
        else if (r > 200 && g > 100 && b < 80)
            result = `orange ${hex.toUpperCase()}`;
        else
            result = `color ${hex.toUpperCase()} rgb(${r},${g},${b})`;
    }
    if (!opts?.omitHex)
        return result;
    return result
        .replace(/\s*#[0-9A-F]{3,8}\b/gi, '')
        .replace(/\brgb\(\d+,\s*\d+,\s*\d+\)/gi, '')
        .trim();
}
function isNeutralHex(hex) {
    const h = normalizeHex(hex);
    const preset = HEX_PRESETS[h];
    if (preset && /white|black|charcoal|gray|grey/.test(preset))
        return true;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const saturation = max === 0 ? 0 : (max - min) / max;
    return saturation < 0.14;
}
function bodyColorPriority(hex) {
    if (!isNeutralHex(hex))
        return 0;
    const h = normalizeHex(hex);
    if (h === 'ffffff')
        return 2;
    if (HEX_PRESETS[h]?.includes('gray'))
        return 3;
    if (h === '000000' || h === '1a1a1a')
        return 4;
    return 3;
}
function assignBrandColorsToProducts(colors, productCount) {
    const list = (colors ?? []).filter(Boolean);
    if (list.length === 0 || productCount === 0) {
        return Array.from({ length: productCount }, () => undefined);
    }
    const sorted = [...list].sort((a, b) => bodyColorPriority(a) - bodyColorPriority(b));
    return Array.from({ length: productCount }, (_, i) => sorted[i % sorted.length]);
}
function formatPerProductColorAssignments(productNames, colors) {
    if (productNames.length === 0)
        return '';
    const assigned = assignBrandColorsToProducts(colors, productNames.length);
    if (!assigned.some(Boolean))
        return '';
    const lines = productNames.map((name, i) => {
        const hex = assigned[i];
        if (!hex)
            return '';
        return `${name} → body/finish ${hexToColorDescription(hex, { omitHex: true })}`;
    });
    const valid = lines.filter(Boolean);
    if (valid.length === 0)
        return '';
    return [
        'Per-product brand colors MANDATORY:',
        valid.join('; ') + '.',
        'Each item MUST use its assigned hex on the product body — do NOT paint every product the same black.',
    ].join(' ');
}
function formatBrandPalettePrompt(colors, opts) {
    const list = (colors ?? []).filter(Boolean).slice(0, 6);
    if (list.length === 0)
        return '';
    const described = list.map((hex, i) => {
        const role = i === 0 ? 'primary' : i === 1 ? 'secondary' : 'accent';
        return `${role} ${hexToColorDescription(hex, { omitHex: true })}`;
    });
    if (opts?.creative) {
        const chromatic = list.filter((c) => !isNeutralHex(c));
        const accentHint = chromatic.length > 0
            ? `Use ${chromatic.map((c) => hexToColorDescription(c, { omitHex: true })).join(' and ')} on main subjects, props and scene accents.`
            : 'Apply palette across the scene — lighting, surfaces and key objects.';
        return [
            `Brand palette REQUIRED: ${described.join(', ')}.`,
            accentHint,
            'Apply as paint, material finish and lighting only — NEVER print hex codes, RGB values or color labels as visible text on products.',
        ].join(' ');
    }
    const chromatic = list.filter((c) => !isNeutralHex(c));
    const varietyRule = list.length > 1
        ? 'Distribute palette across different products — never monochrome all-black when purple, blue or other chromatic colors are selected.'
        : '';
    if (list.length === 1) {
        return [
            `Brand palette REQUIRED: ${described[0]}.`,
            'Tint product bodies, trims and studio rim lighting with this exact color.',
            'NOT generic grey unless primary is grey.',
        ].join(' ');
    }
    if (list.length === 2) {
        return [
            `Brand palette REQUIRED: ${described[0]} and ${described[1]}.`,
            chromatic.length > 0
                ? 'Use chromatic color on at least half of product bodies; neutrals only on remaining items or trims.'
                : 'Split colors across products — not one uniform shade on every item.',
            varietyRule,
            `Exact hex only: ${list.join(', ')}.`,
        ]
            .filter(Boolean)
            .join(' ');
    }
    return [
        `Brand palette REQUIRED: ${described.join(', ')}.`,
        chromatic.length > 0
            ? `Prioritize ${chromatic.map((c) => hexToColorDescription(c)).join(' and ')} on product bodies; use black/white/gray only where assigned per product.`
            : 'Use each palette color on different products in the set.',
        varietyRule,
        `Exact hex only: ${list.join(', ')}. Do NOT invent lime green, orange or unrelated hues.`,
    ]
        .filter(Boolean)
        .join(' ');
}
function buildPaletteComplianceNegative(colors) {
    const list = (colors ?? []).filter(Boolean);
    if (list.length < 2)
        return '';
    const hasChromatic = list.some((c) => !isNeutralHex(c));
    if (!hasChromatic)
        return '';
    return [
        'all products same black color, monochrome black merchandise set, uniform black on every item,',
        'ignoring brand palette, wrong product colors, greyscale when brand has purple or color,',
    ].join(' ');
}
function enforceBrandColorsInPrompt(prompt, colors, productNames) {
    const perProduct = productNames && productNames.length > 0 && (colors?.length ?? 0) > 0
        ? formatPerProductColorAssignments(productNames, colors)
        : '';
    const block = formatBrandPalettePrompt(colors);
    if ((colors?.length ?? 0) > 1 && perProduct) {
        return `${perProduct} ${block} ${prompt.trim()}`.replace(/\s+/g, ' ').trim();
    }
    if (!block)
        return prompt.trim();
    const lower = prompt.toLowerCase();
    const hasHex = (colors ?? []).some((c) => lower.includes(c.toLowerCase().replace('#', '')));
    const hasColorWord = /blue|violet|purple|green|red|brand palette|brand color|rgb\(/i.test(prompt);
    if (hasHex || hasColorWord)
        return prompt.trim();
    return `${block} ${prompt.trim()}`.replace(/\s+/g, ' ').trim();
}
function colorizeProductDescription(descriptionEn, productHex) {
    if (!productHex)
        return descriptionEn;
    const colorDesc = hexToColorDescription(productHex, { omitHex: true });
    const shortColor = colorDesc.split(' ').slice(0, 2).join(' ');
    return descriptionEn
        .replace(/\bmatte black\b/gi, `matte ${colorDesc}`)
        .replace(/\bcompact black\b/gi, `compact ${colorDesc}`)
        .replace(/\bpremium black\b/gi, `premium ${colorDesc}`)
        .replace(/\belegant black\b/gi, `elegant ${colorDesc}`)
        .replace(/\bminimal black\b/gi, `minimal ${colorDesc}`)
        .replace(/\bstructured\b/gi, 'structured')
        .replace(/\bblack\b/gi, shortColor)
        .replace(/\bcharcoal\b/gi, shortColor);
}
//# sourceMappingURL=brand-colors.util.js.map
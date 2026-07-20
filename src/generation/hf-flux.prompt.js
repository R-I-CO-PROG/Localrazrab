"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildHfFluxPrompt = buildHfFluxPrompt;
const product_visual_en_util_1 = require("./product-visual-en.util");
const brand_colors_util_1 = require("./brand-colors.util");
function buildHfFluxPrompt(snapshot, scenePrompt) {
    const names = snapshot.productNames ?? [];
    const count = names.length;
    const assigned = (0, brand_colors_util_1.assignBrandColorsToProducts)(snapshot.colors, count);
    const itemsEn = names
        .map((n, i) => (0, brand_colors_util_1.colorizeProductDescription)((0, product_visual_en_util_1.describeProductEn)(n), assigned[i]))
        .join(', ');
    const brief = snapshot.userPrompt?.trim().slice(0, 60);
    const palette = (0, brand_colors_util_1.formatBrandPalettePrompt)(snapshot.colors);
    const perProduct = (0, brand_colors_util_1.formatPerProductColorAssignments)(names, snapshot.colors);
    const parts = [
        palette,
        perProduct,
        'Ultra photorealistic corporate merchandise product photo, 8k studio.',
        count > 0 ? `Exactly ${count} items: ${itemsEn}.` : 'Corporate branded gift set.',
        'Each product in assigned brand color; soft directional studio lighting, realistic materials.',
        brief ? `Mood: ${brief}.` : '',
    ];
    if (scenePrompt?.trim()) {
        parts.push((0, brand_colors_util_1.enforceBrandColorsInPrompt)(scenePrompt.trim(), snapshot.colors).slice(0, 180));
    }
    return parts
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 480);
}
//# sourceMappingURL=hf-flux.prompt.js.map
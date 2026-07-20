"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveAllowedTargetColor = resolveAllowedTargetColor;
exports.catalogColorNames = catalogColorNames;
exports.buildCatalogProductColorSpecs = buildCatalogProductColorSpecs;
exports.formatCatalogColorRulesForPrompt = formatCatalogColorRulesForPrompt;
exports.formatCatalogColorRulesShort = formatCatalogColorRulesShort;
exports.catalogColorNegativePromptAddendum = catalogColorNegativePromptAddendum;
function normalizeColorText(value) {
    return value.toLowerCase().replace(/ё/g, 'е').trim();
}
function colorTokensMatch(a, b) {
    const x = normalizeColorText(a);
    const y = normalizeColorText(b);
    if (!x || !y)
        return false;
    if (x === y || x.includes(y) || y.includes(x))
        return true;
    const stem = (s) => s.slice(0, Math.min(4, s.length));
    return stem(x).length >= 3 && (x.includes(stem(y)) || y.includes(stem(x)));
}
function resolveAllowedTargetColor(catalogColors, targetColor) {
    const target = targetColor?.trim();
    if (!target)
        return undefined;
    const match = catalogColors.find((c) => colorTokensMatch(c, target));
    return match;
}
function catalogColorNames(product) {
    return (product.colors ?? [])
        .map((c) => (typeof c === 'string' ? c : c.name ?? ''))
        .filter(Boolean);
}
function buildCatalogProductColorSpecs(products, targetByProductId = {}) {
    return products.map((p) => {
        const catalogColors = catalogColorNames(p);
        const targetColor = resolveAllowedTargetColor(catalogColors, targetByProductId[p.id]);
        return { name: p.name, catalogColors, targetColor };
    });
}
function formatCatalogColorRulesForPrompt(specs) {
    if (!specs.length)
        return '';
    const perProduct = specs.map((s, i) => {
        const allowed = s.catalogColors.length > 0 ? s.catalogColors.join(', ') : 'as shown in reference photo';
        if (s.targetColor) {
            return `Product ${i + 1} "${s.name}": render in ${s.targetColor}. Reference photo may show another catalog variant — recolor ONLY to ${s.targetColor} because it is listed for this SKU. Allowed colors for this product: ${allowed}`;
        }
        return `Product ${i + 1} "${s.name}": match reference photo color and material. Allowed catalog colors for this SKU: ${allowed}. Do NOT recolor to any color outside this list`;
    });
    return [
        'Catalog color rule: NEVER paint a product in a color that is NOT listed in its allowed catalog colors.',
        'Recoloring from the reference photo is ALLOWED only when the target color is explicitly listed for that same SKU (multi-variant products).',
        ...perProduct,
    ].join('. ');
}
function formatCatalogColorRulesShort(specs) {
    return specs
        .map((s) => {
        const allowed = s.catalogColors.join(', ') || 'reference only';
        return s.targetColor
            ? `"${s.name}" → ${s.targetColor} (listed variant; allowed: ${allowed})`
            : `"${s.name}" → keep reference color (allowed: ${allowed})`;
    })
        .join('; ');
}
function catalogColorNegativePromptAddendum() {
    return 'recolor to unlisted colors, wrong variant color, brand palette recolor, colors not in SKU catalog list';
}
//# sourceMappingURL=catalog-product-color-rules.util.js.map
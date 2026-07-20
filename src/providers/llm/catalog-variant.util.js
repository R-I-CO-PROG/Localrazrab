"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.productVariantKey = productVariantKey;
exports.indexCatalogByName = indexCatalogByName;
exports.pickBestColorVariant = pickBestColorVariant;
exports.dedupeProductsByVariant = dedupeProductsByVariant;
exports.upgradeToBrandColorVariants = upgradeToBrandColorVariants;
exports.isVariantBlocked = isVariantBlocked;
const catalog_color_match_util_1 = require("./catalog-color-match.util");
const COLOR_TOKEN_RE = /\b(?:ч[её]рн\w*|бел\w*|сер\w*|красн\w*|син\w*|голуб\w*|зелен\w*|ж[её]лт\w*|оранж\w*|розов\w*|фиолет\w*|коричн\w*|бежев\w*|индиго|молочн\w*|бордов\w*|бордо|navy|grey|gray|white|black|blue|red|green|yellow|orange|pink|beige|cream)\b/giu;
function stripColorTokens(name) {
    let result = name.trim();
    const trailingColor = /,\s*(?:ч[её]рн[а-яё]*|бел[а-яё]*|сер[а-яё]*|красн[а-яё]*|син[а-яё]*|голуб[а-яё]*|зелен[а-яё]*|ж[её]лт[а-яё]*|оранж[а-яё]*|розов[а-яё]*|фиолет[а-яё]*|коричн[а-яё]*|бежев[а-яё]*|индиго|молочн[а-яё]*|бордов[а-яё]*|бордо|grey|gray|white|black|blue|red|green|yellow|orange|pink|beige|cream)\s*$/iu;
    while (trailingColor.test(result)) {
        result = result.replace(trailingColor, '');
    }
    return result.replace(/\s+/g, ' ').trim();
}
function normalizeBaseName(name) {
    return stripColorTokens(name.trim().toLowerCase().replace(/\s+/g, ' '));
}
function productVariantKey(product) {
    const nameKey = normalizeBaseName(product.name);
    if (product.externalId) {
        const base = product.externalId
            .toLowerCase()
            .replace(/-{1,2}\d{2,4}-\d{1,3}$/, '')
            .replace(/-\d{1,3}$/, '')
            .replace(/[-_](?:bl|wh|rd|blu|gr|gy|bk|or|yl|pk|pp|nv|bg|br)\d*$/i, '');
        if (base.length >= 8 && base !== product.externalId.toLowerCase()) {
            return `${product.sourceId ?? 'cat'}::${base}`;
        }
    }
    return nameKey.length >= 6 ? nameKey : product.name.trim().toLowerCase().replace(/\s+/g, ' ');
}
function indexCatalogByName(catalog) {
    const map = new Map();
    for (const p of catalog) {
        const key = p.name.trim().toLowerCase();
        const list = map.get(key) ?? [];
        list.push(p);
        map.set(key, list);
    }
    return map;
}
function pickBestColorVariant(candidates, brandColors = []) {
    if (candidates.length <= 1)
        return candidates[0];
    const scored = candidates.map((p) => ({
        product: p,
        score: brandColors.length > 0
            ? (0, catalog_color_match_util_1.scoreBrandColorMatch)(p, brandColors) * 1_000 + (p.stockAvailable ?? 0) / 100
            : (p.stockAvailable ?? 0) + (0, catalog_color_match_util_1.scoreBrandColorMatch)(p, brandColors),
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored[0].product;
}
function dedupeProductsByVariant(products, excludeVariantKeys = new Set()) {
    const seen = new Set(excludeVariantKeys);
    const result = [];
    for (const p of products) {
        const key = productVariantKey(p);
        if (seen.has(key))
            continue;
        seen.add(key);
        result.push(p);
    }
    return result;
}
function upgradeToBrandColorVariants(products, catalog, brandColors = []) {
    if (!brandColors.length || !products.length)
        return products;
    const variantGroups = new Map();
    for (const p of catalog) {
        const vk = productVariantKey(p);
        const list = variantGroups.get(vk) ?? [];
        list.push(p);
        variantGroups.set(vk, list);
    }
    return products.map((p) => {
        const group = variantGroups.get(productVariantKey(p));
        if (!group || group.length <= 1)
            return p;
        return pickBestColorVariant(group, brandColors);
    });
}
function isVariantBlocked(product, blockedIds, blockedVariants) {
    return blockedIds.has(product.id) || blockedVariants.has(productVariantKey(product));
}
//# sourceMappingURL=catalog-variant.util.js.map
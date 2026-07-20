"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractColorHintsFromText = extractColorHintsFromText;
exports.detectProductTypeRules = detectProductTypeRules;
exports.productMatchesHintType = productMatchesHintType;
exports.detectProductTypesFromAddHint = detectProductTypesFromAddHint;
exports.hasExplicitProductTypeHint = hasExplicitProductTypeHint;
exports.productMatchesAddHint = productMatchesAddHint;
exports.resolveEffectiveAddColors = resolveEffectiveAddColors;
exports.productMatchesHintColors = productMatchesHintColors;
exports.localSuggestProductsForAdd = localSuggestProductsForAdd;
exports.filterCatalogForProductAdd = filterCatalogForProductAdd;
exports.buildCatalogCandidatesForProductAdd = buildCatalogCandidatesForProductAdd;
exports.mergeHintColorsWithBrand = mergeHintColorsWithBrand;
exports.parseProductAddReasons = parseProductAddReasons;
exports.buildProductAddReason = buildProductAddReason;
const catalog_filter_util_1 = require("./catalog-filter.util");
const catalog_color_match_util_1 = require("./catalog-color-match.util");
const concept_diversity_util_1 = require("./concept-diversity.util");
const catalog_variant_util_1 = require("./catalog-variant.util");
const HINT_COLOR_PATTERNS = [
    { label: 'сер', patterns: ['сер', 'grey', 'gray', 'графит', 'graphite'] },
    { label: 'син', patterns: ['син', 'blue', 'navy', 'кобальт'] },
    { label: 'бел', patterns: ['бел', 'white'] },
    { label: 'черн', patterns: ['черн', 'black'] },
    { label: 'красн', patterns: ['красн', 'red'] },
    { label: 'зелен', patterns: ['зелен', 'green'] },
    { label: 'фиолет', patterns: ['фиолет', 'purple', 'violet'] },
    { label: 'желт', patterns: ['желт', 'yellow'] },
    { label: 'оранж', patterns: ['оранж', 'orange'] },
    { label: 'крем', patterns: ['крем', 'beige', 'cream', 'экрю'] },
    { label: 'коричн', patterns: ['коричн', 'brown'] },
];
const PRODUCT_TYPE_RULES = [
    {
        slug: 'sunglasses',
        hintPatterns: ['очк', 'sunglass', 'eyewear', 'солнцезащит'],
        skuPatterns: /(?:солнцезащитн?[а-я]*\s*)?очки(?:[а-я]*)?|sunglass|eyewear|солнцезащит/i,
        skuExclude: /кепк|бейсболк|панам|bucket|baseball|головн|сумочк|кошел|планшет/i,
    },
    {
        slug: 'cap',
        hintPatterns: ['кепк', 'бейсболк', 'cap'],
        skuPatterns: /кепк|бейсболк|baseball cap/i,
    },
    {
        slug: 'bucket_hat',
        hintPatterns: ['панам', 'bucket'],
        skuPatterns: /панам|bucket/i,
    },
    {
        slug: 'mug',
        hintPatterns: ['чаш', 'круж', 'cup', 'mug'],
        skuPatterns: /чаш|круж|стакан|mug|cup|термокруж/i,
    },
    {
        slug: 'pen',
        hintPatterns: ['ручк', 'pen'],
        skuPatterns: /ручк|pen|письм/i,
    },
    {
        slug: 'notebook',
        hintPatterns: ['блокнот', 'ежедневник', 'notebook'],
        skuPatterns: /блокнот|ежедневник|notebook|дневник/i,
    },
    {
        slug: 'backpack',
        hintPatterns: ['рюкзак', 'backpack'],
        skuPatterns: /рюкзак|backpack/i,
    },
    {
        slug: 'shopper',
        hintPatterns: ['шоппер', 'сумк', 'bag'],
        skuPatterns: /шоппер|сумк|bag|тоут/i,
    },
    {
        slug: 'thermos',
        hintPatterns: ['термос', 'бутыл', 'flask'],
        skuPatterns: /термос|бутыл|flask|пить/i,
    },
    {
        slug: 'tshirt',
        hintPatterns: ['футбол', 'худи', 'одежд', 'polo', 'оверсайз', 'мерч'],
        skuPatterns: /футбол|худи|polo|одежд|толстов|оверсайз/i,
    },
    {
        slug: 'raincoat',
        hintPatterns: ['дождевик', 'ветровк', 'raincoat'],
        skuPatterns: /дождевик|ветровк|raincoat|poncho/i,
    },
    {
        slug: 'blanket',
        hintPatterns: ['плед', 'полотен'],
        skuPatterns: /плед|полотен|towel|blanket/i,
    },
    {
        slug: 'powerbank',
        hintPatterns: ['powerbank', 'заряд', 'usb'],
        skuPatterns: /powerbank|power bank|заряд|usb|аккумулятор/i,
    },
    {
        slug: 'umbrella',
        hintPatterns: ['зонт'],
        skuPatterns: /зонт|umbrella/i,
    },
];
function normalizeText(text) {
    return text.toLowerCase().replace(/ё/g, 'е');
}
function productSearchText(product) {
    return normalizeText(`${product.name} ${product.description ?? ''} ${product.subcategory ?? ''}`);
}
function extractColorHintsFromText(text) {
    const t = normalizeText(text);
    const found = [];
    for (const { label, patterns } of HINT_COLOR_PATTERNS) {
        if (patterns.some((p) => t.includes(p)))
            found.push(label);
    }
    return found;
}
function detectProductTypeRules(hint) {
    const t = normalizeText(hint);
    return PRODUCT_TYPE_RULES.filter((rule) => rule.hintPatterns.some((p) => t.includes(p))).map((rule) => rule.skuPatterns);
}
function productMatchesTypeRule(product, rule) {
    const text = productSearchText(product);
    if (!rule.skuPatterns.test(text))
        return false;
    if (rule.skuExclude?.test(text))
        return false;
    return true;
}
function productMatchesHintType(product, hint) {
    const t = normalizeText(hint);
    const rules = PRODUCT_TYPE_RULES.filter((rule) => rule.hintPatterns.some((p) => t.includes(p)));
    if (!rules.length)
        return true;
    return rules.some((rule) => productMatchesTypeRule(product, rule));
}
function detectProductTypesFromAddHint(hint) {
    const fromBrief = (0, concept_diversity_util_1.detectMandatoryConceptTypesFromBrief)(hint);
    if (fromBrief.length)
        return fromBrief;
    const t = normalizeText(hint);
    const slugs = PRODUCT_TYPE_RULES.filter((rule) => rule.hintPatterns.some((p) => t.includes(p))).map((rule) => rule.slug);
    return [...new Set(slugs)];
}
function hasExplicitProductTypeHint(hint) {
    return detectProductTypesFromAddHint(hint).length > 0;
}
function productMatchesAddHint(product, hint) {
    const types = detectProductTypesFromAddHint(hint);
    if (types.length) {
        return types.includes((0, concept_diversity_util_1.detectConceptProductType)(product));
    }
    const rules = detectProductTypeRules(hint);
    if (rules.length) {
        return productMatchesHintType(product, hint);
    }
    const tokens = normalizeText(hint)
        .split(/[^\p{L}\p{N}]+/u)
        .filter((t) => t.length >= 3);
    if (!tokens.length)
        return true;
    const text = productSearchText(product);
    return tokens.some((t) => text.includes(t));
}
function resolveEffectiveAddColors(hint, projectColors) {
    const hintColors = extractColorHintsFromText(hint);
    if (hintColors.length > 0)
        return hintColors;
    return projectColors.filter(Boolean);
}
function productColorText(product) {
    return (product.colors ?? [])
        .map((c) => (typeof c === 'string' ? c : c.name ?? ''))
        .join(' ')
        .toLowerCase();
}
function productMatchesHintColors(product, hintColorLabels) {
    if (!hintColorLabels.length)
        return false;
    const colors = productColorText(product);
    return hintColorLabels.some((label) => colors.includes(label));
}
function scoreForAddHint(product, hint, base) {
    if (!productMatchesAddHint(product, hint))
        return -500;
    let score = (0, catalog_filter_util_1.scoreProductForBrief)(product, { ...base, userPrompt: hint, allowedItems: [], forbiddenItems: [] });
    const hintNorm = normalizeText(hint);
    const name = normalizeText(product.name);
    if (name.includes(hintNorm) || hintNorm.split(/\s+/).some((t) => t.length >= 3 && name.includes(t))) {
        score += 40;
    }
    score += (0, catalog_color_match_util_1.scoreBrandColorMatch)(product, base.colors);
    const hintColors = extractColorHintsFromText(hint);
    if (hintColors.length && productMatchesHintColors(product, hintColors)) {
        score += 15;
    }
    return score;
}
function localSuggestProductsForAdd(catalog, hint, input, count, excludeVariantKeys) {
    let pool = catalog.filter((p) => !excludeVariantKeys.has((0, catalog_variant_util_1.productVariantKey)(p)));
    const byHint = pool.filter((p) => productMatchesAddHint(p, hint));
    if (byHint.length > 0)
        pool = byHint;
    const scored = pool
        .map((product) => ({ product, score: scoreForAddHint(product, hint, input) }))
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score || (b.product.stockAvailable ?? 0) - (a.product.stockAvailable ?? 0));
    const picked = [];
    const seenVariants = new Set();
    for (const { product } of scored) {
        const vk = (0, catalog_variant_util_1.productVariantKey)(product);
        if (seenVariants.has(vk))
            continue;
        picked.push(product);
        seenVariants.add(vk);
        if (picked.length >= count)
            break;
    }
    return picked;
}
function filterCatalogForProductAdd(catalog, quantity) {
    const tirage = quantity ?? 0;
    if (tirage <= 0)
        return catalog;
    const withStock = catalog.filter((p) => (p.stockAvailable ?? 0) >= tirage);
    return withStock.length > 0 ? withStock : catalog;
}
async function buildCatalogCandidatesForProductAdd(catalog, hint, input, maxItems = 100) {
    let pool = catalog;
    const byHint = pool.filter((p) => productMatchesAddHint(p, hint));
    if (byHint.length > 0)
        pool = byHint;
    const slimInput = {
        ...input,
        userPrompt: hint,
        allowedItems: [],
        forbiddenItems: [],
        budgetMin: null,
        budgetMax: null,
    };
    return await (0, catalog_filter_util_1.shortlistCatalogForLlm)(pool, slimInput, maxItems);
}
function mergeHintColorsWithBrand(hint, brandColors) {
    return resolveEffectiveAddColors(hint, brandColors);
}
function parseProductAddReasons(composition) {
    if (!composition?.trim())
        return [];
    try {
        const parsed = JSON.parse(composition);
        if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string'))
            return parsed;
    }
    catch {
    }
    return [composition];
}
function buildProductAddReason(product, hint, llmReason) {
    const name = product.name;
    const hintNorm = normalizeText(hint);
    const type = (0, concept_diversity_util_1.detectConceptProductType)(product);
    if (llmReason && productMatchesAddHint(product, hint) && !/имеет цвет|#([0-9a-f]{3,8})/i.test(llmReason)) {
        return llmReason;
    }
    if (type === 'sunglasses' || /очк/i.test(name)) {
        return `Солнцезащитные очки из каталога — под запрос «${hint.trim()}».`;
    }
    if (name.toLowerCase().includes(hintNorm)) {
        return `Подходит под запрос «${hint.trim()}».`;
    }
    return `Подобрано по запросу «${hint.trim()}» из каталога.`;
}
//# sourceMappingURL=product-add-suggest.util.js.map
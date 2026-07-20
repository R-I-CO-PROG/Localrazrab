"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.filterCatalogByBlacklist = filterCatalogByBlacklist;
exports.isClothingProductName = isClothingProductName;
exports.promptRequestsClothing = promptRequestsClothing;
exports.filterCatalogByConstraints = filterCatalogByConstraints;
exports.resolveLlmProductSelection = resolveLlmProductSelection;
exports.pickDefaultProducts = pickDefaultProducts;
exports.stubPickProductsFromBrief = stubPickProductsFromBrief;
const parse_desired_count_1 = require("./parse-desired-count");
const brief_category_buckets_util_1 = require("../../catalog/brief-category-buckets.util");
const catalog_variant_util_1 = require("./catalog-variant.util");
const concept_diversity_util_1 = require("./concept-diversity.util");
function filterCatalogByBlacklist(catalog, productIds = [], supplierIds = []) {
    if (!productIds.length && !supplierIds.length)
        return catalog;
    const blockedProducts = new Set(productIds);
    const blockedSuppliers = new Set(supplierIds);
    const filtered = catalog.filter((p) => {
        if (blockedProducts.has(p.id))
            return false;
        if (p.sourceId && blockedSuppliers.has(p.sourceId))
            return false;
        return true;
    });
    return filtered.length > 0 ? filtered : catalog;
}
const CLOTHING_NAME_PREFIXES = [
    'Футболка',
    'Поло',
    'Худи',
    'Свитшот',
    'Кепка',
    'Бини',
    'Носки',
];
function isClothingProductName(name) {
    const lower = name.toLowerCase();
    return CLOTHING_NAME_PREFIXES.some((prefix) => lower.startsWith(prefix.toLowerCase()));
}
const CLOTHING_PROMPT_KEYWORDS = [
    'одежд',
    'clothing',
    'apparel',
    'wear',
    'футболк',
    'tshirt',
    't-shirt',
    'худи',
    'hoodie',
    'свитшот',
    'кепк',
    'cap',
    'бини',
    'beanie',
    'поло',
    'polo',
    'носк',
    'шарф',
    'scarf',
    'мерч',
    'merch',
];
function promptRequestsClothing(userPrompt) {
    const text = userPrompt.toLowerCase();
    return CLOTHING_PROMPT_KEYWORDS.some((k) => text.includes(k));
}
const MUG_KEYWORDS = ['кружк', 'стакан', 'термокруж', 'термос', 'бамбуков'];
function filterCatalogByConstraints(catalog, allowedItems, forbiddenItems) {
    return (0, brief_category_buckets_util_1.filterCatalogByBriefBuckets)(catalog, allowedItems, forbiddenItems);
}
function isMugProduct(name) {
    const lower = name.toLowerCase();
    return MUG_KEYWORDS.some((k) => lower.includes(k));
}
function resolveLlmProductSelection(llmItems, catalog, userProductNames, respectUserSelection, desiredCount, strictCount = false, options) {
    const targetCount = desiredCount ?? (0, parse_desired_count_1.defaultItemCount)('');
    const byName = (0, catalog_variant_util_1.indexCatalogByName)(catalog);
    const excludeVariants = options?.excludeVariantKeys ?? new Set();
    const brandColors = options?.brandColors ?? [];
    if (userProductNames.length > 0) {
        const picked = [];
        const seenVariants = new Set(excludeVariants);
        for (const name of userProductNames) {
            const candidates = byName.get(name.toLowerCase()) ?? [];
            const available = candidates.filter((p) => !seenVariants.has((0, catalog_variant_util_1.productVariantKey)(p)));
            if (available.length) {
                const product = (0, catalog_variant_util_1.pickBestColorVariant)(available, brandColors);
                picked.push(product);
                seenVariants.add((0, catalog_variant_util_1.productVariantKey)(product));
            }
        }
        if (picked.length > 0)
            return (0, catalog_variant_util_1.dedupeProductsByVariant)(picked).slice(0, targetCount);
    }
    const picked = [];
    const seenIds = new Set();
    const seenVariants = new Set(excludeVariants);
    for (const item of llmItems) {
        if (typeof item !== 'string')
            continue;
        const candidates = byName.get(item.trim().toLowerCase()) ?? [];
        const available = candidates.filter((p) => !seenIds.has(p.id) && !seenVariants.has((0, catalog_variant_util_1.productVariantKey)(p)));
        if (!available.length)
            continue;
        const product = (0, catalog_variant_util_1.pickBestColorVariant)(available, brandColors);
        picked.push(product);
        seenIds.add(product.id);
        seenVariants.add((0, catalog_variant_util_1.productVariantKey)(product));
    }
    if (picked.length > 0) {
        let result = (0, catalog_variant_util_1.dedupeProductsByVariant)(picked, excludeVariants);
        if (result.length >= targetCount)
            return result.slice(0, targetCount);
        if (strictCount)
            return result;
        const padded = [...result];
        const padVariants = new Set(result.map((p) => (0, catalog_variant_util_1.productVariantKey)(p)));
        const padTypes = new Set(result.map((p) => (0, concept_diversity_util_1.detectConceptProductType)(p)));
        for (const variant of excludeVariants)
            padVariants.add(variant);
        for (const product of catalog) {
            if (padded.length >= targetCount)
                break;
            const vk = (0, catalog_variant_util_1.productVariantKey)(product);
            const type = (0, concept_diversity_util_1.detectConceptProductType)(product);
            if (padVariants.has(vk) || padTypes.has(type) || padded.some((x) => x.id === product.id))
                continue;
            padded.push(product);
            padVariants.add(vk);
            padTypes.add(type);
        }
        return padded.slice(0, targetCount);
    }
    return pickDefaultProducts(catalog, userProductNames, targetCount, options);
}
function pickDefaultProducts(catalog, hintNames = [], count = 4, options) {
    const byName = (0, catalog_variant_util_1.indexCatalogByName)(catalog);
    const excludeVariants = options?.excludeVariantKeys ?? new Set();
    const brandColors = options?.brandColors ?? [];
    const preferred = [
        ...hintNames,
        'Welcome Box',
        'Термокружка',
        'Блокнот A5',
        'Ручка шариковая',
        'Шоппер',
    ];
    const picked = [];
    const seenVariants = new Set(excludeVariants);
    for (const name of preferred) {
        const candidates = byName.get(name.toLowerCase()) ?? [];
        const available = candidates.filter((p) => !seenVariants.has((0, catalog_variant_util_1.productVariantKey)(p)));
        if (available.length) {
            const product = (0, catalog_variant_util_1.pickBestColorVariant)(available, brandColors);
            picked.push(product);
            seenVariants.add((0, catalog_variant_util_1.productVariantKey)(product));
        }
        if (picked.length >= count)
            break;
    }
    if (picked.length >= count)
        return picked.slice(0, count);
    for (const product of catalog) {
        const vk = (0, catalog_variant_util_1.productVariantKey)(product);
        if (seenVariants.has(vk))
            continue;
        picked.push(product);
        seenVariants.add(vk);
        if (picked.length >= count)
            break;
    }
    return picked.slice(0, count);
}
const PRODUCT_KEYWORD_RULES = [
    { keys: ['бутыл', 'bottle'], matchName: (n) => n.includes('бутыл') },
    { keys: ['термос', 'thermos'], matchName: (n) => n.includes('термос') },
    { keys: ['кружк', 'кофейн', 'mug', 'cup', 'стакан'], matchName: (n) => isMugProduct(n) },
    { keys: ['ручк', 'pen'], matchName: (n) => n.includes('ручк') },
    { keys: ['блокнот', 'notebook'], matchName: (n) => n.includes('блокнот') },
    { keys: ['шоппер', 'сумк', 'bag'], matchName: (n) => n.includes('шоппер') || n.includes('сумк') },
    { keys: ['powerbank', 'пауэр', 'заряд'], matchName: (n) => n.includes('powerbank') || n.includes('заряд') },
    { keys: ['флеш', 'usb', 'flash'], matchName: (n) => n.includes('флеш') || n.includes('usb') },
    { keys: ['welcome', 'велком'], matchName: (n) => n.includes('welcome') },
    { keys: ['бейдж', 'badge'], matchName: (n) => n.includes('ланьярд') },
    {
        keys: CLOTHING_PROMPT_KEYWORDS,
        matchName: (n) => isClothingProductName(n),
    },
];
function pickByKeywordRules(catalog, text, count) {
    for (const rule of PRODUCT_KEYWORD_RULES) {
        if (!rule.keys.some((k) => text.includes(k)))
            continue;
        const matched = catalog.filter((p) => rule.matchName(p.name.toLowerCase()));
        if (matched.length > 0)
            return matched.slice(0, count);
    }
    return null;
}
function stubPickProductsFromBrief(catalog, userPrompt, category, desiredCount) {
    const count = desiredCount ?? (0, parse_desired_count_1.defaultItemCount)(userPrompt);
    const text = `${userPrompt} ${category}`.toLowerCase();
    const byKeywords = pickByKeywordRules(catalog, text, count);
    if (byKeywords)
        return byKeywords;
    if (promptRequestsClothing(userPrompt)) {
        const skater = text.includes('скейт') || text.includes('скеит') || text.includes('skater') || text.includes('street');
        const preferred = skater
            ? ['Футболка базовая', 'Худи', 'Кепка', 'Свитшот', 'Бини']
            : ['Футболка базовая', 'Худи', 'Кепка', 'Поло', 'Свитшот', 'Носки', 'Бини'];
        const clothing = pickByPreferredNames(catalog.filter((p) => isClothingProductName(p.name)), preferred, count);
        if (clothing.length > 0)
            return clothing;
    }
    if (text.includes('кружк') || text.includes('кофейн') || text.includes('mug') || text.includes('cup')) {
        const mugs = catalog.filter((p) => isMugProduct(p.name));
        if (mugs.length >= count)
            return mugs.slice(0, count);
        if (mugs.length > 0) {
            const extra = catalog.filter((p) => !mugs.includes(p));
            return [...mugs, ...extra].slice(0, count);
        }
    }
    const rules = [
        { keywords: ['welcome', 'онбординг', 'onboarding'], names: ['Welcome Box', 'Блокнот A5', 'Ручка шариковая', 'Термокружка'] },
        { keywords: ['it', 'tech', 'технолог'], names: ['Powerbank 5000 mAh', 'Флешка 32 ГБ', 'Блокнот A5', 'Термокружка'] },
        { keywords: ['эко', 'eco', 'green'], names: ['Шоппер', 'Бамбуковая кружка', 'Блокнот A5', 'Карандаш'] },
        { keywords: ['event', 'мероприят'], names: ['Шоппер', 'Бутылка стеклянная', 'Ланьярд', 'Блокнот A6'] },
        { keywords: ['премиум', 'premium', 'vip', 'роскош'], names: ['Welcome Box', 'Powerbank 10000 mAh', 'Ручка шариковая', 'Термос дорожный'] },
    ];
    const byName = new Map(catalog.map((p) => [p.name.toLowerCase(), p]));
    const seen = new Set();
    const picked = [];
    for (const rule of rules) {
        if (!rule.keywords.some((k) => text.includes(k)))
            continue;
        for (const name of rule.names) {
            const product = byName.get(name.toLowerCase());
            if (product && !seen.has(product.id)) {
                picked.push(product);
                seen.add(product.id);
            }
        }
        if (picked.length >= count)
            return picked.slice(0, count);
    }
    return pickDefaultProducts(catalog, [], count);
}
function pickByPreferredNames(catalog, names, count) {
    const byName = new Map(catalog.map((p) => [p.name.toLowerCase(), p]));
    const picked = [];
    const seen = new Set();
    for (const name of names) {
        const product = byName.get(name.toLowerCase());
        if (product && !seen.has(product.id)) {
            picked.push(product);
            seen.add(product.id);
        }
        if (picked.length >= count)
            return picked.slice(0, count);
    }
    for (const product of catalog) {
        if (picked.length >= count)
            break;
        if (!seen.has(product.id)) {
            picked.push(product);
            seen.add(product.id);
        }
    }
    return picked.slice(0, count);
}
//# sourceMappingURL=catalog.util.js.map
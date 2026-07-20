"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.estimateSetTotalPrice = void 0;
exports.resolveTargetItemCount = resolveTargetItemCount;
exports.scoreProductForBrief = scoreProductForBrief;
exports.filterCatalogForRequest = filterCatalogForRequest;
exports.shortlistCatalogForLlm = shortlistCatalogForLlm;
const catalog_util_1 = require("./catalog.util");
const brief_category_buckets_util_1 = require("../../catalog/brief-category-buckets.util");
const brief_constraints_util_1 = require("../../requests/brief-constraints.util");
const set_budget_util_1 = require("./set-budget.util");
const concept_diversity_util_1 = require("./concept-diversity.util");
const catalog_color_match_util_1 = require("./catalog-color-match.util");
const catalog_name_match_util_1 = require("./catalog-name-match.util");
const catalog_brief_relevance_util_1 = require("./catalog-brief-relevance.util");
const project_brief_profile_util_1 = require("./project-brief-profile.util");
const product_count_bounds_util_1 = require("./product-count-bounds.util");
const product_normalization_util_1 = require("./product-normalization.util");
const yield_event_loop_1 = require("../../common/yield-event-loop");
const selection_constraints_1 = require("../../concept/selection-constraints");
function resolveTargetItemCount(input) {
    return (0, product_count_bounds_util_1.averageItemCount)((0, product_count_bounds_util_1.resolveProductCountBounds)({
        userPrompt: input.userPrompt,
        setItemCount: input.setItemCount,
        useProductCountLimit: input.useProductCountLimit,
        minProductsPerSet: input.minProductsPerSet,
        maxProductsPerSet: input.maxProductsPerSet,
    }));
}
const BRIEF_KEYWORDS = [
    'кружк',
    'чаш',
    'стакан',
    'ручк',
    'блокнот',
    'ежедневник',
    'термос',
    'бутыл',
    'сумк',
    'рюкзак',
    'шоппер',
    'футболк',
    'худи',
    'кепк',
    'очк',
    'панам',
    'powerbank',
    'заряд',
    'флеш',
    'usb',
    'welcome',
    'it',
    'tech',
    'эко',
    'eco',
    'премиум',
    'vip',
    'event',
    'конферен',
    'офис',
    'спорт',
    'зонт',
    'часы',
    'набор',
    'подар',
];
function normalizeText(text) {
    return String(text ?? '').toLowerCase().replace(/ё/g, 'е');
}
function keywordScore(product, userPrompt) {
    const name = normalizeText(product.name);
    const description = normalizeText(product.description ?? '');
    const categoryPath = normalizeText(product.subcategory ?? product.category ?? '');
    let score = 0;
    for (const kw of BRIEF_KEYWORDS) {
        if (normalizeText(userPrompt).includes(kw) &&
            (name.includes(kw) || description.includes(kw) || categoryPath.includes(kw))) {
            score += 5;
        }
    }
    const tokens = normalizeText(userPrompt)
        .split(/[^\p{L}\p{N}]+/u)
        .filter((t) => t.length >= 4);
    for (const token of tokens) {
        if (name.includes(token))
            score += 6;
        if (description.includes(token))
            score += 1;
        if (categoryPath.includes(token))
            score += 3;
    }
    return score;
}
function scoreProductForBrief(product, input) {
    let score = keywordScore(product, input.userPrompt);
    const profile = (0, project_brief_profile_util_1.extractProjectBriefProfile)({
        userPrompt: input.userPrompt,
        projectCategory: input.projectCategory,
        colors: input.colors,
        allowedItems: input.allowedItems,
        forbiddenItems: input.forbiddenItems,
    });
    const productType = (0, concept_diversity_util_1.detectConceptProductType)(product);
    const mandatoryTypes = (0, concept_diversity_util_1.detectMandatoryConceptTypesFromBrief)(input.userPrompt);
    if (mandatoryTypes.includes(productType))
        score += 28;
    score += (0, catalog_brief_relevance_util_1.scoreBriefRelevance)(product, input.userPrompt, input.colors);
    const colorBoost = input.colors?.length ? 4.5 : 1;
    score += (0, catalog_color_match_util_1.scoreBrandColorMatch)(product, input.colors) * colorBoost;
    score += (0, project_brief_profile_util_1.scoreAllowedItemSoftMatch)(product.name, product.description ?? '', profile.preferredCategories);
    score += (0, project_brief_profile_util_1.scoreProjectCategorySoftMatch)(productType, input.projectCategory);
    const meta = (0, product_normalization_util_1.normalizeCatalogProduct)(product);
    if (profile.positioning === 'premium' && meta.priceTier === 'premium')
        score += 10;
    if (profile.positioning === 'premium' && meta.priceTier === 'budget')
        score -= 12;
    if (profile.seasonality === 'summer' && meta.isOutdoor)
        score += 8;
    if (profile.seasonality === 'winter' && meta.seasonality.includes('winter'))
        score += 8;
    const budgetPerSet = input.budgetPerSet ?? (0, set_budget_util_1.resolveBudgetPerSet)(input.budgetMin, input.budgetMax);
    const itemCount = resolveTargetItemCount(input);
    if (budgetPerSet != null && budgetPerSet > 0) {
        if (product.price != null && product.price > 0) {
            if (product.price <= budgetPerSet)
                score += 5;
            else
                score -= 25;
            const avgSlot = Math.floor(budgetPerSet / itemCount);
            if (product.price <= avgSlot)
                score += 4;
            else if (product.price > avgSlot * 1.5)
                score -= 8;
        }
    }
    else {
        const maxPrice = input.budgetMax ?? input.budgetMin;
        if (maxPrice != null && product.price != null && product.price > 0) {
            if (product.price <= maxPrice)
                score += 5;
            else
                score -= 20;
        }
    }
    if (input.quantity != null && input.quantity > 0 && (product.stockAvailable ?? 0) > 0) {
        if ((product.stockAvailable ?? 0) >= input.quantity)
            score += 8;
        else
            score -= 15;
    }
    if ((product.stockAvailable ?? 0) > 500)
        score += 2;
    return score;
}
function filterCatalogForRequest(catalog, input) {
    const logStage = (stage, count) => {
        if (count < 20) {
            console.warn(`[catalog-filter] pool ${count} after ${stage}`);
        }
    };
    const MIN_POOL = 20;
    catalog = catalog.filter((p) => {
        const price = p.price ?? 0;
        if (price > 0 && price < 50)
            return false;
        return true;
    });
    const { allowedItems, forbiddenItems } = (0, brief_constraints_util_1.reconcileBriefConstraints)(input.userPrompt, input.allowedItems, input.forbiddenItems);
    const junkFiltered = catalog.filter((p) => {
        if ((p.price ?? 0) > 0 && (p.price ?? 0) < 20)
            return false;
        if ((p.name?.trim().length ?? 0) < 5)
            return false;
        if (p.category === '❓ Требует категории')
            return false;
        return true;
    });
    const baseCatalog = junkFiltered.length > 0 ? junkFiltered : catalog;
    let filtered = (0, brief_category_buckets_util_1.filterCatalogByBriefBuckets)(baseCatalog, allowedItems, forbiddenItems);
    logStage('buckets', filtered.length);
    filtered = (0, catalog_name_match_util_1.filterCatalogByNameConstraints)(filtered, allowedItems, forbiddenItems, input.userPrompt);
    logStage('name_constraints', filtered.length);
    if (filtered.length < MIN_POOL) {
        filtered = (0, catalog_name_match_util_1.filterCatalogByNameConstraints)(baseCatalog, allowedItems, [], input.userPrompt);
        logStage('name_constraints_relaxed_forbidden', filtered.length);
    }
    filtered = (0, catalog_name_match_util_1.ensureMandatoryBriefProducts)(baseCatalog, filtered, input.userPrompt);
    filtered = (0, catalog_util_1.filterCatalogByBlacklist)(filtered, input.blacklistedProductIds ?? [], input.blacklistedSupplierIds ?? []);
    const tirage = input.quantity ?? 0;
    if (tirage > 0) {
        const withStock = filtered.filter((p) => p.stockAvailable != null && p.stockAvailable >= tirage);
        if (withStock.length >= 4)
            filtered = withStock;
    }
    const withPrice = filtered.filter((p) => p.price != null && p.price > 0);
    if (withPrice.length >= 8)
        filtered = withPrice;
    const withImage = filtered.filter((p) => (0, selection_constraints_1.hasValidProductImage)(p));
    if (withImage.length >= 4)
        filtered = withImage;
    const junkFree = filtered.filter((p) => (0, catalog_brief_relevance_util_1.scoreBriefRelevance)(p, input.userPrompt, input.colors) > -70);
    if (junkFree.length >= 8)
        filtered = junkFree;
    else if (junkFree.length >= MIN_POOL / 2)
        filtered = junkFree;
    logStage('relevance', filtered.length);
    const budgetPerSet = input.budgetPerSet ?? (0, set_budget_util_1.resolveBudgetPerSet)(input.budgetMin, input.budgetMax);
    const itemCount = resolveTargetItemCount(input);
    if (budgetPerSet != null && budgetPerSet > 0) {
        const unitCap = (0, set_budget_util_1.maxUnitPriceForSet)(budgetPerSet, itemCount);
        const byBudget = filtered.filter((p) => p.price == null || p.price <= budgetPerSet);
        if (byBudget.length >= 8)
            filtered = byBudget;
        const bySlot = filtered.filter((p) => p.price == null || p.price <= unitCap);
        if (bySlot.length >= 8)
            filtered = bySlot;
    }
    else {
        const maxItemPrice = input.budgetMax ?? input.budgetMin;
        if (maxItemPrice != null && maxItemPrice > 0) {
            const byBudget = filtered.filter((p) => p.price == null || p.price <= maxItemPrice);
            if (byBudget.length >= 8)
                filtered = byBudget;
        }
    }
    return filtered.length > 0 ? filtered : baseCatalog;
}
async function shortlistCatalogForLlm(catalog, input, maxItems = 120) {
    if (catalog.length <= maxItems)
        return catalog;
    const scored = catalog
        .map((p) => ({ product: p, score: scoreProductForBrief(p, input) }))
        .sort((a, b) => b.score - a.score || (a.product.price ?? 0) - (b.product.price ?? 0));
    if (catalog.length > 2000)
        await (0, yield_event_loop_1.yieldEventLoop)();
    const top = scored.slice(0, maxItems * 2).map((s) => s.product);
    const byType = new Map();
    const typeCap = Math.max(5, Math.floor(maxItems * 0.15));
    const diversified = [];
    for (const p of top) {
        if (diversified.length >= maxItems)
            break;
        const type = (0, concept_diversity_util_1.detectConceptProductType)(p);
        const n = byType.get(type) ?? 0;
        if (n >= typeCap)
            continue;
        diversified.push(p);
        byType.set(type, n + 1);
    }
    for (const p of top) {
        if (diversified.length >= maxItems)
            break;
        if (!diversified.some((x) => x.id === p.id))
            diversified.push(p);
    }
    return diversified.slice(0, maxItems);
}
var set_budget_util_2 = require("./set-budget.util");
Object.defineProperty(exports, "estimateSetTotalPrice", { enumerable: true, get: function () { return set_budget_util_2.estimateSetTotalPrice; } });
//# sourceMappingURL=catalog-filter.util.js.map
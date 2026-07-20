"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findCatalogMatchForItem = findCatalogMatchForItem;
exports.scoreProductForConcept = scoreProductForConcept;
exports.resolveConceptProductSelection = resolveConceptProductSelection;
exports.ensureConceptProducts = ensureConceptProducts;
exports.upgradeSetToTargetBudget = upgradeSetToTargetBudget;
const catalog_variant_util_1 = require("./catalog-variant.util");
const concept_diversity_util_1 = require("./concept-diversity.util");
const catalog_slot_picker_util_1 = require("./catalog-slot-picker.util");
const catalog_brief_relevance_util_1 = require("./catalog-brief-relevance.util");
const catalog_color_match_util_1 = require("./catalog-color-match.util");
const selection_constraints_1 = require("../../concept/selection-constraints");
const set_budget_util_1 = require("./set-budget.util");
const catalog_filter_util_1 = require("./catalog-filter.util");
function normalizeText(text) {
    return text.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}
function tokenize(text) {
    return normalizeText(text)
        .split(/[^a-zа-я0-9]+/i)
        .filter((t) => t.length >= 3);
}
function findCatalogMatchForItem(item, catalog, blockedIds, blockedVariants, brandColors = []) {
    const query = normalizeText(item);
    if (!query)
        return null;
    const byName = (0, catalog_variant_util_1.indexCatalogByName)(catalog);
    const exact = (byName.get(query) ?? []).filter((p) => !(0, catalog_variant_util_1.isVariantBlocked)(p, blockedIds, blockedVariants));
    if (exact.length)
        return (0, catalog_variant_util_1.pickBestColorVariant)(exact, brandColors);
    const queryTokens = tokenize(query);
    let best = null;
    for (const product of catalog) {
        if ((0, catalog_variant_util_1.isVariantBlocked)(product, blockedIds, blockedVariants))
            continue;
        const name = normalizeText(product.name);
        const haystack = `${name} ${normalizeText(product.description ?? '')}`;
        let score = 0;
        if (name === query)
            score += 120;
        else if (name.includes(query) || query.includes(name))
            score += 90;
        for (const token of queryTokens) {
            if (haystack.includes(token))
                score += 18;
        }
        const nameTokens = tokenize(product.name);
        const overlap = queryTokens.filter((t) => nameTokens.some((n) => n.includes(t) || t.includes(n))).length;
        if (overlap > 0)
            score += overlap * 12;
        if (score > 0 && (!best || score > best.score)) {
            best = { product, score };
        }
    }
    return best && best.score >= 28 ? best.product : null;
}
const CONCEPT_THEME_KEYWORDS = [
    { keys: /tech|it|digital|гаджет|офис|office/i, productMatch: (t) => /powerbank|заряд|флеш|usb|колонк|наушник|tech/i.test(t), weight: 35 },
    { keys: /welcome|онбординг|hr/i, productMatch: (t) => /welcome|блокнот|ручк|ежедневник|шоппер/i.test(t), weight: 30 },
    { keys: /эко|eco|green|природ/i, productMatch: (t) => /эко|бамбук|дерев|текстил|шоппер/i.test(t), weight: 30 },
    { keys: /премиум|premium|vip|luxury/i, productMatch: (t) => /кож|метал|premium|визитниц|термос/i.test(t), weight: 25 },
    { keys: /чай|coffee|кофе|напит/i, productMatch: (t) => /кружк|стакан|термокруж|термос|чайн/i.test(t), weight: 35 },
    { keys: /фестивал|festival|летн|summer|outdoor/i, productMatch: (t) => /футболк|кепк|панам|очк|шоппер|термос|бутылк/i.test(t), weight: 40 },
];
function scoreProductForConcept(product, conceptTitle, conceptComposition, brief, conceptStyle = '', mandatoryTypes = []) {
    const conceptText = normalizeText(`${conceptTitle} ${conceptComposition} ${conceptStyle}`);
    const briefText = normalizeText(brief);
    const productText = normalizeText(`${product.name} ${product.description ?? ''} ${product.subcategory ?? ''}`);
    let score = (product.stockAvailable ?? 0) * 0.01;
    for (const token of tokenize(conceptText)) {
        if (productText.includes(token))
            score += 8;
    }
    for (const token of tokenize(briefText)) {
        if (productText.includes(token))
            score += 4;
    }
    for (const theme of CONCEPT_THEME_KEYWORDS) {
        if (theme.keys.test(conceptText) || theme.keys.test(briefText)) {
            if (theme.productMatch(productText))
                score += theme.weight;
        }
    }
    if (!(0, selection_constraints_1.hasValidProductImage)(product)) {
        score -= 60;
    }
    const type = (0, concept_diversity_util_1.detectConceptProductType)(product);
    if (type === 'socks' && !mandatoryTypes.includes('socks'))
        score -= 60;
    if (type === 'blanket' && !mandatoryTypes.includes('blanket'))
        score -= 60;
    return score;
}
function resolveConceptProductSelection(input) {
    const { llmItems, conceptTitle, conceptComposition, brief, catalog, desiredCount, blockedIds, blockedVariants, brandColors = [], } = input;
    const picked = [];
    const localTypes = new Set();
    const localVariants = new Set(blockedVariants);
    for (const item of llmItems) {
        if (typeof item !== 'string' || picked.length >= desiredCount)
            continue;
        const product = findCatalogMatchForItem(item, catalog, blockedIds, localVariants, brandColors);
        if (!product)
            continue;
        const type = (0, concept_diversity_util_1.detectConceptProductType)(product);
        const vk = (0, catalog_variant_util_1.productVariantKey)(product);
        if ((0, concept_diversity_util_1.typeConflictsInSet)(localTypes, type) || localVariants.has(vk) || picked.some((p) => p.id === product.id))
            continue;
        picked.push(product);
        localTypes.add(type);
        localVariants.add(vk);
    }
    return picked;
}
function ensureConceptProducts(products, catalog, desiredCount, context, blockedIds, blockedVariants, tracker, seed, recordUsage, scoreFn, mandatoryTypes = []) {
    const mandatoryTypesSet = new Set(mandatoryTypes);
    const JUNK_TYPES = new Set([
        'socks',
        'blanket',
        'christmas_decor',
        'car_accessory',
        'keychain',
        'sticker',
        'lanyard',
    ]);
    const result = [];
    const localTypes = new Set();
    const usedVariants = new Set(blockedVariants);
    const addProduct = (product) => {
        const type = (0, concept_diversity_util_1.detectConceptProductType)(product);
        const vk = (0, catalog_variant_util_1.productVariantKey)(product);
        if (blockedIds.has(product.id))
            return false;
        if (usedVariants.has(vk))
            return false;
        if (result.some((p) => p.id === product.id))
            return false;
        if ((0, concept_diversity_util_1.typeConflictsInSet)(localTypes, type))
            return false;
        result.push(product);
        localTypes.add(type);
        usedVariants.add(vk);
        return true;
    };
    for (const product of products) {
        addProduct(product);
    }
    const scoreProduct = (p) => {
        let score = scoreFn?.(p) ??
            scoreProductForConcept(p, context.title, context.composition, context.brief, context.style, mandatoryTypes);
        const type = (0, concept_diversity_util_1.detectConceptProductType)(p);
        if (type === 'socks' && !mandatoryTypesSet.has('socks'))
            score -= 60;
        if (type === 'blanket' && !mandatoryTypesSet.has('blanket'))
            score -= 60;
        return score;
    };
    const JUNK_FILLER_TYPES = new Set([
        'socks',
        'christmas_decor',
        'car_accessory',
        'keychain',
        'sticker',
        'lanyard',
    ]);
    const cozyBrief = /уют|комфорт|тепл|hygge|зимн|благодарност/i.test(context.brief);
    const premiumBrief = /vip|премиум|premium|luxury|роскошн|ювелир|эксклюзив/i.test(context.brief);
    const techBrief = /it[\s-]|tech|конференц|разработчик/i.test(context.brief);
    const minRelevance = cozyBrief || premiumBrief || techBrief ? -25 : -55;
    const pickFromPool = (pool, strictCrossConceptTypes, relevanceFloor = minRelevance, ignoreJunkFiller = true) => {
        const candidates = pool
            .filter((p) => {
            if (blockedIds.has(p.id) || usedVariants.has((0, catalog_variant_util_1.productVariantKey)(p)))
                return false;
            if (result.some((x) => x.id === p.id))
                return false;
            const type = (0, concept_diversity_util_1.detectConceptProductType)(p);
            if ((0, catalog_brief_relevance_util_1.scoreBriefRelevance)(p, context.brief) < relevanceFloor)
                return false;
            if (ignoreJunkFiller && JUNK_FILLER_TYPES.has(type) && !mandatoryTypesSet.has(type))
                return false;
            if (JUNK_TYPES.has(type) && !mandatoryTypesSet.has(type))
                return false;
            if ((0, concept_diversity_util_1.typeConflictsInSet)(localTypes, type))
                return false;
            if (strictCrossConceptTypes && !tracker.canUseType(type))
                return false;
            return true;
        })
            .sort((a, b) => scoreProduct(b) - scoreProduct(a));
        if (!candidates.length)
            return false;
        const bestScore = scoreProduct(candidates[0]);
        const threshold = bestScore >= 0 ? bestScore * 0.55 : bestScore * 1.45;
        let topN = 1;
        for (let i = 1; i < Math.min(16, candidates.length); i++) {
            const s = scoreProduct(candidates[i]);
            if (s >= threshold)
                topN = i + 1;
            else
                break;
        }
        const idx = (Math.abs(seed) + result.length * 7) % topN;
        return addProduct(candidates[idx] ?? candidates[0]);
    };
    while (result.length < desiredCount) {
        if (pickFromPool(catalog, true))
            continue;
        if (pickFromPool(catalog, false))
            continue;
        if (pickFromPool(catalog, false, -120))
            continue;
        break;
    }
    while (result.length < desiredCount) {
        if (pickFromPool(catalog, true, minRelevance, false))
            continue;
        if (pickFromPool(catalog, false, minRelevance, false))
            continue;
        break;
    }
    if (recordUsage && result.length > 0) {
        tracker.recordConceptTypes(result.map(concept_diversity_util_1.detectConceptProductType));
    }
    return result.slice(0, desiredCount);
}
function scoreProductForUpgrade(product, ctx) {
    let score = scoreProductForConcept(product, ctx.title, ctx.composition, ctx.brief, ctx.style);
    score += (0, catalog_brief_relevance_util_1.scoreBriefRelevance)(product, ctx.brief, ctx.brandColors ?? []);
    if (ctx.filterInput)
        score += (0, catalog_filter_util_1.scoreProductForBrief)(product, ctx.filterInput) * 0.5;
    score += (0, catalog_color_match_util_1.scoreBrandColorMatch)(product, ctx.brandColors ?? []);
    return score;
}
function upgradeSetToTargetBudget(products, catalog, perSetBudget, ctx, typeIndex, maxScoreDrop = 6) {
    if (!products.length || perSetBudget <= 0)
        return products;
    const { floor, cap } = (0, set_budget_util_1.resolveSetBudgetRange)(ctx.budgetMin ?? ctx.filterInput?.budgetMin, ctx.budgetMax ?? ctx.filterInput?.budgetMax ?? perSetBudget);
    if ((0, set_budget_util_1.estimateSetTotalPrice)(products) >= floor)
        return products;
    const index = typeIndex ?? (0, catalog_slot_picker_util_1.indexCatalogByProductType)(catalog);
    let result = [...products];
    const maxProducts = ctx.maxProductsPerSet ?? result.length;
    const maxIterations = Math.max(result.length * 12, maxProducts * 4);
    for (let iter = 0; iter < maxIterations && (0, set_budget_util_1.estimateSetTotalPrice)(result) < floor; iter++) {
        let best = null;
        for (let slotIdx = 0; slotIdx < result.length; slotIdx++) {
            const current = result[slotIdx];
            const currentType = (0, concept_diversity_util_1.detectConceptProductType)(current);
            const currentScore = scoreProductForUpgrade(current, ctx);
            const localTypes = new Set(result
                .map((p, i) => (i === slotIdx ? null : (0, concept_diversity_util_1.detectConceptProductType)(p)))
                .filter(Boolean));
            const sameTypePool = index.get(currentType) ?? catalog.filter((p) => (0, concept_diversity_util_1.detectConceptProductType)(p) === currentType);
            const curPrice = current.price ?? 0;
            const remainingBudget = cap - ((0, set_budget_util_1.estimateSetTotalPrice)(result) - curPrice);
            const candidatePools = [sameTypePool, catalog];
            for (const pool of candidatePools) {
                for (const candidate of pool) {
                    if (candidate.id === current.id)
                        continue;
                    if (result.some((p, i) => i !== slotIdx && p.id === candidate.id))
                        continue;
                    const candType = (0, concept_diversity_util_1.detectConceptProductType)(candidate);
                    if ((0, concept_diversity_util_1.typeConflictsInSet)(localTypes, candType))
                        continue;
                    const candPrice = candidate.price ?? 0;
                    if (candPrice <= curPrice)
                        continue;
                    if (candPrice > remainingBudget)
                        continue;
                    const newTotal = (0, set_budget_util_1.estimateSetTotalPrice)(result) - curPrice + candPrice;
                    if (newTotal > cap)
                        continue;
                    const candScore = scoreProductForUpgrade(candidate, ctx);
                    const maxDrop = /vip|премиум|premium|luxury|роскошн/i.test(ctx.brief) ? 12 : maxScoreDrop;
                    if (candScore < currentScore - maxDrop)
                        continue;
                    const gain = candPrice - curPrice;
                    const scoreDrop = Math.max(0, currentScore - candScore);
                    const premiumBoost = /vip|премиум|premium|luxury/i.test(ctx.brief) ? candPrice * 0.02 : 0;
                    const crossTypeBonus = candType !== currentType ? 0.5 : 0;
                    const efficiency = (gain + premiumBoost) / (1 + scoreDrop + crossTypeBonus);
                    if (!best || efficiency > best.efficiency) {
                        best = { slotIdx, replacement: candidate, gain, efficiency, isAdd: false };
                    }
                }
            }
        }
        if (!best && result.length < maxProducts) {
            const localTypes = new Set(result.map(concept_diversity_util_1.detectConceptProductType));
            const remaining = cap - (0, set_budget_util_1.estimateSetTotalPrice)(result);
            for (const candidate of catalog) {
                if (result.some((p) => p.id === candidate.id))
                    continue;
                const candType = (0, concept_diversity_util_1.detectConceptProductType)(candidate);
                if ((0, concept_diversity_util_1.typeConflictsInSet)(localTypes, candType))
                    continue;
                const candPrice = candidate.price ?? 0;
                if (candPrice <= 0 || candPrice > remaining)
                    continue;
                const candScore = scoreProductForUpgrade(candidate, ctx);
                const efficiency = candPrice * 0.01 + candScore * 0.001;
                if (!best || efficiency > best.efficiency) {
                    best = { slotIdx: result.length, replacement: candidate, gain: candPrice, efficiency, isAdd: true };
                }
            }
        }
        if (!best || best.gain <= 0)
            break;
        if (best.isAdd) {
            result.push(best.replacement);
        }
        else {
            result[best.slotIdx] = best.replacement;
        }
    }
    return result;
}
//# sourceMappingURL=concept-product-picker.util.js.map
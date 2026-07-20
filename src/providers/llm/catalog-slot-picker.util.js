"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.indexCatalogByProductType = indexCatalogByProductType;
exports.pickProductForSlot = pickProductForSlot;
exports.resolveConceptFromSlots = resolveConceptFromSlots;
exports.conceptTypeSignature = conceptTypeSignature;
exports.buildCompositionFromProducts = buildCompositionFromProducts;
const catalog_variant_util_1 = require("./catalog-variant.util");
const concept_diversity_util_1 = require("./concept-diversity.util");
const catalog_brief_relevance_util_1 = require("./catalog-brief-relevance.util");
const catalog_color_match_util_1 = require("./catalog-color-match.util");
const concept_product_picker_util_1 = require("./concept-product-picker.util");
const catalog_filter_util_1 = require("./catalog-filter.util");
const set_budget_util_1 = require("./set-budget.util");
const selection_constraints_1 = require("../../concept/selection-constraints");
const named_positions_util_1 = require("../../requests/named-positions.util");
function normalizeText(text) {
    return String(text ?? '').toLowerCase().replace(/ё/g, 'е');
}
function indexCatalogByProductType(catalog) {
    const index = new Map();
    for (const product of catalog) {
        const type = (0, concept_diversity_util_1.detectConceptProductType)(product);
        const list = index.get(type) ?? [];
        list.push(product);
        index.set(type, list);
    }
    return index;
}
function scoreForSlot(product, slot, ctx) {
    let score = (0, catalog_brief_relevance_util_1.scoreBriefRelevance)(product, ctx.brief, ctx.brandColors);
    const price = product.price ?? 0;
    const budgetMax = ctx.budgetMax ?? ctx.perSetBudget ?? ctx.filterInput?.budgetMax ?? 5000;
    const minPriceFloor = Math.max(50, budgetMax * 0.02);
    if (price > 0 && price < minPriceFloor) {
        score -= 200;
    }
    if (!(0, selection_constraints_1.hasValidProductImage)(product)) {
        score -= 60;
    }
    score += (0, concept_product_picker_util_1.scoreProductForConcept)(product, ctx.conceptTitle, ctx.conceptComposition, ctx.brief, ctx.conceptStyle, ctx.mandatoryTypes ?? []);
    if (ctx.filterInput) {
        score += (0, catalog_filter_util_1.scoreProductForBrief)(product, ctx.filterInput) * 0.5;
    }
    if (slot.notes) {
        const notes = normalizeText(slot.notes);
        const text = `${product.name} ${product.description ?? ''}`.toLowerCase();
        if (notes.split(/\s+/).some((w) => w.length >= 4 && text.includes(w)))
            score += 20;
    }
    const positionLabel = slot.positionLabel ?? slot.notes;
    if (positionLabel) {
        if ((0, named_positions_util_1.productMatchesNamedPosition)(product, positionLabel, slot.type))
            score += 80;
        const labelTokens = normalizeText(positionLabel)
            .split(/\s+/)
            .filter((t) => t.length >= 3);
        const nameText = normalizeText(`${product.name} ${product.description ?? ''}`);
        const hits = labelTokens.filter((t) => nameText.includes(t)).length;
        score += hits * 25;
    }
    if (slot.priority === 'must')
        score += 10;
    const type = (0, concept_diversity_util_1.detectConceptProductType)(product);
    const colorWeight = ctx.brandColors.length
        ? ((0, catalog_color_match_util_1.isColorCriticalProductType)(type) ? 4 : 1.5)
        : 1;
    score += (0, catalog_color_match_util_1.scoreBrandColorMatch)(product, ctx.brandColors) * colorWeight;
    if (type === 'other')
        score -= 100;
    if (type === 'keychain')
        score -= 120;
    if (type === 'socks' && !ctx.mandatoryTypes?.includes('socks'))
        score -= 60;
    if (type === 'blanket' && !ctx.mandatoryTypes?.includes('blanket'))
        score -= 60;
    if (ctx.perSetBudget != null && ctx.perSetBudget > 0) {
        const slotTypes = ctx.slotTypes?.length
            ? ctx.slotTypes
            : Array.from({ length: Math.max(1, ctx.desiredCount ?? 1) }, () => slot.type);
        const target = (0, set_budget_util_1.targetPriceForSlot)(ctx.perSetBudget, slotTypes, slot.type);
        const maxUnit = (0, set_budget_util_1.maxUnitPriceForSet)(ctx.perSetBudget, slotTypes.length);
        score += (0, set_budget_util_1.scorePriceFit)(price, target, maxUnit);
    }
    return score;
}
function pickProductForSlot(slot, typeIndex, catalog, localTypes, ctx) {
    if ((0, concept_diversity_util_1.typeConflictsInSet)(localTypes, slot.type))
        return null;
    const pool = typeIndex.get(slot.type) ?? [];
    const searchPool = pool.length
        ? pool
        : catalog.filter((p) => (0, concept_diversity_util_1.detectConceptProductType)(p) === slot.type);
    const candidates = searchPool
        .filter((p) => {
        if ((0, catalog_variant_util_1.isVariantBlocked)(p, ctx.blockedIds, ctx.blockedVariants))
            return false;
        if (pool.length && (0, concept_diversity_util_1.detectConceptProductType)(p) !== slot.type)
            return false;
        if ((0, concept_diversity_util_1.typeConflictsInSet)(localTypes, (0, concept_diversity_util_1.detectConceptProductType)(p)))
            return false;
        return (0, catalog_brief_relevance_util_1.scoreBriefRelevance)(p, ctx.brief, ctx.brandColors) > -80;
    })
        .sort((a, b) => scoreForSlot(b, slot, ctx) - scoreForSlot(a, slot, ctx));
    if (!candidates.length)
        return null;
    const bestScore = scoreForSlot(candidates[0], slot, ctx);
    const threshold = bestScore * 0.7;
    let topN = 1;
    for (let i = 1; i < Math.min(8, candidates.length); i++) {
        if (scoreForSlot(candidates[i], slot, ctx) >= threshold)
            topN = i + 1;
        else
            break;
    }
    const idx = (Math.abs(ctx.seed) + localTypes.size * 11) % topN;
    return candidates[idx] ?? candidates[0];
}
function resolveConceptFromSlots(slots, catalog, desiredCount, ctx, prebuiltTypeIndex) {
    const typeIndex = prebuiltTypeIndex ?? indexCatalogByProductType(catalog);
    const result = [];
    const localTypes = new Set();
    const usedVariants = new Set(ctx.blockedVariants);
    const localBlockedIds = new Set(ctx.blockedIds);
    const missingMandatory = [];
    const ordered = [
        ...slots.filter((s) => s.priority === 'must'),
        ...slots.filter((s) => s.priority !== 'must'),
    ];
    const tryPick = (slot, seed) => {
        const product = pickProductForSlot(slot, typeIndex, catalog, localTypes, {
            ...ctx,
            blockedVariants: usedVariants,
            blockedIds: localBlockedIds,
            seed,
        });
        if (!product) {
            if (slot.priority === 'must') {
                missingMandatory.push(`${slot.type}${slot.positionLabel ? ` (${slot.positionLabel})` : ''}`);
            }
            return false;
        }
        result.push(product);
        localTypes.add((0, concept_diversity_util_1.detectConceptProductType)(product));
        usedVariants.add((0, catalog_variant_util_1.productVariantKey)(product));
        localBlockedIds.add(product.id);
        return true;
    };
    for (const slot of ordered) {
        if (result.length >= desiredCount)
            break;
        tryPick(slot, ctx.seed + result.length);
    }
    if (!ctx.strictMandatory) {
        for (let round = 0; round < 3 && result.length < desiredCount; round++) {
            for (const slot of ordered) {
                if (result.length >= desiredCount)
                    break;
                if ((0, concept_diversity_util_1.typeConflictsInSet)(localTypes, slot.type))
                    continue;
                tryPick(slot, ctx.seed + result.length * 13 + round * 7);
            }
        }
    }
    if (missingMandatory.length) {
        ctx.logMissing?.(`Missing mandatory slot SKU: ${missingMandatory.join(', ')}`);
    }
    return result.slice(0, desiredCount);
}
function conceptTypeSignature(slots) {
    return [...slots.map((s) => s.type)].sort().join('|');
}
function buildCompositionFromProducts(products, style, fallback = '') {
    if (!products.length)
        return fallback;
    const names = products.map((p) => p.name).join(', ');
    const stylePart = style?.trim() ? ` Стиль: ${style.trim()}.` : '';
    if (products.length === 1) {
        return `В наборе: ${names}.${stylePart}`;
    }
    return `Состав набора: ${names}.${stylePart}`;
}
//# sourceMappingURL=catalog-slot-picker.util.js.map
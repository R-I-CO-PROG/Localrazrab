"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PER_SET_BUDGET_CEILING = exports.TARGET_SPEND_RATIO = void 0;
exports.estimateSetTotalPrice = estimateSetTotalPrice;
exports.resolveSetBudgetRange = resolveSetBudgetRange;
exports.targetSpendForSet = targetSpendForSet;
exports.slotBudgetWeight = slotBudgetWeight;
exports.targetPriceForSlot = targetPriceForSlot;
exports.scorePriceFit = scorePriceFit;
exports.resolveBudgetPerSet = resolveBudgetPerSet;
exports.assertBudgetPerSetInRange = assertBudgetPerSetInRange;
exports.maxUnitPriceForSet = maxUnitPriceForSet;
exports.enforceSetBudget = enforceSetBudget;
exports.enforceSingleSetComposition = enforceSingleSetComposition;
exports.filterProductsBySetBudget = filterProductsBySetBudget;
const catalog_variant_util_1 = require("./catalog-variant.util");
const concept_diversity_util_1 = require("./concept-diversity.util");
const concept_product_picker_util_1 = require("./concept-product-picker.util");
const product_taxonomy_1 = require("../../concept/product-taxonomy");
function estimateSetTotalPrice(products) {
    return products.reduce((sum, p) => sum + (p.price ?? 0), 0);
}
exports.TARGET_SPEND_RATIO = 0.85;
function resolveSetBudgetRange(budgetMin, budgetMax) {
    const cap = Math.max(0, budgetMax ?? budgetMin ?? 0);
    if (cap <= 0)
        return { floor: 0, cap: 0 };
    const floor = budgetMin != null && budgetMin > 0
        ? Math.min(budgetMin, cap)
        : Math.round(cap * exports.TARGET_SPEND_RATIO);
    return { floor, cap };
}
function targetSpendForSet(perSetBudget) {
    return resolveSetBudgetRange(null, perSetBudget);
}
function slotBudgetWeight(type) {
    return (0, product_taxonomy_1.budgetWeightForType)(type);
}
function targetPriceForSlot(perSetBudget, slotTypes, slotType) {
    if (perSetBudget <= 0 || !slotTypes.length)
        return 0;
    const weights = slotTypes.map((t) => slotBudgetWeight(t));
    const totalWeight = weights.reduce((a, b) => a + b, 0) || slotTypes.length;
    const slotWeight = slotBudgetWeight(slotType);
    return (perSetBudget * slotWeight) / totalWeight;
}
function scorePriceFit(price, targetPrice, maxUnitPrice) {
    if (price > maxUnitPrice)
        return -100;
    if (targetPrice <= 0 || price <= 0)
        return 0;
    const deviation = Math.abs(price - targetPrice) / Math.max(targetPrice, 1);
    return Math.max(0, 8 - deviation * 8);
}
exports.PER_SET_BUDGET_CEILING = 100_000;
function resolveBudgetPerSet(budgetMin, budgetMax) {
    const min = budgetMin != null && budgetMin > 0 ? budgetMin : null;
    const max = budgetMax != null && budgetMax > 0 ? budgetMax : null;
    if (max == null && min == null)
        return null;
    if (max != null) {
        if (min != null &&
            max > exports.PER_SET_BUDGET_CEILING &&
            min <= exports.PER_SET_BUDGET_CEILING) {
            return min;
        }
        if (min != null && max > min * 50 && max > exports.PER_SET_BUDGET_CEILING) {
            return min;
        }
        return Math.min(max, exports.PER_SET_BUDGET_CEILING);
    }
    return min != null ? Math.min(min, exports.PER_SET_BUDGET_CEILING) : null;
}
function assertBudgetPerSetInRange(budgetPerSet, budgetMin, budgetMax, log) {
    if (budgetPerSet == null || budgetPerSet <= 0)
        return;
    const lo = budgetMin != null && budgetMin > 0 ? budgetMin : 0;
    const hiRaw = budgetMax != null && budgetMax > 0 ? budgetMax : budgetPerSet;
    const hi = Math.min(hiRaw, exports.PER_SET_BUDGET_CEILING);
    if (budgetPerSet < lo || budgetPerSet > hi * 1.02) {
        log?.(`budgetPerSet=${budgetPerSet} outside [${lo}, ${hi}] (budgetMin=${budgetMin}, budgetMax=${budgetMax})`);
    }
}
function maxUnitPriceForSet(budgetPerSet, itemCount) {
    const slots = Math.max(1, itemCount);
    const avg = budgetPerSet / slots;
    return Math.min(budgetPerSet, Math.ceil(avg * 1.35));
}
function findBudgetReplacement(result, catalog, budgetPerSet, blockedIds, blockedVariants) {
    const currentTotal = estimateSetTotalPrice(result);
    let bestUnder = null;
    let bestReduction = null;
    for (let slotIdx = 0; slotIdx < result.length; slotIdx++) {
        const current = result[slotIdx];
        const curPrice = current.price ?? 0;
        const localTypes = new Set(result
            .map((p, i) => (i === slotIdx ? null : (0, concept_diversity_util_1.detectConceptProductType)(p)))
            .filter(Boolean));
        for (const candidate of catalog) {
            if (candidate.id === current.id)
                continue;
            if (result.some((x, i) => i !== slotIdx && x.id === candidate.id))
                continue;
            if (blockedIds.has(candidate.id) && !result.some((x) => x.id === candidate.id))
                continue;
            if (blockedVariants.has((0, catalog_variant_util_1.productVariantKey)(candidate)) &&
                !result.some((x) => x.id === candidate.id)) {
                continue;
            }
            const type = (0, concept_diversity_util_1.detectConceptProductType)(candidate);
            if (localTypes.has(type))
                continue;
            const candPrice = candidate.price ?? 0;
            if (candPrice >= curPrice)
                continue;
            const newTotal = currentTotal - curPrice + candPrice;
            if (newTotal <= budgetPerSet) {
                if (!bestUnder || newTotal > bestUnder.newTotal) {
                    bestUnder = { slotIdx, replacement: candidate, newTotal };
                }
                continue;
            }
            const saved = curPrice - candPrice;
            if (!bestReduction || saved > bestReduction.saved) {
                bestReduction = { slotIdx, replacement: candidate, newTotal, saved };
            }
        }
    }
    if (bestUnder)
        return bestUnder;
    if (bestReduction) {
        return {
            slotIdx: bestReduction.slotIdx,
            replacement: bestReduction.replacement,
            newTotal: bestReduction.newTotal,
        };
    }
    return null;
}
function enforceSetBudget(products, catalog, budgetPerSet, blockedIds, blockedVariants, seed = 0, minCount = 0) {
    if (!products.length || budgetPerSet <= 0)
        return products;
    const original = [...products];
    let result = [...products];
    const maxAttempts = Math.max(result.length * catalog.length, 32);
    for (let attempt = 0; attempt < maxAttempts && estimateSetTotalPrice(result) > budgetPerSet; attempt++) {
        const best = findBudgetReplacement(result, catalog, budgetPerSet, blockedIds, blockedVariants);
        if (!best)
            break;
        result[best.slotIdx] = best.replacement;
    }
    if (!result.length && original.length > 0) {
        result = [...original].sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
        while (result.length > minCount && estimateSetTotalPrice(result) > budgetPerSet) {
            let expensiveIdx = 0;
            for (let i = 1; i < result.length; i++) {
                if ((result[i].price ?? 0) > (result[expensiveIdx].price ?? 0))
                    expensiveIdx = i;
            }
            result.splice(expensiveIdx, 1);
        }
    }
    const targetCount = Math.max(minCount, result.length > 0 ? Math.min(result.length, original.length) : 0);
    if (targetCount > 0 && result.length < targetCount) {
        const tracker = new concept_diversity_util_1.ConceptDiversityTracker(new Set());
        const affordable = catalog.filter((p) => (p.price ?? 0) <= budgetPerSet);
        result = (0, concept_product_picker_util_1.ensureConceptProducts)(result, affordable.length >= targetCount ? affordable : catalog, targetCount, { title: '', composition: '', brief: '' }, blockedIds, blockedVariants, tracker, seed + 17, false);
        if (estimateSetTotalPrice(result) > budgetPerSet) {
            result = enforceSetBudget(result, catalog, budgetPerSet, blockedIds, blockedVariants, seed + 33, minCount);
        }
    }
    for (let pass = 0; pass < maxAttempts && estimateSetTotalPrice(result) > budgetPerSet; pass++) {
        const best = findBudgetReplacement(result, catalog, budgetPerSet, blockedIds, blockedVariants);
        if (!best || best.newTotal > budgetPerSet)
            break;
        result[best.slotIdx] = best.replacement;
    }
    return result;
}
function enforceSingleSetComposition(products, catalog, desiredCount, budgetPerSet, seed = 0, brief = '', composition = '') {
    const mandatoryTypes = (0, concept_diversity_util_1.detectMandatoryConceptTypesFromBrief)(brief);
    const tracker = new concept_diversity_util_1.ConceptDiversityTracker(new Set(mandatoryTypes));
    const blockedIds = new Set();
    const blockedVariants = new Set();
    let pool = catalog;
    if (budgetPerSet != null && budgetPerSet > 0) {
        const affordable = catalog.filter((p) => p.price == null || p.price <= budgetPerSet);
        if (affordable.length >= desiredCount)
            pool = affordable;
    }
    const context = {
        title: composition.trim().slice(0, 80) || brief.trim().slice(0, 80),
        composition: composition || brief,
        brief,
    };
    let result = (0, concept_product_picker_util_1.ensureConceptProducts)(products, pool, desiredCount, context, blockedIds, blockedVariants, tracker, seed, false, undefined, mandatoryTypes);
    if (budgetPerSet != null && budgetPerSet > 0 && result.length > 0) {
        result = enforceSetBudget(result, pool, budgetPerSet, blockedIds, blockedVariants, seed);
        if (result.length < desiredCount) {
            result = (0, concept_product_picker_util_1.ensureConceptProducts)(result, pool, desiredCount, context, blockedIds, blockedVariants, tracker, seed + 99, false, undefined, mandatoryTypes);
        }
    }
    return result.slice(0, desiredCount);
}
function filterProductsBySetBudget(products, budgetPerSet) {
    return products.filter((p) => p.price == null || p.price <= budgetPerSet);
}
//# sourceMappingURL=set-budget.util.js.map
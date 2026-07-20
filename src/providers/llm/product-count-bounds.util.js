"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.budgetBasedItemBounds = budgetBasedItemBounds;
exports.resolveProductCountBounds = resolveProductCountBounds;
exports.pickConceptItemCount = pickConceptItemCount;
exports.averageItemCount = averageItemCount;
const parse_desired_count_1 = require("./parse-desired-count");
const TARGET_PRICE_PER_ITEM = 650;
function budgetBasedItemBounds(budgetPerSet) {
    if (budgetPerSet == null || budgetPerSet <= 0)
        return null;
    const center = Math.round(budgetPerSet / TARGET_PRICE_PER_ITEM);
    const min = Math.max(4, Math.min(12, center - 1));
    const max = Math.max(min, Math.min(12, center + 2));
    return { min, max };
}
function resolveProductCountBounds(request) {
    const useLimit = request.useProductCountLimit !== false;
    if (!useLimit) {
        const n = (0, parse_desired_count_1.defaultItemCount)(request.userPrompt);
        return { min: n, max: n, useLimit: false };
    }
    if (request.minProductsPerSet != null || request.maxProductsPerSet != null) {
        const min = Math.max(1, Math.min(12, request.minProductsPerSet ?? request.maxProductsPerSet ?? 4));
        const max = Math.max(min, Math.min(12, request.maxProductsPerSet ?? request.minProductsPerSet ?? min));
        return { min, max, useLimit: true };
    }
    const boundsFromBrief = (0, parse_desired_count_1.parseItemCountBounds)(request.userPrompt);
    if (boundsFromBrief) {
        return {
            min: Math.max(1, Math.min(12, boundsFromBrief.min)),
            max: Math.max(boundsFromBrief.min, Math.min(12, boundsFromBrief.max)),
            useLimit: true,
        };
    }
    const byBudget = budgetBasedItemBounds(request.budgetPerSet);
    if (byBudget) {
        return { min: byBudget.min, max: byBudget.max, useLimit: true };
    }
    const fallback = Math.max(1, Math.min(12, request.setItemCount ?? (0, parse_desired_count_1.defaultItemCount)(request.userPrompt)));
    const min = Math.max(1, Math.min(12, fallback));
    const max = Math.max(min, Math.min(12, fallback));
    return { min, max, useLimit: true };
}
function pickConceptItemCount(bounds, conceptIndex) {
    if (bounds.min === bounds.max)
        return bounds.min;
    const span = bounds.max - bounds.min + 1;
    return bounds.min + (conceptIndex % span);
}
function averageItemCount(bounds) {
    return Math.round((bounds.min + bounds.max) / 2);
}
//# sourceMappingURL=product-count-bounds.util.js.map
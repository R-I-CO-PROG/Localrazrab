"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LIMITS = exports.PG_INT_MAX = void 0;
exports.sanitizeInt = sanitizeInt;
exports.sanitizeRequestPayload = sanitizeRequestPayload;
exports.PG_INT_MAX = 2_147_483_647;
exports.LIMITS = {
    budget: { min: 0, max: 50_000_000 },
    quantity: { min: 1, max: 1_000_000 },
    setItems: { min: 1, max: 50 },
    conceptCount: { min: 1, max: 10 },
    visualizationCount: { min: 1, max: 5 },
};
function sanitizeInt(value, opts = {}) {
    const { min = 0, max = exports.PG_INT_MAX, fallback = undefined } = opts;
    if (value === undefined)
        return undefined;
    if (value === null)
        return null;
    const n = typeof value === 'number' ? value : Number.parseInt(String(value).replace(/\s/g, ''), 10);
    if (!Number.isFinite(n))
        return fallback ?? undefined;
    return Math.min(max, Math.max(min, Math.round(n)));
}
function sanitizeRequestPayload(data) {
    const out = { ...data };
    if (out.budgetMin !== undefined) {
        out.budgetMin = sanitizeInt(out.budgetMin, { ...exports.LIMITS.budget, fallback: null });
    }
    if (out.budgetMax !== undefined) {
        out.budgetMax = sanitizeInt(out.budgetMax, { ...exports.LIMITS.budget, fallback: null });
    }
    if (out.quantity !== undefined) {
        out.quantity = sanitizeInt(out.quantity, exports.LIMITS.quantity) ?? exports.LIMITS.quantity.min;
    }
    if (out.setItemCount !== undefined) {
        out.setItemCount = sanitizeInt(out.setItemCount, exports.LIMITS.setItems) ?? exports.LIMITS.setItems.min;
    }
    if (out.minProductsPerSet !== undefined) {
        out.minProductsPerSet = sanitizeInt(out.minProductsPerSet, exports.LIMITS.setItems) ?? exports.LIMITS.setItems.min;
    }
    if (out.maxProductsPerSet !== undefined) {
        out.maxProductsPerSet = sanitizeInt(out.maxProductsPerSet, exports.LIMITS.setItems) ?? exports.LIMITS.setItems.min;
    }
    if (out.conceptCount !== undefined) {
        out.conceptCount = sanitizeInt(out.conceptCount, exports.LIMITS.conceptCount) ?? exports.LIMITS.conceptCount.min;
    }
    if (out.visualizationCount !== undefined) {
        out.visualizationCount =
            sanitizeInt(out.visualizationCount, exports.LIMITS.visualizationCount) ?? exports.LIMITS.visualizationCount.min;
    }
    return out;
}
//# sourceMappingURL=sanitize-request-integers.js.map
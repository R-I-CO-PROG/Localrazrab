"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.catalogPipelineCacheKey = catalogPipelineCacheKey;
exports.getCachedCatalogPipeline = getCachedCatalogPipeline;
exports.setCachedCatalogPipeline = setCachedCatalogPipeline;
const crypto_1 = require("crypto");
const store = new Map();
function catalogPipelineCacheKey(input, stratifiedMax) {
    const payload = {
        p: input.userPrompt.slice(0, 600),
        q: input.quantity ?? null,
        bmin: input.budgetMin ?? null,
        bmax: input.budgetMax ?? null,
        bps: input.budgetPerSet ?? null,
        colors: input.colors ?? [],
        allowed: input.allowedItems ?? [],
        forbidden: input.forbiddenItems ?? [],
        bl: input.blacklistedProductIds ?? [],
        bs: input.blacklistedSupplierIds ?? [],
        sic: input.setItemCount ?? null,
        useLimit: input.useProductCountLimit ?? true,
        minP: input.minProductsPerSet ?? null,
        maxP: input.maxProductsPerSet ?? null,
        cat: input.projectCategory ?? null,
        stratifiedMax,
    };
    return (0, crypto_1.createHash)('sha256').update(JSON.stringify(payload)).digest('hex');
}
function getCachedCatalogPipeline(key, ttlMs) {
    const entry = store.get(key);
    if (!entry)
        return null;
    if (Date.now() - entry.at > ttlMs) {
        store.delete(key);
        return null;
    }
    return entry.result;
}
function setCachedCatalogPipeline(key, result) {
    store.set(key, { at: Date.now(), result });
    if (store.size > 48) {
        const oldest = [...store.entries()].sort((a, b) => a[1].at - b[1].at)[0];
        if (oldest)
            store.delete(oldest[0]);
    }
}
//# sourceMappingURL=catalog-pipeline-cache.util.js.map
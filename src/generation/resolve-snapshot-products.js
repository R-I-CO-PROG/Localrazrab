"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveProductsFromSnapshot = resolveProductsFromSnapshot;
exports.resolveCatalogImageUrlsFromSnapshot = resolveCatalogImageUrlsFromSnapshot;
const product_image_util_1 = require("../products/product-image.util");
function resolveProductsFromSnapshot(snapshot, fullCatalog, llmFallback) {
    const ids = snapshot.productIds ?? [];
    const names = snapshot.productNames ?? [];
    const byId = new Map(fullCatalog.map((p) => [p.id, p]));
    const byName = new Map(fullCatalog.map((p) => [p.name.toLowerCase(), p]));
    if (ids.length > 0) {
        const picked = [];
        for (const id of ids) {
            const product = byId.get(String(id));
            if (product)
                picked.push(product);
        }
        if (picked.length > 0)
            return picked;
    }
    if (names.length === 0)
        return llmFallback;
    const picked = [];
    for (const name of names) {
        const product = byName.get(String(name).toLowerCase());
        if (product)
            picked.push(product);
    }
    return picked.length > 0 ? picked : llmFallback;
}
function resolveCatalogImageUrlsFromSnapshot(snapshot, products) {
    const snapshotUrls = snapshot.catalogImageUrls ?? [];
    if (snapshotUrls.length === products.length && snapshotUrls.every((u) => u?.trim())) {
        return snapshotUrls;
    }
    return products.map((p) => (0, product_image_util_1.resolveCatalogImageUrl)(p));
}
//# sourceMappingURL=resolve-snapshot-products.js.map
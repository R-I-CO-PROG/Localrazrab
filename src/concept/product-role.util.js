"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectProductRole = detectProductRole;
exports.isGiftBundleProduct = isGiftBundleProduct;
exports.roleFamilyForProduct = roleFamilyForProduct;
const product_taxonomy_1 = require("./product-taxonomy");
function detectProductRole(product) {
    const slug = (0, product_taxonomy_1.detectTypeSlug)(product);
    const meta = (0, product_taxonomy_1.metaForType)(slug);
    return {
        role: meta.role,
        legacyType: slug,
        isGiftBundle: Boolean(meta.giftBundle),
        isWearable: Boolean(meta.wearable),
        isTech: Boolean(meta.tech),
        isOffice: Boolean(meta.office),
        colorHints: (0, product_taxonomy_1.colorHintsFromProduct)(product),
    };
}
function isGiftBundleProduct(product) {
    return Boolean((0, product_taxonomy_1.metaForType)((0, product_taxonomy_1.detectTypeSlug)(product)).giftBundle);
}
function roleFamilyForProduct(product) {
    return (0, product_taxonomy_1.familyForType)((0, product_taxonomy_1.detectTypeSlug)(product));
}
//# sourceMappingURL=product-role.util.js.map
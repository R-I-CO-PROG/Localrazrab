"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildGenerationInputSnapshot = buildGenerationInputSnapshot;
const product_image_util_1 = require("../products/product-image.util");
function buildGenerationInputSnapshot(request, options) {
    const logoAsset = request.assets.find((a) => a.type === 'logo');
    const publicApiUrl = options.publicApiUrl.replace(/\/$/, '');
    return {
        title: request.title,
        userPrompt: request.userPrompt,
        category: request.category,
        budgetMin: request.budgetMin,
        budgetMax: request.budgetMax,
        quantity: request.quantity,
        colors: request.colors,
        allowedItems: request.allowedItems,
        forbiddenItems: request.forbiddenItems,
        notes: request.notes,
        productNames: request.items.map((i) => i.product.name),
        productIds: request.items.map((i) => i.productId),
        silhouetteUrls: request.items.map((i) => (0, product_image_util_1.resolveCatalogImageUrl)(i.product)),
        catalogImageUrls: request.items.map((i) => (0, product_image_util_1.resolveCatalogImageUrl)(i.product)),
        products: request.items.map((i) => ({
            id: i.productId,
            name: i.product.name,
            category: i.product.category,
        })),
        productTargetColors: options.productTargetColors ?? [],
        assets: request.assets.map((a) => ({ type: a.type, url: a.url })),
        hasLogo: Boolean(logoAsset),
        logoUrl: logoAsset?.url ?? null,
        logoPublicUrl: logoAsset && publicApiUrl ? `${publicApiUrl}${logoAsset.url}` : null,
        generationMode: options.mode,
        aiStyle: options.aiStyle,
        debug: options.debug,
        revision: options.revision ?? 1,
        chosenIdeaTitle: options.chosenIdeaTitle ?? null,
        sceneBrief: options.sceneBrief?.trim() || null,
    };
}
//# sourceMappingURL=generation-snapshot.util.js.map
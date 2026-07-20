"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isBrokenMercaiImageProxy = isBrokenMercaiImageProxy;
exports.isLocallyResolvableCatalogImage = isLocallyResolvableCatalogImage;
exports.resolveCatalogImageUrl = resolveCatalogImageUrl;
exports.isRasterCatalogImage = isRasterCatalogImage;
const DEFAULT_SILHOUETTE = '/uploads/silhouettes/pen.png';
function isBrokenMercaiImageProxy(url) {
    const trimmed = url?.trim() ?? '';
    if (!trimmed)
        return false;
    try {
        const host = new URL(trimmed).hostname.replace(/^www\./, '');
        return host === 'mercai.ru' && new URL(trimmed).pathname.startsWith('/p/');
    }
    catch {
        return /^mercai\.ru\/p\//i.test(trimmed) || trimmed.startsWith('/p/');
    }
}
function isLocallyResolvableCatalogImage(url) {
    const trimmed = url?.trim() ?? '';
    return trimmed.startsWith('/uploads/') || trimmed.startsWith('/catalog-handoff/');
}
function pickResolvableImageUrl(...candidates) {
    for (const raw of candidates) {
        const url = raw?.trim();
        if (!url || isBrokenMercaiImageProxy(url))
            continue;
        if (isLocallyResolvableCatalogImage(url))
            return url;
    }
    for (const raw of candidates) {
        const url = raw?.trim();
        if (!url || isBrokenMercaiImageProxy(url))
            continue;
        if (!url.startsWith('http://') && !url.startsWith('https://'))
            return url;
    }
    for (const raw of candidates) {
        const url = raw?.trim();
        if (!url || isBrokenMercaiImageProxy(url))
            continue;
        return url;
    }
    return DEFAULT_SILHOUETTE;
}
function resolveCatalogImageUrl(product) {
    return pickResolvableImageUrl(product.catalogImageUrl, product.silhouetteImageUrl);
}
function isRasterCatalogImage(url) {
    return /\.(png|jpe?g|webp)$/i.test(url.split('?')[0] ?? '');
}
//# sourceMappingURL=product-image.util.js.map
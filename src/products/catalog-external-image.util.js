"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAllowedExternalCatalogImageUrl = isAllowedExternalCatalogImageUrl;
exports.resolveExternalCatalogImageFetchUrl = resolveExternalCatalogImageFetchUrl;
const ALLOWED_HTTP_IMAGE_HOSTS = new Set([
    'cdn.midoceanbrands.ru',
]);
function isAllowedExternalCatalogImageUrl(raw) {
    const trimmed = raw?.trim();
    if (!trimmed)
        return false;
    try {
        const parsed = new URL(trimmed);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
            return false;
        const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
        if (parsed.protocol === 'https:')
            return true;
        return ALLOWED_HTTP_IMAGE_HOSTS.has(host);
    }
    catch {
        return false;
    }
}
function resolveExternalCatalogImageFetchUrl(raw) {
    const trimmed = raw?.trim();
    if (!trimmed || !isAllowedExternalCatalogImageUrl(trimmed))
        return null;
    try {
        const parsed = new URL(trimmed);
        const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
        if (ALLOWED_HTTP_IMAGE_HOSTS.has(host)) {
            return `http://${host}${parsed.pathname}${parsed.search}`;
        }
        return trimmed;
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=catalog-external-image.util.js.map
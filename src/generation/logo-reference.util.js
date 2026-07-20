"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveUploadPath = resolveUploadPath;
exports.resolveCatalogAssetPath = resolveCatalogAssetPath;
exports.loadImageBase64 = loadImageBase64;
exports.loadLogoBase64 = loadLogoBase64;
exports.loadLogoDataUri = loadLogoDataUri;
exports.resolvePublicAssetUrl = resolvePublicAssetUrl;
exports.loadImageDataUriFromUrl = loadImageDataUriFromUrl;
exports.normalizeAssetPath = normalizeAssetPath;
exports.loadCatalogImageDataUri = loadCatalogImageDataUri;
exports.describeLogoForPrompt = describeLogoForPrompt;
const path_1 = require("path");
const fs_1 = require("fs");
const promises_1 = require("fs/promises");
const sharp_1 = __importDefault(require("sharp"));
const logo_surface_util_1 = require("./logo-surface.util");
function getUploadsDir() {
    return process.env.UPLOADS_DIR || (0, path_1.join)(process.cwd(), '../../uploads');
}
function getCatalogHandoffDir() {
    return process.env.CATALOG_HANDOFF_DIR || (0, path_1.join)(process.cwd(), '../../data/catalog-handoff-full');
}
function resolveUploadPath(url) {
    return (0, path_1.join)(getUploadsDir(), url.replace(/^\/uploads\/?/, ''));
}
function resolveCatalogAssetPath(url) {
    const trimmed = url?.trim();
    if (!trimmed)
        return null;
    if (trimmed.startsWith('/catalog-handoff/')) {
        const rel = trimmed.replace(/^\/catalog-handoff\/?/, '').replace(/\//g, path_1.sep);
        return (0, path_1.join)(getCatalogHandoffDir(), rel);
    }
    if (trimmed.startsWith('/uploads/')) {
        return resolveUploadPath(trimmed);
    }
    return null;
}
async function loadImageBase64(filePath) {
    if (!(0, fs_1.existsSync)(filePath))
        return null;
    const buf = await (0, promises_1.readFile)(filePath);
    return buf.toString('base64');
}
async function loadLogoBase64(logoUrl, maxSide = 512) {
    const path = resolveUploadPath(logoUrl);
    if (!(0, fs_1.existsSync)(path))
        return null;
    try {
        const buf = await (0, logo_surface_util_1.prepareLogoForeground)(path, maxSide);
        return buf.toString('base64');
    }
    catch {
        return loadImageBase64(path);
    }
}
async function loadLogoDataUri(logoUrl, maxSide = 512) {
    const path = resolveUploadPath(logoUrl);
    if (!(0, fs_1.existsSync)(path))
        return null;
    try {
        const buf = await (0, logo_surface_util_1.prepareLogoForeground)(path, maxSide);
        return `data:image/png;base64,${buf.toString('base64')}`;
    }
    catch {
        const base64 = await loadImageBase64(path);
        if (!base64)
            return null;
        const ext = path.split('.').pop()?.toLowerCase();
        const mime = ext === 'jpg' || ext === 'jpeg'
            ? 'image/jpeg'
            : ext === 'webp'
                ? 'image/webp'
                : 'image/png';
        return `data:${mime};base64,${base64}`;
    }
}
function resolvePublicAssetUrl(assetPath, publicApiUrl) {
    const trimmed = assetPath?.trim();
    if (!trimmed)
        return null;
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        return trimmed.split('?')[0].split('#')[0];
    }
    const base = publicApiUrl.replace(/\/$/, '');
    if (!base)
        return null;
    const normalized = normalizeAssetPath(trimmed);
    const path = normalized.startsWith('/') ? normalized : `/${normalized}`;
    return `${base}${path}`;
}
async function fetchRemoteImageDataUri(url, maxSide) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
        const res = await fetch(url, {
            signal: controller.signal,
            redirect: 'follow',
            headers: { Accept: 'image/*' },
        });
        if (!res.ok)
            return null;
        const contentType = res.headers.get('content-type') ?? '';
        if (!contentType.includes('image') && !/\.(png|jpe?g|webp|gif)(\?|$)/i.test(url)) {
            return null;
        }
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length < 64)
            return null;
        const out = await (0, sharp_1.default)(buf)
            .resize(maxSide, maxSide, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 88, mozjpeg: true })
            .toBuffer();
        return `data:image/jpeg;base64,${out.toString('base64')}`;
    }
    catch {
        return null;
    }
    finally {
        clearTimeout(timer);
    }
}
async function loadImageDataUriFromUrl(imageUrl, maxSide = 768) {
    const trimmed = imageUrl?.trim();
    if (!trimmed)
        return null;
    const local = await loadCatalogImageDataUri(trimmed, maxSide);
    if (local)
        return local;
    if (/^https?:\/\//i.test(trimmed)) {
        return fetchRemoteImageDataUri(trimmed.split('?')[0].split('#')[0], maxSide);
    }
    return null;
}
function normalizeAssetPath(url) {
    const trimmed = url?.trim() ?? '';
    if (!trimmed)
        return '';
    const withoutQuery = trimmed.split('?')[0].split('#')[0];
    if (withoutQuery.startsWith('http://') || withoutQuery.startsWith('https://')) {
        try {
            return new URL(withoutQuery).pathname;
        }
        catch {
            return withoutQuery;
        }
    }
    return withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`;
}
async function loadCatalogImageDataUri(imageUrl, maxSide = 768) {
    const path = resolveCatalogAssetPath(imageUrl);
    if (!path || !(0, fs_1.existsSync)(path))
        return null;
    try {
        const buf = await (0, sharp_1.default)(path)
            .resize(maxSide, maxSide, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 88, mozjpeg: true })
            .toBuffer();
        return `data:image/jpeg;base64,${buf.toString('base64')}`;
    }
    catch {
        const base64 = await loadImageBase64(path);
        if (!base64)
            return null;
        const ext = path.split('.').pop()?.toLowerCase();
        const mime = ext === 'jpg' || ext === 'jpeg'
            ? 'image/jpeg'
            : ext === 'webp'
                ? 'image/webp'
                : 'image/png';
        return `data:${mime};base64,${base64}`;
    }
}
async function describeLogoForPrompt(logoUrl) {
    const path = resolveUploadPath(logoUrl);
    if (!(0, fs_1.existsSync)(path))
        return 'company logo from reference image';
    try {
        const { data, info } = await (0, sharp_1.default)(path)
            .resize(64, 64, { fit: 'inside' })
            .raw()
            .toBuffer({ resolveWithObject: true });
        const channels = info.channels ?? 3;
        let rSum = 0;
        let gSum = 0;
        let bSum = 0;
        let count = 0;
        for (let i = 0; i < data.length; i += channels) {
            const a = channels === 4 ? data[i + 3] : 255;
            if (a < 32)
                continue;
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const lum = 0.299 * r + 0.587 * g + 0.114 * b;
            const spread = Math.max(r, g, b) - Math.min(r, g, b);
            if (lum > 235 && spread < 30)
                continue;
            rSum += r;
            gSum += g;
            bSum += b;
            count++;
        }
        if (count === 0)
            return 'company logo from reference image';
        const meta = await (0, sharp_1.default)(path).metadata();
        const aspect = (meta.width ?? 1) / (meta.height ?? 1);
        const shape = aspect > 1.2 ? 'horizontal' : aspect < 0.85 ? 'vertical' : 'square or circular';
        return `${shape} company logo mark — reproduce exact design from reference image only`;
    }
    catch {
        return 'company logo from reference image';
    }
}
//# sourceMappingURL=logo-reference.util.js.map
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyLogoOnProductBuffer = applyLogoOnProductBuffer;
exports.loadBrandedCatalogImageDataUri = loadBrandedCatalogImageDataUri;
const fs_1 = require("fs");
const path_1 = require("path");
const sharp_1 = __importDefault(require("sharp"));
const logo_placement_util_1 = require("./logo-placement.util");
const logo_surface_util_1 = require("./logo-surface.util");
const logo_reference_util_1 = require("./logo-reference.util");
function uploadsDir() {
    return process.env.UPLOADS_DIR || (0, path_1.join)(process.cwd(), '../../uploads');
}
function resolveLogoPath(logoUrl) {
    return (0, path_1.join)(uploadsDir(), logoUrl.replace(/^\/uploads\/?/, ''));
}
async function applyLogoOnProductBuffer(productBuf, logoPath, productName) {
    const meta = await (0, sharp_1.default)(productBuf).metadata();
    const w = meta.width ?? 1;
    const h = meta.height ?? 1;
    const anchor = (0, logo_placement_util_1.logoAnchorForProductName)(productName);
    const surface = (0, logo_surface_util_1.detectLogoSurface)(productName);
    const logoMax = Math.round(Math.min(w, h) * anchor.maxScale);
    const logoPng = await (0, logo_surface_util_1.buildSurfacePrintLayer)(logoPath, logoMax, surface);
    const logoMeta = await (0, sharp_1.default)(logoPng).metadata();
    const lw = logoMeta.width ?? logoMax;
    const lh = logoMeta.height ?? logoMax;
    const pad = Math.round(Math.max(lw, lh) * 0.2);
    const patchW = Math.min(w, lw + pad * 2);
    const patchH = Math.min(h, lh + pad * 2);
    const cx = Math.round(w * anchor.cx);
    const cy = Math.round(h * anchor.cy);
    const left = Math.max(0, Math.min(cx - Math.round(patchW / 2), w - patchW));
    const top = Math.max(0, Math.min(cy - Math.round(patchH / 2), h - patchH));
    const patch = await (0, sharp_1.default)(productBuf)
        .extract({ left, top, width: patchW, height: patchH })
        .png()
        .toBuffer();
    const blended = await (0, logo_surface_util_1.blendLogoIntoPatch)(patch, logoPng, surface);
    return (0, sharp_1.default)(productBuf)
        .composite([{ input: blended, left, top, blend: 'over' }])
        .png()
        .toBuffer();
}
async function loadBrandedCatalogImageDataUri(imageUrl, productName, logoUrl, maxSide = 768) {
    const path = (0, logo_reference_util_1.resolveCatalogAssetPath)(imageUrl);
    const logoPath = resolveLogoPath(logoUrl);
    if (!path || !(0, fs_1.existsSync)(path) || !(0, fs_1.existsSync)(logoPath))
        return null;
    try {
        let buf = await (0, sharp_1.default)(path)
            .resize(maxSide, maxSide, { fit: 'inside', withoutEnlargement: true })
            .png()
            .toBuffer();
        buf = await applyLogoOnProductBuffer(buf, logoPath, productName);
        const jpeg = await (0, sharp_1.default)(buf).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
        return `data:image/jpeg;base64,${jpeg.toString('base64')}`;
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=catalog-branded-ref.util.js.map
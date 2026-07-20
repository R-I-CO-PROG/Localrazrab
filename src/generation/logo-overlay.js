"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyLogosAtPositions = applyLogosAtPositions;
exports.applyLogosOnProducts = applyLogosOnProducts;
exports.applyLogoOverlay = applyLogoOverlay;
const path_1 = require("path");
const fs_1 = require("fs");
const promises_1 = require("fs/promises");
const sharp_1 = __importDefault(require("sharp"));
const logo_surface_util_1 = require("./logo-surface.util");
function getUploadsDir() {
    return process.env.UPLOADS_DIR || (0, path_1.join)(process.cwd(), '../../uploads');
}
function resolveLogoPath(logoUrl) {
    const relPath = logoUrl.replace(/^\/uploads\/?/, '');
    return (0, path_1.join)(getUploadsDir(), relPath);
}
async function integrateLogoAt(sceneBuf, sceneW, sceneH, logoPath, place) {
    const surface = place.surface ?? (0, logo_surface_util_1.detectLogoSurface)(place.productName ?? '');
    const logoSize = Math.round(sceneW * place.scale);
    const logoPng = await (0, logo_surface_util_1.buildSurfacePrintLayer)(logoPath, logoSize, surface);
    const logoMeta = await (0, sharp_1.default)(logoPng).metadata();
    const lw = logoMeta.width ?? logoSize;
    const lh = logoMeta.height ?? logoSize;
    const padX = Math.round(lw * 0.35);
    const padY = Math.round(lh * 0.35);
    const patchW = lw + padX * 2;
    const patchH = lh + padY * 2;
    const centerX = Math.round(sceneW * place.centerX);
    const centerY = Math.round(sceneH * place.centerY);
    let left = centerX - Math.round(patchW / 2);
    let top = centerY - Math.round(patchH / 2);
    left = Math.max(0, Math.min(left, sceneW - patchW));
    top = Math.max(0, Math.min(top, sceneH - patchH));
    const patch = await (0, sharp_1.default)(sceneBuf)
        .extract({ left, top, width: patchW, height: patchH })
        .png()
        .toBuffer();
    const blended = await (0, logo_surface_util_1.blendLogoIntoPatch)(patch, logoPng, surface);
    return (0, sharp_1.default)(sceneBuf)
        .composite([{ input: blended, left, top, blend: 'over' }])
        .png()
        .toBuffer();
}
async function applyLogosAtPositions(outputPath, logoUrl, placements) {
    const logoPath = resolveLogoPath(logoUrl);
    if (!(0, fs_1.existsSync)(logoPath) || placements.length === 0)
        return false;
    const meta = await (0, sharp_1.default)(outputPath).metadata();
    const w = meta.width ?? 1024;
    const h = meta.height ?? 1024;
    let sceneBuf = await (0, sharp_1.default)(outputPath).png().toBuffer();
    for (const place of placements) {
        sceneBuf = await integrateLogoAt(sceneBuf, w, h, logoPath, place);
    }
    const tmpPath = `${outputPath}.logo-tmp.png`;
    await (0, sharp_1.default)(sceneBuf).png().toFile(tmpPath);
    await (0, promises_1.rename)(tmpPath, outputPath);
    return true;
}
async function applyLogosOnProducts(outputPath, logoUrl, productNames, width = 1024, height = 1024, options) {
    const { getLogoPlacementsForProducts, getLogoPlacementsForLifestyleScene } = await Promise.resolve().then(() => __importStar(require('./logo-placement.util')));
    const computedPlacements = options?.lifestyleScene
        ? getLogoPlacementsForLifestyleScene(productNames)
        : getLogoPlacementsForProducts(productNames, width, height);
    const resolved = (options?.placements ?? computedPlacements).map((p, i) => ({
        ...p,
        productName: productNames[i],
        surface: (0, logo_surface_util_1.detectLogoSurface)(productNames[i] ?? ''),
    }));
    return applyLogosAtPositions(outputPath, logoUrl, resolved);
}
async function applyLogoOverlay(outputPath, logoUrl) {
    return applyLogosAtPositions(outputPath, logoUrl, [{ centerX: 0.5, centerY: 0.12, scale: 0.14 }]);
}
//# sourceMappingURL=logo-overlay.js.map
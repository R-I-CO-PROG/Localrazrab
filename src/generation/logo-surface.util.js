"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectLogoSurface = detectLogoSurface;
exports.prepareLogoForeground = prepareLogoForeground;
exports.warpLogoForSurface = warpLogoForSurface;
exports.buildSurfacePrintLayer = buildSurfacePrintLayer;
exports.blendLogoIntoPatch = blendLogoIntoPatch;
const sharp_1 = __importDefault(require("sharp"));
function detectLogoSurface(productName) {
    const n = productName.toLowerCase();
    if (n.includes('кружк') ||
        n.includes('стакан') ||
        n.includes('термокруж') ||
        n.includes('термос') ||
        n.includes('бутылк')) {
        return 'cylinder';
    }
    if (n.includes('футбол') ||
        n.includes('поло') ||
        n.includes('худи') ||
        n.includes('свитшот') ||
        n.includes('кепк') ||
        n.includes('бини') ||
        n.includes('шарф') ||
        n.includes('носок') ||
        n.includes('мешок') ||
        n.includes('шоппер') ||
        n.includes('сумк') ||
        n.includes('рюкзак')) {
        return 'fabric';
    }
    return 'flat';
}
function knockOutLogoBackground(data, ch) {
    for (let i = 0; i < data.length; i += ch) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        const spread = Math.max(r, g, b) - Math.min(r, g, b);
        if (lum > 242 && spread < 22) {
            data[i + 3] = 0;
            continue;
        }
        if (lum > 228 && spread < 35) {
            data[i + 3] = Math.min(a, Math.round((255 - lum) * 5));
            continue;
        }
        if (lum > 200 && spread < 18) {
            data[i + 3] = Math.min(a, Math.round((228 - lum) * 4));
        }
    }
}
async function prepareLogoForeground(logoPath, maxSide) {
    const { data, info } = await (0, sharp_1.default)(logoPath)
        .resize(maxSide, maxSide, { fit: 'inside', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    const ch = info.channels;
    knockOutLogoBackground(data, ch);
    const knocked = await (0, sharp_1.default)(data, { raw: { width: info.width, height: info.height, channels: ch } })
        .png()
        .toBuffer();
    try {
        return await (0, sharp_1.default)(knocked).trim({ threshold: 8 }).png().toBuffer();
    }
    catch {
        return knocked;
    }
}
async function warpLogoForSurface(logoPng, surface) {
    const meta = await (0, sharp_1.default)(logoPng).metadata();
    const w = meta.width ?? 1;
    const h = meta.height ?? 1;
    if (surface === 'cylinder') {
        const narrowW = Math.max(8, Math.round(w * 0.86));
        const pad = Math.round((w - narrowW) / 2);
        return (0, sharp_1.default)(logoPng)
            .resize(narrowW, h, { fit: 'fill' })
            .extend({
            left: pad,
            right: w - narrowW - pad,
            background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
            .png()
            .toBuffer();
    }
    if (surface === 'fabric') {
        return (0, sharp_1.default)(logoPng)
            .resize(w, Math.max(8, Math.round(h * 0.94)), { fit: 'fill' })
            .png()
            .toBuffer();
    }
    return logoPng;
}
async function buildPrintAccent(logoPng, surface) {
    const meta = await (0, sharp_1.default)(logoPng).metadata();
    const w = meta.width ?? 1;
    const h = meta.height ?? 1;
    const blurred = await (0, sharp_1.default)(logoPng)
        .greyscale()
        .modulate({ brightness: surface === 'fabric' ? 0.55 : 0.38 })
        .blur(surface === 'fabric' ? 0.5 : surface === 'cylinder' ? 1.1 : 0.85)
        .png()
        .toBuffer();
    return (0, sharp_1.default)({
        create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
        .composite([
        { input: blurred, blend: 'over' },
        { input: logoPng, blend: 'dest-in' },
    ])
        .png()
        .toBuffer();
}
async function buildSurfacePrintLayer(logoPath, maxSide, surface) {
    const fg = await prepareLogoForeground(logoPath, maxSide);
    return warpLogoForSurface(fg, surface);
}
async function blendLogoIntoPatch(patchBuf, logoPng, surface) {
    const patchMeta = await (0, sharp_1.default)(patchBuf).metadata();
    const pw = patchMeta.width ?? 1;
    const ph = patchMeta.height ?? 1;
    const logoMeta = await (0, sharp_1.default)(logoPng).metadata();
    const lw = logoMeta.width ?? 1;
    const lh = logoMeta.height ?? 1;
    const left = Math.max(0, Math.round((pw - lw) / 2));
    const top = Math.max(0, Math.round((ph - lh) / 2));
    const logoBlend = surface === 'fabric' ? 'multiply' : surface === 'cylinder' ? 'soft-light' : 'multiply';
    const logoOpacity = surface === 'fabric' ? 0.58 : surface === 'cylinder' ? 0.66 : 0.72;
    const blurSigma = surface === 'fabric' ? 0.45 : surface === 'cylinder' ? 0.3 : 0;
    let mainLogoPipeline = (0, sharp_1.default)(logoPng);
    if (blurSigma >= 0.3) {
        mainLogoPipeline = mainLogoPipeline.blur(blurSigma);
    }
    const mainLogo = await mainLogoPipeline
        .modulate({ brightness: surface === 'fabric' ? 0.9 : 0.96 })
        .ensureAlpha()
        .linear([1, 1, 1, logoOpacity], [0, 0, 0, 0])
        .png()
        .toBuffer();
    const composites = [
        { input: mainLogo, left, top, blend: logoBlend },
    ];
    if (surface === 'fabric' || surface === 'cylinder') {
        const accentOpacity = surface === 'fabric' ? 0.34 : 0.24;
        const accent = await (0, sharp_1.default)(await buildPrintAccent(logoPng, surface))
            .ensureAlpha()
            .linear([1, 1, 1, accentOpacity], [0, 0, 0, 0])
            .png()
            .toBuffer();
        composites.unshift({
            input: accent,
            left: left + 1,
            top: top + 1,
            blend: 'multiply',
        });
    }
    return (0, sharp_1.default)(patchBuf).composite(composites).png().toBuffer();
}
//# sourceMappingURL=logo-surface.util.js.map
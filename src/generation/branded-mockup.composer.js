"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.composeBrandedMockup = composeBrandedMockup;
const path_1 = require("path");
const fs_1 = require("fs");
const sharp_1 = __importDefault(require("sharp"));
const mockup_layout_1 = require("./mockup-layout");
const logo_placement_util_1 = require("./logo-placement.util");
const logo_surface_util_1 = require("./logo-surface.util");
const product_image_util_1 = require("../products/product-image.util");
function getUploadsDir() {
    return process.env.UPLOADS_DIR || (0, path_1.join)(process.cwd(), '../../uploads');
}
function parseHex(color) {
    const hex = color.replace('#', '').trim();
    if (hex.length === 3) {
        return {
            r: parseInt(hex[0] + hex[0], 16),
            g: parseInt(hex[1] + hex[1], 16),
            b: parseInt(hex[2] + hex[2], 16),
        };
    }
    if (hex.length >= 6) {
        return {
            r: parseInt(hex.slice(0, 2), 16),
            g: parseInt(hex.slice(2, 4), 16),
            b: parseInt(hex.slice(4, 6), 16),
        };
    }
    return { r: 26, g: 26, b: 26 };
}
function escapeXml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function resolveUploadPath(url) {
    return (0, path_1.join)(getUploadsDir(), url.replace(/^\/uploads\/?/, ''));
}
function productImageUrl(product) {
    return product.imageUrl || product.silhouetteUrl || '';
}
async function tintSilhouette(filePath, size, rgb) {
    const silhouette = await (0, sharp_1.default)(filePath)
        .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();
    const meta = await (0, sharp_1.default)(silhouette).metadata();
    const w = meta.width ?? size;
    const h = meta.height ?? size;
    const colored = await (0, sharp_1.default)({
        create: { width: w, height: h, channels: 4, background: { ...rgb, alpha: 255 } },
    })
        .png()
        .composite([{ input: silhouette, blend: 'dest-in' }])
        .png()
        .toBuffer();
    const highlightSvg = `

    <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">

      <defs>

        <linearGradient id="hl" x1="0" y1="0" x2="1" y2="1">

          <stop offset="0%" stop-color="white" stop-opacity="0.28"/>

          <stop offset="50%" stop-color="white" stop-opacity="0.06"/>

          <stop offset="100%" stop-color="white" stop-opacity="0"/>

        </linearGradient>

      </defs>

      <rect width="100%" height="100%" fill="url(#hl)"/>

    </svg>

  `;
    return (0, sharp_1.default)(colored)
        .composite([{ input: Buffer.from(highlightSvg), blend: 'overlay' }])
        .png()
        .toBuffer();
}
async function prepareCatalogPhoto(filePath, size, rgb) {
    const resized = await (0, sharp_1.default)(filePath)
        .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();
    const meta = await (0, sharp_1.default)(resized).metadata();
    const w = meta.width ?? size;
    const h = meta.height ?? size;
    const isStudioPhoto = filePath.replace(/\\/g, '/').includes('/products/') &&
        (0, fs_1.existsSync)(filePath) &&
        (0, fs_1.statSync)(filePath).size >= 80_000;
    const tintOpacity = isStudioPhoto ? 0.14 : 0.22;
    const tintSvg = `

    <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">

      <rect width="100%" height="100%" fill="rgb(${rgb.r},${rgb.g},${rgb.b})" fill-opacity="${tintOpacity}"/>

    </svg>

  `;
    return (0, sharp_1.default)(resized)
        .composite([{ input: Buffer.from(tintSvg), blend: 'multiply' }])
        .png()
        .toBuffer();
}
async function prepareProductAsset(filePath, size, rgb) {
    if ((0, product_image_util_1.isRasterCatalogImage)(filePath)) {
        return prepareCatalogPhoto(filePath, size, rgb);
    }
    return tintSilhouette(filePath, size, rgb);
}
async function buildHeaderLogoOverlay(logoPath, canvasWidth) {
    const maxW = Math.round(canvasWidth * 0.14);
    const logoPng = await (0, logo_surface_util_1.prepareLogoForeground)(logoPath, maxW);
    const meta = await (0, sharp_1.default)(logoPng).metadata();
    return {
        buffer: logoPng,
        width: meta.width ?? maxW,
        height: meta.height ?? Math.round(maxW * 0.4),
    };
}
async function applyLogoOnProduct(productBuf, logoPath, productName) {
    const meta = await (0, sharp_1.default)(productBuf).metadata();
    const w = meta.width ?? 1;
    const h = meta.height ?? 1;
    const anchor = (0, logo_placement_util_1.logoAnchorForProductName)(productName ?? '');
    const surface = (0, logo_surface_util_1.detectLogoSurface)(productName ?? '');
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
    let left = Math.max(0, Math.min(cx - Math.round(patchW / 2), w - patchW));
    let top = Math.max(0, Math.min(cy - Math.round(patchH / 2), h - patchH));
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
async function buildShadow(size) {
    const w = Math.round(size * 0.8);
    const h = Math.round(size * 0.1);
    const svg = `

    <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">

      <ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2}" ry="${h / 2}" fill="black" fill-opacity="0.35"/>

    </svg>

  `;
    return (0, sharp_1.default)(Buffer.from(svg)).blur(4).png().toBuffer();
}
async function createStudioBackground(width, height, accentRgb) {
    const accent = `rgb(${accentRgb.r},${accentRgb.g},${accentRgb.b})`;
    const svg = `

    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">

      <defs>

        <radialGradient id="spot" cx="50%" cy="35%" r="75%">

          <stop offset="0%" stop-color="#35353d"/>

          <stop offset="60%" stop-color="#1a1a20"/>

          <stop offset="100%" stop-color="#0c0c10"/>

        </radialGradient>

        <linearGradient id="floor" x1="0" y1="0.55" x2="0" y2="1">

          <stop offset="0%" stop-color="${accent}" stop-opacity="0.22"/>

          <stop offset="100%" stop-color="#000" stop-opacity="0.35"/>

        </linearGradient>

        <radialGradient id="brandGlow" cx="50%" cy="40%" r="55%">

          <stop offset="0%" stop-color="${accent}" stop-opacity="0.12"/>

          <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>

        </radialGradient>

      </defs>

      <rect width="100%" height="100%" fill="url(#spot)"/>

      <rect width="100%" height="100%" fill="url(#brandGlow)"/>

      <rect width="100%" height="100%" fill="url(#floor)"/>

    </svg>

  `;
    return (0, sharp_1.default)(Buffer.from(svg)).png().toBuffer();
}
async function composeBrandedMockup(input) {
    const width = input.width ?? 1024;
    const height = input.height ?? 1024;
    const showLabels = input.showLabels !== false;
    const products = input.products.filter((p) => productImageUrl(p));
    if (products.length === 0) {
        throw new Error('Нет товаров для мокапа — добавьте позиции из каталога');
    }
    const primaryColor = parseHex(input.colors?.[0] ?? '#1A1A1A');
    const accentColor = parseHex(input.colors?.[1] ?? input.colors?.[0] ?? '#7C5CFC');
    const logoPath = input.logoUrl ? resolveUploadPath(input.logoUrl) : null;
    const hasLogo = Boolean(logoPath && (0, fs_1.existsSync)(logoPath));
    const background = await createStudioBackground(width, height, accentColor);
    const layoutMode = input.layoutMode ?? (showLabels ? 'grid' : 'scene');
    const positions = layoutMode === 'scene'
        ? (0, mockup_layout_1.computeSceneTablePositions)(products.length, width, height)
        : (0, mockup_layout_1.computeProductGrid)(products.length, width, height);
    const composites = [];
    const labels = [];
    let useHeaderLogo = false;
    for (let i = 0; i < products.length; i++) {
        const product = products[i];
        const pos = positions[i];
        const filePath = resolveUploadPath(productImageUrl(product));
        if (!(0, fs_1.existsSync)(filePath))
            continue;
        const isCatalogPhoto = (0, product_image_util_1.isRasterCatalogImage)(filePath);
        if (isCatalogPhoto)
            useHeaderLogo = true;
        let productBuf = await prepareProductAsset(filePath, pos.size, primaryColor);
        if (hasLogo && logoPath && !isCatalogPhoto) {
            productBuf = await applyLogoOnProduct(productBuf, logoPath, product.name);
        }
        const shadow = await buildShadow(pos.size);
        const shadowMeta = await (0, sharp_1.default)(shadow).metadata();
        const shadowW = shadowMeta.width ?? pos.size;
        composites.push({
            input: shadow,
            left: pos.x + Math.round((pos.size - shadowW) / 2),
            top: pos.y + pos.size - Math.round(pos.size * 0.04),
            blend: 'over',
        });
        composites.push({ input: productBuf, left: pos.x, top: pos.y, blend: 'over' });
        const labelX = pos.x + Math.round(pos.size / 2);
        if (showLabels) {
            labels.push(`<text x="${labelX}" y="${pos.labelY}" text-anchor="middle" font-family="Arial,sans-serif" font-size="12" fill="#9a9aa4">${escapeXml(product.name)}</text>`);
        }
    }
    if (hasLogo && logoPath && layoutMode === 'grid' && useHeaderLogo) {
        const headerLogo = await buildHeaderLogoOverlay(logoPath, width);
        composites.push({
            input: headerLogo.buffer,
            left: width - headerLogo.width - 28,
            top: 44,
            blend: 'over',
        });
    }
    const categoryLine = showLabels
        ? escapeXml(`${input.category ?? 'Набор'}${input.quantity ? ` · ${input.quantity} шт.` : ''}`)
        : '';
    const labelSvg = `

    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">

      ${showLabels ? `<text x="${width / 2}" y="32" text-anchor="middle" font-family="Arial,sans-serif" font-size="14" fill="#7a7a84">${categoryLine}</text>` : ''}

      ${labels.join('\n')}

    </svg>

  `;
    composites.push({ input: Buffer.from(labelSvg), left: 0, top: 0, blend: 'over' });
    await (0, sharp_1.default)(background).composite(composites).png().toFile(input.outputPath);
    return { productCount: products.length, logoAppliedPerProduct: hasLogo };
}
//# sourceMappingURL=branded-mockup.composer.js.map
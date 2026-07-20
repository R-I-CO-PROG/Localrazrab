import { join } from 'path';

import { existsSync, statSync } from 'fs';

import sharp from 'sharp';

import { computeProductGrid, computeSceneTablePositions } from './mockup-layout';
import { logoAnchorForProductName } from './logo-placement.util';
import {
  blendLogoIntoPatch,
  buildSurfacePrintLayer,
  detectLogoSurface,
  prepareLogoForeground,
} from './logo-surface.util';

import { isRasterCatalogImage } from '../products/product-image.util';



export interface MockupProduct {

  name: string;

  imageUrl: string;

  /** @deprecated use imageUrl */

  silhouetteUrl?: string;

}



export interface BrandedMockupInput {

  outputPath: string;

  width?: number;

  height?: number;

  products: MockupProduct[];

  colors?: string[];

  logoUrl?: string | null;

  category?: string;

  quantity?: number | null;

  showLabels?: boolean;

  /** grid — карточки каталога; scene — стол для AI-референса */
  layoutMode?: 'grid' | 'scene';

}



function getUploadsDir() {

  return process.env.UPLOADS_DIR || join(process.cwd(), '../../uploads');

}



function parseHex(color: string): { r: number; g: number; b: number } {

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



function escapeXml(s: string) {

  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

}



function resolveUploadPath(url: string) {

  return join(getUploadsDir(), url.replace(/^\/uploads\/?/, ''));

}



function productImageUrl(product: MockupProduct): string {

  return product.imageUrl || product.silhouetteUrl || '';

}



async function tintSilhouette(filePath: string, size: number, rgb: { r: number; g: number; b: number }) {

  const silhouette = await sharp(filePath)

    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })

    .png()

    .toBuffer();



  const meta = await sharp(silhouette).metadata();

  const w = meta.width ?? size;

  const h = meta.height ?? size;



  const colored = await sharp({

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



  return sharp(colored)

    .composite([{ input: Buffer.from(highlightSvg), blend: 'overlay' }])

    .png()

    .toBuffer();

}



/** Каталожное фото — как есть; мелкие карточки — лёгкий бренд-оттенок */

async function prepareCatalogPhoto(filePath: string, size: number, rgb: { r: number; g: number; b: number }) {

  const resized = await sharp(filePath)

    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })

    .png()

    .toBuffer();



  const meta = await sharp(resized).metadata();

  const w = meta.width ?? size;

  const h = meta.height ?? size;



  const isStudioPhoto =
    filePath.replace(/\\/g, '/').includes('/products/') &&
    existsSync(filePath) &&
    statSync(filePath).size >= 80_000;
  const tintOpacity = isStudioPhoto ? 0.14 : 0.22;

  const tintSvg = `

    <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">

      <rect width="100%" height="100%" fill="rgb(${rgb.r},${rgb.g},${rgb.b})" fill-opacity="${tintOpacity}"/>

    </svg>

  `;



  return sharp(resized)

    .composite([{ input: Buffer.from(tintSvg), blend: 'multiply' }])

    .png()

    .toBuffer();

}



async function prepareProductAsset(

  filePath: string,

  size: number,

  rgb: { r: number; g: number; b: number },

) {

  if (isRasterCatalogImage(filePath)) {

    return prepareCatalogPhoto(filePath, size, rgb);

  }

  return tintSilhouette(filePath, size, rgb);

}



async function buildHeaderLogoOverlay(
  logoPath: string,
  canvasWidth: number,
): Promise<{ buffer: Buffer; width: number; height: number }> {
  const maxW = Math.round(canvasWidth * 0.14);
  const logoPng = await prepareLogoForeground(logoPath, maxW);
  const meta = await sharp(logoPng).metadata();
  return {
    buffer: logoPng,
    width: meta.width ?? maxW,
    height: meta.height ?? Math.round(maxW * 0.4),
  };
}

async function applyLogoOnProduct(productBuf: Buffer, logoPath: string, productName?: string) {
  const meta = await sharp(productBuf).metadata();
  const w = meta.width ?? 1;
  const h = meta.height ?? 1;
  const anchor = logoAnchorForProductName(productName ?? '');
  const surface = detectLogoSurface(productName ?? '');
  const logoMax = Math.round(Math.min(w, h) * anchor.maxScale);

  const logoPng = await buildSurfacePrintLayer(logoPath, logoMax, surface);
  const logoMeta = await sharp(logoPng).metadata();
  const lw = logoMeta.width ?? logoMax;
  const lh = logoMeta.height ?? logoMax;

  const pad = Math.round(Math.max(lw, lh) * 0.2);
  const patchW = Math.min(w, lw + pad * 2);
  const patchH = Math.min(h, lh + pad * 2);
  const cx = Math.round(w * anchor.cx);
  const cy = Math.round(h * anchor.cy);
  let left = Math.max(0, Math.min(cx - Math.round(patchW / 2), w - patchW));
  let top = Math.max(0, Math.min(cy - Math.round(patchH / 2), h - patchH));

  const patch = await sharp(productBuf)
    .extract({ left, top, width: patchW, height: patchH })
    .png()
    .toBuffer();
  const blended = await blendLogoIntoPatch(patch, logoPng, surface);

  return sharp(productBuf)
    .composite([{ input: blended, left, top, blend: 'over' }])
    .png()
    .toBuffer();
}



async function buildShadow(size: number) {

  const w = Math.round(size * 0.8);

  const h = Math.round(size * 0.1);

  const svg = `

    <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">

      <ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2}" ry="${h / 2}" fill="black" fill-opacity="0.35"/>

    </svg>

  `;

  return sharp(Buffer.from(svg)).blur(4).png().toBuffer();

}



async function createStudioBackground(width: number, height: number, accentRgb: { r: number; g: number; b: number }) {

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

  return sharp(Buffer.from(svg)).png().toBuffer();

}



/** Точный мокап: каталожные фото товаров + логотип */

export async function composeBrandedMockup(input: BrandedMockupInput): Promise<{

  productCount: number;

  logoAppliedPerProduct: boolean;

}> {

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

  const hasLogo = Boolean(logoPath && existsSync(logoPath));



  const background = await createStudioBackground(width, height, accentColor);

  const layoutMode = input.layoutMode ?? (showLabels ? 'grid' : 'scene');
  const positions =
    layoutMode === 'scene'
      ? computeSceneTablePositions(products.length, width, height)
      : computeProductGrid(products.length, width, height);

  const composites: sharp.OverlayOptions[] = [];

  const labels: string[] = [];
  let useHeaderLogo = false;



  for (let i = 0; i < products.length; i++) {

    const product = products[i];

    const pos = positions[i];

    const filePath = resolveUploadPath(productImageUrl(product));

    if (!existsSync(filePath)) continue;

    const isCatalogPhoto = isRasterCatalogImage(filePath);
    if (isCatalogPhoto) useHeaderLogo = true;



    let productBuf = await prepareProductAsset(filePath, pos.size, primaryColor);

    if (hasLogo && logoPath && !isCatalogPhoto) {

      productBuf = await applyLogoOnProduct(productBuf, logoPath, product.name);

    }



    const shadow = await buildShadow(pos.size);

    const shadowMeta = await sharp(shadow).metadata();

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
      labels.push(

        `<text x="${labelX}" y="${pos.labelY}" text-anchor="middle" font-family="Arial,sans-serif" font-size="12" fill="#9a9aa4">${escapeXml(product.name)}</text>`,

      );
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

  await sharp(background).composite(composites).png().toFile(input.outputPath);



  return { productCount: products.length, logoAppliedPerProduct: hasLogo };

}



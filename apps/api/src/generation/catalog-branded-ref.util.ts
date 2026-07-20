import { existsSync } from 'fs';
import { join } from 'path';
import sharp from 'sharp';
import { logoAnchorForProductName } from './logo-placement.util';
import {
  blendLogoIntoPatch,
  buildSurfacePrintLayer,
  detectLogoSurface,
} from './logo-surface.util';
import { resolveCatalogAssetPath } from './logo-reference.util';

function uploadsDir(): string {
  return process.env.UPLOADS_DIR || join(process.cwd(), '../../uploads');
}

function resolveLogoPath(logoUrl: string): string {
  return join(uploadsDir(), logoUrl.replace(/^\/uploads\/?/, ''));
}

/** Наносит логотип на растровое фото товара (как в mockup-композиторе) */
export async function applyLogoOnProductBuffer(
  productBuf: Buffer,
  logoPath: string,
  productName: string,
): Promise<Buffer> {
  const meta = await sharp(productBuf).metadata();
  const w = meta.width ?? 1;
  const h = meta.height ?? 1;
  const anchor = logoAnchorForProductName(productName);
  const surface = detectLogoSurface(productName);
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
  const left = Math.max(0, Math.min(cx - Math.round(patchW / 2), w - patchW));
  const top = Math.max(0, Math.min(cy - Math.round(patchH / 2), h - patchH));

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

/** Каталожное фото с уже нанесённым логотипом — для AI-референса */
export async function loadBrandedCatalogImageDataUri(
  imageUrl: string,
  productName: string,
  logoUrl: string,
  maxSide = 768,
): Promise<string | null> {
  const path = resolveCatalogAssetPath(imageUrl);
  const logoPath = resolveLogoPath(logoUrl);
  if (!path || !existsSync(path) || !existsSync(logoPath)) return null;

  try {
    let buf = await sharp(path)
      .resize(maxSide, maxSide, { fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer();
    buf = await applyLogoOnProductBuffer(buf, logoPath, productName);
    const jpeg = await sharp(buf).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
    return `data:image/jpeg;base64,${jpeg.toString('base64')}`;
  } catch {
    return null;
  }
}

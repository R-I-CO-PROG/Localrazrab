import { join } from 'path';
import { existsSync } from 'fs';
import { rename } from 'fs/promises';
import sharp from 'sharp';
import type { LogoPlacement } from './mockup-layout';
import {
  blendLogoIntoPatch,
  buildSurfacePrintLayer,
  detectLogoSurface,
  type LogoSurface,
} from './logo-surface.util';

function getUploadsDir() {
  return process.env.UPLOADS_DIR || join(process.cwd(), '../../uploads');
}

function resolveLogoPath(logoUrl: string) {
  const relPath = logoUrl.replace(/^\/uploads\/?/, '');
  return join(getUploadsDir(), relPath);
}

export interface ProductLogoPlacement extends LogoPlacement {
  surface?: LogoSurface;
  productName?: string;
}

async function integrateLogoAt(
  sceneBuf: Buffer,
  sceneW: number,
  sceneH: number,
  logoPath: string,
  place: ProductLogoPlacement,
): Promise<Buffer> {
  const surface = place.surface ?? detectLogoSurface(place.productName ?? '');
  const logoSize = Math.round(sceneW * place.scale);
  const logoPng = await buildSurfacePrintLayer(logoPath, logoSize, surface);

  const logoMeta = await sharp(logoPng).metadata();
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

  const patch = await sharp(sceneBuf)
    .extract({ left, top, width: patchW, height: patchH })
    .png()
    .toBuffer();

  const blended = await blendLogoIntoPatch(patch, logoPng, surface);

  return sharp(sceneBuf)
    .composite([{ input: blended, left, top, blend: 'over' }])
    .png()
    .toBuffer();
}

/** Вписывает логотип в каждый товар: печать / вышивка, без чёрного квадрата-стикера */
export async function applyLogosAtPositions(
  outputPath: string,
  logoUrl: string,
  placements: ProductLogoPlacement[],
): Promise<boolean> {
  const logoPath = resolveLogoPath(logoUrl);
  if (!existsSync(logoPath) || placements.length === 0) return false;

  const meta = await sharp(outputPath).metadata();
  const w = meta.width ?? 1024;
  const h = meta.height ?? 1024;

  let sceneBuf = await sharp(outputPath).png().toBuffer();
  for (const place of placements) {
    sceneBuf = await integrateLogoAt(sceneBuf, w, h, logoPath, place);
  }

  const tmpPath = `${outputPath}.logo-tmp.png`;
  await sharp(sceneBuf).png().toFile(tmpPath);
  await rename(tmpPath, outputPath);
  return true;
}

/** Логотип на каждый выбранный товар с учётом типа поверхности */
export async function applyLogosOnProducts(
  outputPath: string,
  logoUrl: string,
  productNames: string[],
  width = 1024,
  height = 1024,
  options?: { placements?: ProductLogoPlacement[]; lifestyleScene?: boolean },
): Promise<boolean> {
  const { getLogoPlacementsForProducts, getLogoPlacementsForLifestyleScene } = await import(
    './logo-placement.util'
  );
  const computedPlacements = options?.lifestyleScene
    ? getLogoPlacementsForLifestyleScene(productNames)
    : getLogoPlacementsForProducts(productNames, width, height);
  const resolved: ProductLogoPlacement[] = (options?.placements ?? computedPlacements).map(
    (p, i) => ({
      ...p,
      productName: productNames[i],
      surface: detectLogoSurface(productNames[i] ?? ''),
    }),
  );
  return applyLogosAtPositions(outputPath, logoUrl, resolved);
}

/** @deprecated */
export async function applyLogoOverlay(outputPath: string, logoUrl: string): Promise<boolean> {
  return applyLogosAtPositions(outputPath, logoUrl, [{ centerX: 0.5, centerY: 0.12, scale: 0.14 }]);
}

import sharp from 'sharp';
import { blendLogoIntoPatch, warpLogoForSurface, type LogoSurface } from './logo-surface.util';
import type { Placement } from './imprint-validation';

export interface PlacementPx {
  left: number;
  top: number;
  width: number;
  height: number;
  rotation: number;
}

export interface DraftLayer {
  /** Готовый арт с альфой: логотип или отрисованный текст */
  artPng: Buffer;
  placement: Placement;
  surface: LogoSurface;
}

/** Нормализованные координаты → пиксели кадра, с зажимом внутрь границ */
export function placementToPixels(p: Placement, sceneW: number, sceneH: number): PlacementPx {
  const width = Math.max(1, Math.min(sceneW, Math.round(p.w * sceneW)));
  const height = Math.max(1, Math.min(sceneH, Math.round(p.h * sceneH)));

  let left = Math.round(p.cx * sceneW - width / 2);
  let top = Math.round(p.cy * sceneH - height / 2);

  left = Math.max(0, Math.min(left, sceneW - width));
  top = Math.max(0, Math.min(top, sceneH - height));

  return { left, top, width, height, rotation: p.rotation };
}

/**
 * Плоская наклейка на фото: точная позиция, размер и поворот.
 * Это РАЗМЕТКА для image-модели, а не финальный результат.
 */
export async function buildDraftComposite(sourcePng: Buffer, layers: DraftLayer[]): Promise<Buffer> {
  const meta = await sharp(sourcePng).metadata();
  const sceneW = meta.width ?? 1024;
  const sceneH = meta.height ?? 1024;

  let scene = await sharp(sourcePng).png().toBuffer();

  for (const layer of layers) {
    const box = placementToPixels(layer.placement, sceneW, sceneH);

    let art = await sharp(layer.artPng)
      .resize(box.width, box.height, { fit: 'inside', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();

    art = await warpLogoForSurface(art, layer.surface);

    if (box.rotation !== 0) {
      art = await sharp(art)
        .rotate(box.rotation, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();
    }

    const artMeta = await sharp(art).metadata();
    const aw = Math.min(artMeta.width ?? box.width, sceneW);
    const ah = Math.min(artMeta.height ?? box.height, sceneH);

    // blendLogoIntoPatch требует, чтобы арт не превышал патч ни по одной оси
    // (sharp.composite бросает исключение иначе). Поворот раздувает холст
    // арта — ужимаем его обратно под клампнутый размер патча.
    if ((artMeta.width ?? aw) > aw || (artMeta.height ?? ah) > ah) {
      art = await sharp(art)
        .resize(aw, ah, { fit: 'inside', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();
    }

    const artFinalMeta = await sharp(art).metadata();
    const fw = artFinalMeta.width ?? aw;
    const fh = artFinalMeta.height ?? ah;

    // Поворот увеличивает холст арта — пересчитываем рамку от центра
    const centerX = box.left + Math.round(box.width / 2);
    const centerY = box.top + Math.round(box.height / 2);
    const left = Math.max(0, Math.min(centerX - Math.round(fw / 2), sceneW - fw));
    const top = Math.max(0, Math.min(centerY - Math.round(fh / 2), sceneH - fh));

    const patch = await sharp(scene).extract({ left, top, width: fw, height: fh }).png().toBuffer();
    const blended = await blendLogoIntoPatch(patch, art, layer.surface);

    scene = await sharp(scene).composite([{ input: blended, left, top, blend: 'over' }]).png().toBuffer();
  }

  return scene;
}

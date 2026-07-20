import sharp from "sharp";
import {
  PRODUCT_HERO_PANEL_W,
  PRODUCT_SLIDE_H,
  PRODUCT_SLIDE_W,
  type ProductHeroSide,
} from "./product-slide-layout";

const WHITE_BG = { r: 255, g: 255, b: 255 };

/** Масштабирует изображение с сохранением пропорций в панель 960×1080 на белом фоне. */
export async function normalizeHeroPanelImage(buffer: Buffer): Promise<Buffer> {
  const image = sharp(buffer);
  const meta = await image.metadata();
  const imgW = meta.width ?? PRODUCT_HERO_PANEL_W;
  const imgH = meta.height ?? PRODUCT_SLIDE_H;

  const scale = Math.min(PRODUCT_HERO_PANEL_W / imgW, PRODUCT_SLIDE_H / imgH, 1);
  const w = Math.max(1, Math.round(imgW * scale));
  const h = Math.max(1, Math.round(imgH * scale));
  const left = Math.round((PRODUCT_HERO_PANEL_W - w) / 2);
  const top = Math.round((PRODUCT_SLIDE_H - h) / 2);

  const resized = await image.resize(w, h, { fit: "inside", withoutEnlargement: false }).toBuffer();

  return sharp({
    create: {
      width: PRODUCT_HERO_PANEL_W,
      height: PRODUCT_SLIDE_H,
      channels: 3,
      background: WHITE_BG,
    },
  })
    .composite([{ input: resized, left, top }])
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
}

/** Собирает 16:9 слайд: текст слева — белый фон, справа — фото с contain. */
export async function composeSlideWithHeroPanel(
  heroPanel: Buffer,
  heroSide: ProductHeroSide,
): Promise<Buffer> {
  const panel = await normalizeHeroPanelImage(heroPanel);
  const heroLeft = heroSide === "left" ? 0 : PRODUCT_HERO_PANEL_W;

  return sharp({
    create: {
      width: PRODUCT_SLIDE_W,
      height: PRODUCT_SLIDE_H,
      channels: 3,
      background: WHITE_BG,
    },
  })
    .composite([{ input: panel, left: heroLeft, top: 0 }])
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
}

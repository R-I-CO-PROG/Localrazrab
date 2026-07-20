import sharp from "sharp";
import {
  PRODUCT_HERO_PANEL_W,
  PRODUCT_SLIDE_H,
  PRODUCT_SLIDE_W,
  PRODUCT_TEXT_PANEL_W,
  type ProductHeroSide,
} from "../product-slide-layout";

function parseDataUrl(dataUrl: string): Buffer | null {
  const match = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
  if (!match?.[1]) return null;
  return Buffer.from(match[1], "base64");
}

async function isolateProduct(source: Buffer): Promise<Buffer> {
  try {
    const trimmed = await sharp(source).trim({ threshold: 24 }).png().toBuffer();
    const meta = await sharp(trimmed).metadata();
    if ((meta.width ?? 0) > 80 && (meta.height ?? 0) > 80) {
      return trimmed;
    }
  } catch {
    /* trim failed — use full frame */
  }
  return source;
}

/**
 * Reframes any product hero into a strict split: empty text half + product in the hero half.
 * Guarantees presentation text never overlaps the product regardless of AI composition.
 */
export async function reframeProductHeroImage(
  source: Buffer | string,
  heroSide: ProductHeroSide,
  backgroundRgb: { r: number; g: number; b: number },
): Promise<Buffer> {
  const inputBuf =
    typeof source === "string"
      ? source.startsWith("data:")
        ? parseDataUrl(source)
        : null
      : source;
  if (!inputBuf) {
    throw new Error("Invalid product hero source");
  }

  const normalized = await sharp(inputBuf)
    .resize(PRODUCT_SLIDE_W, PRODUCT_SLIDE_H, { fit: "cover", position: "centre" })
    .png()
    .toBuffer();

  const productBuf = await isolateProduct(normalized);
  const maxW = Math.round(PRODUCT_HERO_PANEL_W * 0.9);
  const maxH = Math.round(PRODUCT_SLIDE_H * 0.86);

  const fitted = await sharp(productBuf)
    .resize(maxW, maxH, { fit: "inside" })
    .png()
    .toBuffer();

  const fittedMeta = await sharp(fitted).metadata();
  const fw = fittedMeta.width ?? maxW;
  const fh = fittedMeta.height ?? maxH;

  const heroOnRight = heroSide === "right";
  const panelLeft = heroOnRight ? PRODUCT_TEXT_PANEL_W : 0;
  const px = panelLeft + Math.round((PRODUCT_HERO_PANEL_W - fw) / 2);
  const py = Math.round((PRODUCT_SLIDE_H - fh) / 2);

  const base = await sharp({
    create: {
      width: PRODUCT_SLIDE_W,
      height: PRODUCT_SLIDE_H,
      channels: 3,
      background: backgroundRgb,
    },
  })
    .png()
    .toBuffer();

  return sharp(base)
    .composite([{ input: fitted, left: px, top: py }])
    .jpeg({ quality: 90 })
    .toBuffer();
}

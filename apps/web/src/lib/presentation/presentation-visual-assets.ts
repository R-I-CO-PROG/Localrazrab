import sharp from "sharp";
import type { DeckArtDirection } from "./presentation-art-direction";
import {
  PRODUCT_HERO_PANEL_W,
  PRODUCT_SLIDE_H,
} from "@/lib/presentation-ai/product-slide-layout";

const HERO_W = PRODUCT_HERO_PANEL_W;
const HERO_H = PRODUCT_SLIDE_H;
const COVER_W = 1920;
const COVER_H = 1080;

function parseDataUrl(dataUrl: string): { buffer: Buffer; mime: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match?.[2]) return null;
  return { mime: match[1], buffer: Buffer.from(match[2], "base64") };
}

async function loadImageBuffer(source: string): Promise<Buffer | null> {
  if (source.startsWith("data:")) {
    return parseDataUrl(source)?.buffer ?? null;
  }
  try {
    const res = await fetch(source, { signal: AbortSignal.timeout(25_000) });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/** Убирает белый/светлый фон у PNG товара для студийной вставки */
async function prepareProductCutout(buffer: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const channels = info.channels;
  const pixels = data.length / channels;

  for (let i = 0; i < pixels; i++) {
    const offset = i * channels;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const avg = (r + g + b) / 3;
    if (avg > 238 && Math.abs(r - g) < 18 && Math.abs(g - b) < 18) {
      data[offset + 3] = 0;
    } else if (avg > 210) {
      data[offset + 3] = Math.min(data[offset + 3], Math.round(255 - (avg - 210) * 6));
    }
  }

  return sharp(data, {
    raw: { width: info.width, height: info.height, channels: info.channels },
  })
    .png()
    .toBuffer();
}

function radialGradientSvg(width: number, height: number, art: DeckArtDirection): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs>
      <radialGradient id="glow" cx="35%" cy="45%" r="65%">
        <stop offset="0%" stop-color="#${art.glowHex}" stop-opacity="0.35"/>
        <stop offset="55%" stop-color="#${art.bgBottom}" stop-opacity="0.9"/>
        <stop offset="100%" stop-color="#${art.bgTop}" stop-opacity="1"/>
      </radialGradient>
      <linearGradient id="base" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#${art.bgTop}"/>
        <stop offset="100%" stop-color="#${art.bgBottom}"/>
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#base)"/>
    <rect width="100%" height="100%" fill="url(#glow)"/>
    <ellipse cx="${width * 0.32}" cy="${height * 0.78}" rx="${width * 0.28}" ry="${height * 0.06}" fill="#000000" opacity="0.45"/>
  </svg>`;
}

function networkLinesSvg(width: number, height: number, accent: string): string {
  const lines = [
    `M0 ${height * 0.3} Q ${width * 0.25} ${height * 0.15} ${width * 0.5} ${height * 0.35}`,
    `M${width * 0.2} 0 Q ${width * 0.55} ${height * 0.25} ${width} ${height * 0.2}`,
    `M0 ${height * 0.7} Q ${width * 0.4} ${height * 0.55} ${width} ${height * 0.65}`,
  ];
  const dots = [
    [width * 0.25, height * 0.22],
    [width * 0.55, height * 0.35],
    [width * 0.72, height * 0.18],
    [width * 0.4, height * 0.58],
  ];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    ${lines
      .map(
        (d) =>
          `<path d="${d}" stroke="#${accent}" stroke-width="1.2" fill="none" opacity="0.22"/>`,
      )
      .join("")}
    ${dots
      .map(
        ([cx, cy]) =>
          `<circle cx="${cx}" cy="${cy}" r="4" fill="#${accent}" opacity="0.35"/>`,
      )
      .join("")}
  </svg>`;
}

export async function createStudioProductHero(
  imageSource: string,
  art: DeckArtDirection,
  heroSide: "left" | "right" = "right",
): Promise<string | undefined> {
  const raw = await loadImageBuffer(imageSource);
  if (!raw) return imageSource.startsWith("data:") ? imageSource : undefined;

  try {
    const cutout = await prepareProductCutout(raw);
    const product = await sharp(cutout)
      .resize({ height: Math.round(HERO_H * 0.62), fit: "inside" })
      .png()
      .toBuffer();
    const meta = await sharp(product).metadata();
    const pw = meta.width ?? 400;
    const ph = meta.height ?? 400;

    const base = await sharp(Buffer.from(radialGradientSvg(HERO_W, HERO_H, art)))
      .png()
      .toBuffer();

    const shadow = await sharp(product)
      .resize(pw, ph)
      .blur(18)
      .modulate({ brightness: 0.15 })
      .png()
      .toBuffer();

    const px = Math.round((HERO_W - pw) / 2);
    const py = Math.round(HERO_H * 0.14);
    const shadowY = py + ph - Math.round(ph * 0.08);

    const reflection = await sharp(product)
      .flip()
      .resize(pw, Math.round(ph * 0.22))
      .linear(1, -40)
      .png()
      .toBuffer();

    const composed = await sharp(base)
      .composite([
        { input: shadow, left: px + 12, top: shadowY, blend: "over" },
        { input: product, left: px, top: py },
        {
          input: reflection,
          left: px,
          top: py + ph + 8,
          blend: "over",
        },
      ])
      .jpeg({ quality: 92, mozjpeg: true })
      .toBuffer();

    return `data:image/jpeg;base64,${composed.toString("base64")}`;
  } catch {
    return imageSource.startsWith("data:") ? imageSource : undefined;
  }
}

export async function createCinematicCoverBackground(
  art: DeckArtDirection,
  thumbSources: string[] = [],
): Promise<string> {
  const base = await sharp(Buffer.from(radialGradientSvg(COVER_W, COVER_H, art)))
    .composite([
      {
        input: Buffer.from(networkLinesSvg(COVER_W, COVER_H, art.accentHex)),
        blend: "over",
      },
    ])
    .png()
    .toBuffer();

  const thumbs = thumbSources.slice(0, 5);
  const composites: sharp.OverlayOptions[] = [];

  for (let i = 0; i < thumbs.length; i++) {
    const buf = await loadImageBuffer(thumbs[i]);
    if (!buf) continue;
    try {
      const thumb = await sharp(buf)
        .resize(220, 220, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();
      const gap = 240;
      const totalW = thumbs.length * gap;
      const startX = Math.round((COVER_W - totalW) / 2 + i * gap);
      composites.push({
        input: thumb,
        left: startX,
        top: COVER_H - 300,
        blend: "over",
      });
    } catch {
      /* skip thumb */
    }
  }

  const final = composites.length
    ? await sharp(base).composite(composites).jpeg({ quality: 90 }).toBuffer()
    : await sharp(base).jpeg({ quality: 90 }).toBuffer();

  return `data:image/jpeg;base64,${final.toString("base64")}`;
}

export async function createOverviewMosaic(
  imageSources: string[],
  art: DeckArtDirection,
): Promise<string | undefined> {
  const sources = imageSources.filter(Boolean).slice(0, 4);
  if (!sources.length) return undefined;

  const cells: Buffer[] = [];
  for (const src of sources) {
    const buf = await loadImageBuffer(src);
    if (!buf) continue;
    cells.push(
      await sharp(buf)
        .resize(420, 420, { fit: "cover", position: "centre" })
        .jpeg({ quality: 88 })
        .toBuffer(),
    );
  }
  if (!cells.length) return undefined;

  const bg = await sharp(Buffer.from(radialGradientSvg(900, 900, art)))
    .png()
    .toBuffer();

  if (cells.length === 1) {
    const one = await sharp(bg)
      .composite([{ input: cells[0], left: 90, top: 90 }])
      .jpeg({ quality: 90 })
      .toBuffer();
    return `data:image/jpeg;base64,${one.toString("base64")}`;
  }

  const positions = [
    { left: 30, top: 30 },
    { left: 450, top: 30 },
    { left: 30, top: 450 },
    { left: 450, top: 450 },
  ];
  const composed = await sharp(bg)
    .composite(
      cells.map((input, i) => ({
        input,
        left: positions[i]?.left ?? 30,
        top: positions[i]?.top ?? 30,
      })),
    )
    .jpeg({ quality: 90 })
    .toBuffer();

  return `data:image/jpeg;base64,${composed.toString("base64")}`;
}

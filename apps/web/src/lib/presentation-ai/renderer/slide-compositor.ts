import sharp from "sharp";
import { resolveImageForPptx } from "@/lib/presentation/presentation-images";
import type { GeneratedSlide, PresentationTheme } from "../types";
import { generateNativeAiPptxBuffer } from "./pptx-ai-native";
import { initPresentationFonts, textPath, wrapTextLines } from "./svg-text";
import { PRODUCT_TEXT_PANEL_W, textPanelX } from "../product-slide-layout";
import { composeSlideWithHeroPanel, normalizeHeroPanelImage } from "../split-hero-image";

const W = 1920;
const H = 1080;
const FOOTER_H = 36;
const CONTENT_H = H - FOOTER_H;
const M = 56;

function truncate(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

async function loadImageBuffer(url?: string): Promise<Buffer | null> {
  if (!url?.trim()) return null;
  try {
    const dataUrl = await resolveImageForPptx(url);
    if (!dataUrl?.startsWith("data:")) return null;
    const match = /^data:[^;]+;base64,(.+)$/i.exec(dataUrl);
    if (!match) return null;
    return Buffer.from(match[1], "base64");
  } catch {
    return null;
  }
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  if (h.length === 6) {
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    };
  }
  return { r: 2, g: 8, b: 24 };
}

function solidColor(color: string, fallback: string): string {
  return color.startsWith("#") ? color : fallback;
}

function overlayGradientDefs(): string {
  return `
    <defs>
      <linearGradient id="overlay-x" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#020818" stop-opacity="0.92"/>
        <stop offset="45%" stop-color="#020818" stop-opacity="0.72"/>
        <stop offset="72%" stop-color="#020818" stop-opacity="0.28"/>
        <stop offset="100%" stop-color="#020818" stop-opacity="0.06"/>
      </linearGradient>
      <linearGradient id="overlay-y" x1="0.5" y1="0" x2="0.5" y2="1">
        <stop offset="0%" stop-color="#000000" stop-opacity="0.12"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0.38"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="${CONTENT_H}" fill="url(#overlay-x)"/>
    <rect width="${W}" height="${CONTENT_H}" fill="url(#overlay-y)"/>
  `;
}

function footerSvg(theme: PresentationTheme, left: string, right: string): string {
  const primary = solidColor(theme.colors.primary, "#005BFF");
  const text = solidColor(theme.colors.text, "#FFFFFF");
  return `
    <rect x="0" y="${CONTENT_H}" width="${W}" height="${FOOTER_H}" fill="${primary}"/>
    ${textPath({ text: left, x: 24, y: CONTENT_H + 24, fontSize: 18, fill: text, opacity: 0.92 })}
    ${textPath({ text: right, x: W - 24, y: CONTENT_H + 24, fontSize: 18, fill: text, opacity: 0.92, anchor: "end" })}
  `;
}

function textBlockSvg(input: {
  title: string;
  subtitle?: string;
  description?: string;
  theme: PresentationTheme;
  yStart?: number;
  x?: number;
  maxChars?: number;
}): string {
  const text = solidColor(input.theme.colors.text, "#FFFFFF");
  const accent = solidColor(input.theme.colors.accent, "#00B7FF");
  const muted = solidColor(input.theme.colors.mutedText, "#94A3B8");
  const x = input.x ?? M;
  let y = input.yStart ?? 120;
  const maxChars = input.maxChars ?? 58;

  let svg = textPath({
    text: truncate(input.title.toUpperCase(), 48),
    x,
    y,
    fontSize: 52,
    fill: text,
    bold: true,
    letterSpacing: 2,
  });
  y += 62;

  if (input.subtitle) {
    svg += textPath({
      text: truncate(input.subtitle, 90),
      x,
      y,
      fontSize: 28,
      fill: accent,
      bold: true,
    });
    y += 44;
  }

  if (input.description) {
    const lines = wrapTextLines(input.description, maxChars, 5);
    for (const line of lines) {
      svg += textPath({ text: line, x, y, fontSize: 22, fill: muted });
      y += 32;
    }
  }

  return svg;
}

function heroOnRight(_slide: GeneratedSlide): boolean {
  return true;
}

async function compositeProductBackground(
  heroUrl: string | undefined,
  fallbackHex: string | undefined,
): Promise<sharp.Sharp> {
  const heroBuf = await loadImageBuffer(heroUrl);
  if (heroBuf) {
    const split = await composeSlideWithHeroPanel(heroBuf, "right");
    return sharp(split);
  }
  const rgb = hexToRgb(fallbackHex ?? "#FFFFFF");
  return sharp({
    create: { width: W, height: H, channels: 3, background: rgb },
  });
}

async function compositeBackground(
  heroUrl?: string,
  fallbackHex?: string,
  position: "left" | "right" | "centre" = "centre",
): Promise<sharp.Sharp> {
  const heroBuf = await loadImageBuffer(heroUrl);
  if (heroBuf) {
    return sharp(heroBuf).resize(W, H, { fit: "cover", position });
  }
  return sharp({
    create: {
      width: W,
      height: H,
      channels: 3,
      background: hexToRgb(fallbackHex ?? "#020818"),
    },
  });
}

async function renderOverviewSlide(
  slide: GeneratedSlide,
  theme: PresentationTheme,
  footerLeft: string,
  footerRight: string,
): Promise<Buffer> {
  const base = await compositeBackground(
    slide.heroImage?.url ?? slide.backgroundImage?.url,
    theme.colors.background,
  );

  const items = slide.overviewItems ?? [];
  let listSvg = "";
  let y = 380;
  const text = solidColor(theme.colors.text, "#FFFFFF");
  for (const item of items.slice(0, 6)) {
    const accent = solidColor(theme.colors.accent, "#00B7FF");
    listSvg += `<circle cx="${M + 8}" cy="${y - 8}" r="7" fill="${accent}"/>`;
    listSvg += textPath({
      text: truncate(item.name, 52),
      x: M + 28,
      y,
      fontSize: 24,
      fill: text,
      bold: true,
    });
    y += 44;
  }

  const bars = (slide.bottomHighlights ?? []).slice(0, 2);
  let barsSvg = "";
  bars.forEach((bar, i) => {
    const x = M + i * 500;
    const yBar = CONTENT_H - 130;
    const card = solidColor(theme.colors.card, "rgba(12,40,72,0.72)");
    const accent = solidColor(theme.colors.accent, "#00B7FF");
    const barText = solidColor(theme.colors.text, "#FFFFFF");
    const muted = solidColor(theme.colors.mutedText, "#94A3B8");
    barsSvg += `
      <rect x="${x}" y="${yBar}" width="470" height="78" rx="8" fill="${card}" fill-opacity="0.55" stroke="${accent}" stroke-opacity="0.35" stroke-width="1"/>
      <rect x="${x}" y="${yBar}" width="4" height="78" fill="${accent}"/>
      ${textPath({ text: truncate(bar.label, 55), x: x + 18, y: yBar + 28, fontSize: 20, fill: barText, bold: true })}
      ${textPath({ text: truncate(bar.accent, 60), x: x + 18, y: yBar + 54, fontSize: 17, fill: muted })}
    `;
  });

  const overlay = Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    ${overlayGradientDefs()}
    ${textBlockSvg({
      title: slide.title,
      subtitle: slide.subtitle,
      description: slide.description,
      theme,
      yStart: 110,
    })}
    ${listSvg}
    ${barsSvg}
    ${footerSvg(theme, footerLeft, footerRight)}
  </svg>`);

  const composites: sharp.OverlayOptions[] = [{ input: overlay, top: 0, left: 0 }];
  return base.composite(composites).png().toBuffer();
}

async function renderProductSlide(
  slide: GeneratedSlide,
  theme: PresentationTheme,
  footerLeft: string,
  footerRight: string,
): Promise<Buffer> {
  const textX = M;
  const barW = Math.floor((PRODUCT_TEXT_PANEL_W - 2 * M - 20) / 2);

  const base = await compositeProductBackground(
    slide.heroImage?.url ?? slide.backgroundImage?.url,
    theme.colors.background,
  );

  const text = solidColor(theme.colors.text, "#0F172A");
  const accent = solidColor(theme.colors.accent, "#2563EB");
  const muted = solidColor(theme.colors.mutedText, "#64748B");
  const card = solidColor(theme.colors.card, "#F8FAFC");

  let headerSvg = textBlockSvg({
    title: slide.title,
    subtitle: slide.subtitle,
    description: slide.description,
    theme,
    yStart: 110,
    x: textX,
    maxChars: 44,
  });

  if (slide.showPrice && slide.price != null) {
    headerSvg += textPath({
      text: `${String(slide.price)} ₽`,
      x: textX,
      y: 340,
      fontSize: 24,
      fill: muted,
      bold: true,
    });
  }

  if (slide.caption && !slide.description) {
    headerSvg += textPath({
      text: truncate(slide.caption, 120),
      x: textX,
      y: 380,
      fontSize: 22,
      fill: muted,
    });
  }

  let listSvg = "";
  let listY = slide.benefits?.length ? 520 : 400;
  for (const item of (slide.overviewItems ?? []).slice(0, 6)) {
    listSvg += `<circle cx="${textX + 8}" cy="${listY - 8}" r="7" fill="${accent}"/>`;
    listSvg += textPath({
      text: truncate(item.name, 52),
      x: textX + 28,
      y: listY,
      fontSize: 22,
      fill: text,
      bold: true,
    });
    listY += 40;
  }
  for (const bullet of (slide.bullets ?? []).slice(0, 4)) {
    listSvg += `<circle cx="${textX + 8}" cy="${listY - 8}" r="7" fill="${accent}"/>`;
    listSvg += textPath({ text: truncate(bullet, 80), x: textX + 28, y: listY, fontSize: 20, fill: text });
    listY += 40;
  }

  const benefits = slide.benefits ?? [];
  let benefitsSvg = "";
  const cols = 2;
  const cellW = Math.floor((PRODUCT_TEXT_PANEL_W - 2 * M - 20) / cols);
  const cellH = 130;
  const gridX = textX;
  const gridY = 380;

  benefits.slice(0, 4).forEach((b, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = gridX + col * (cellW + 20);
    const y = gridY + row * (cellH + 16);
    benefitsSvg += `
      <rect x="${x}" y="${y}" width="${cellW}" height="${cellH}" rx="12" fill="${card}" fill-opacity="0.52" stroke="${accent}" stroke-opacity="0.35" stroke-width="1"/>
      <circle cx="${x + 28}" cy="${y + 34}" r="18" fill="none" stroke="${accent}" stroke-width="1.5"/>
      ${textPath({ text: "★", x: x + 28, y: y + 40, fontSize: 16, fill: accent, anchor: "middle" })}
      ${textPath({ text: truncate(b.title, 30), x: x + 56, y: y + 30, fontSize: 20, fill: text, bold: true })}
      ${textPath({ text: truncate(b.text, 72), x: x + 16, y: y + 58, fontSize: 17, fill: muted })}
    `;
  });

  const bars = (slide.bottomHighlights ?? []).slice(0, 2);
  let barsSvg = "";
  bars.forEach((bar, i) => {
    const x = textX + i * (barW + 20);
    const yBar = CONTENT_H - 130;
    barsSvg += `
      <rect x="${x}" y="${yBar}" width="${barW}" height="78" rx="8" fill="${card}" fill-opacity="0.55" stroke="${accent}" stroke-opacity="0.35" stroke-width="1"/>
      <rect x="${x}" y="${yBar}" width="4" height="78" fill="${accent}"/>
      ${textPath({ text: truncate(bar.label, 46), x: x + 18, y: yBar + 28, fontSize: 20, fill: text, bold: true })}
      ${textPath({ text: truncate(bar.accent, 50), x: x + 18, y: yBar + 54, fontSize: 17, fill: muted })}
    `;
  });

  const overlay = Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    ${headerSvg}
    ${listSvg}
    ${benefitsSvg}
    ${barsSvg}
    ${footerSvg(theme, footerLeft, footerRight)}
  </svg>`);

  return base.composite([{ input: overlay, top: 0, left: 0 }]).png().toBuffer();
}

async function renderCoverSlide(
  slide: GeneratedSlide,
  theme: PresentationTheme,
  footerLeft: string,
  footerRight: string,
): Promise<Buffer> {
  const base = await compositeBackground(
    slide.backgroundImage?.url ?? slide.heroImage?.url,
    theme.colors.background,
  );

  const accent = solidColor(theme.colors.accent, "#00B7FF");
  const caption = slide.caption ?? slide.description ?? "";

  const overlay = Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    ${overlayGradientDefs()}
    <rect x="${M}" y="${CONTENT_H - 280}" width="80" height="3" fill="${accent}"/>
    ${textBlockSvg({
      title: slide.title,
      subtitle: slide.subtitle,
      description: caption,
      theme,
      yStart: CONTENT_H - 220,
    })}
    ${footerSvg(theme, footerLeft, footerRight)}
  </svg>`);

  return base.composite([{ input: overlay, top: 0, left: 0 }]).png().toBuffer();
}

async function renderClosingSlide(
  slide: GeneratedSlide,
  theme: PresentationTheme,
  footerLeft: string,
  footerRight: string,
): Promise<Buffer> {
  const base = await compositeBackground(slide.backgroundImage?.url, theme.colors.background);

  const accent = solidColor(theme.colors.accent, "#00B7FF");
  const text = solidColor(theme.colors.text, "#FFFFFF");

  let bulletsSvg = "";
  (slide.bullets ?? []).slice(0, 4).forEach((b, i) => {
    const y = 520 + i * 44;
    bulletsSvg += `<circle cx="${M + 8}" cy="${y - 8}" r="7" fill="${accent}"/>`;
    bulletsSvg += textPath({ text: truncate(b, 80), x: M + 28, y, fontSize: 22, fill: text });
  });

  const overlay = Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    ${overlayGradientDefs()}
    <rect x="${M}" y="280" width="80" height="3" fill="${accent}"/>
    ${textBlockSvg({
      title: slide.title,
      subtitle: slide.subtitle,
      description: slide.description,
      theme,
      yStart: 320,
    })}
    ${bulletsSvg}
    ${slide.caption ? textPath({ text: truncate(slide.caption, 100), x: M, y: CONTENT_H - 160, fontSize: 24, fill: text, bold: true }) : ""}
    ${footerSvg(theme, footerLeft, footerRight)}
  </svg>`);

  return base.composite([{ input: overlay, top: 0, left: 0 }]).png().toBuffer();
}

export async function compositeSlideToPng(input: {
  slide: GeneratedSlide;
  theme: PresentationTheme;
  footerLeft?: string;
  footerRight?: string;
  logoUrl?: string;
}): Promise<Buffer> {
  await initPresentationFonts();

  const footerLeft = input.footerLeft ?? "mercai.ru";
  const footerRight = input.footerRight ?? input.theme.name;

  const slide: GeneratedSlide = {
    ...input.slide,
    layout: "product_left_image_right_text",
    heroImage: input.slide.heroImage ?? input.slide.backgroundImage,
    backgroundImage: undefined,
  };

  return renderProductSlide(slide, input.theme, footerLeft, footerRight);
}

export async function generatePremiumPptxBuffer(input: {
  title: string;
  slides: GeneratedSlide[];
  theme: PresentationTheme;
  logoUrl?: string;
  brandName?: string;
  brandWebsite?: string;
}): Promise<Buffer> {
  return generateNativeAiPptxBuffer(input);
}

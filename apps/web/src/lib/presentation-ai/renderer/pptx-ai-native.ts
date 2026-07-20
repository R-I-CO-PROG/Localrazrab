import PptxGenJS from "pptxgenjs";
import sharp from "sharp";
import { resolveImageForPptx } from "@/lib/presentation/presentation-images";
import { SLIDE_H, SLIDE_W } from "@/lib/presentation/pptx-theme";
import type { GeneratedSlide, PresentationTheme } from "../types";

type Slide = PptxGenJS.Slide;
type PptxDeck = PptxGenJS;

const FOOTER_H = 0.22;
const CONTENT_H = SLIDE_H - FOOTER_H;
const TEXT_X = 0.35;
const TEXT_W = 4.55;
const HERO_X = 5.05;
const HERO_W = SLIDE_W - HERO_X - 0.2;
const BAR_H = 0.48;
const BAR_GAP = 0.12;

interface AiTheme {
  bg: string;
  primary: string;
  accent: string;
  text: string;
  muted: string;
  card: string;
  fontFace: string;
}

function truncate(text: string | undefined, max: number): string {
  const t = (text ?? "").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

/** Rough estimate of wrapped line count for a text box — used to size boxes so
 * following elements never overlap, instead of assuming everything fits on one line. */
function estimateLines(text: string, fontSize: number, boxWidthIn: number, bold = false): number {
  if (!text) return 0;
  const avgCharWidthIn = (bold ? 0.76 : 0.68) * (fontSize / 72);
  const charsPerLine = Math.max(1, Math.floor(boxWidthIn / avgCharWidthIn));
  return Math.max(1, Math.ceil(text.length / charsPerLine));
}

function lineHeightIn(fontSize: number): number {
  return (fontSize * 1.38) / 72;
}

function hexColor(color: string, fallback: string): string {
  if (color.startsWith("#")) return color.replace("#", "").toUpperCase();
  return fallback.replace("#", "").toUpperCase();
}

function fontFamily(raw: string): string {
  const first = raw.split(",")[0]?.trim().replace(/['"]/g, "");
  return first || "Arial";
}

function toAiTheme(theme: PresentationTheme): AiTheme {
  return {
    bg: hexColor(theme.colors.background, "#FFFFFF"),
    primary: hexColor(theme.colors.primary, "#1E3A5F"),
    accent: hexColor(theme.colors.accent, "#2563EB"),
    text: hexColor(theme.colors.text, "#0F172A"),
    muted: hexColor(theme.colors.mutedText, "#64748B"),
    card: "F8FAFC",
    fontFace: fontFamily(theme.typography.bodyFont),
  };
}

async function imageData(url?: string): Promise<string | undefined> {
  if (!url?.trim()) return undefined;
  const data = await resolveImageForPptx(url);
  return data?.startsWith("data:") ? data : undefined;
}

async function containBox(
  data: string,
  box: { x: number; y: number; w: number; h: number },
): Promise<{ x: number; y: number; w: number; h: number }> {
  try {
    const base64 = data.split(",")[1] ?? "";
    const buffer = Buffer.from(base64, "base64");
    const meta = await sharp(buffer).metadata();
    const imgW = meta.width ?? 0;
    const imgH = meta.height ?? 0;
    if (!imgW || !imgH) return box;
    const boxAspect = box.w / box.h;
    const imgAspect = imgW / imgH;
    let w = box.w;
    let h = box.h;
    if (imgAspect > boxAspect) {
      w = box.w;
      h = box.w / imgAspect;
    } else {
      h = box.h;
      w = box.h * imgAspect;
    }
    return {
      x: box.x + (box.w - w) / 2,
      y: box.y + (box.h - h) / 2,
      w,
      h,
    };
  } catch {
    return box;
  }
}

async function addImageSafe(
  slide: Slide,
  opts: { data?: string; x: number; y: number; w: number; h: number; sizing?: "cover" | "contain" },
): Promise<boolean> {
  if (!opts.data?.startsWith("data:")) return false;
  try {
    if (opts.sizing === "cover") {
      slide.addImage({
        data: opts.data,
        x: opts.x,
        y: opts.y,
        w: opts.w,
        h: opts.h,
        sizing: { type: "cover", w: opts.w, h: opts.h },
      });
      return true;
    }
    // "contain" (default): compute the real aspect-correct fit box ourselves —
    // pptxgenjs's own contain sizing does not reliably preserve aspect ratio and
    // was stretching images to fill the full placeholder.
    const fit = await containBox(opts.data, { x: opts.x, y: opts.y, w: opts.w, h: opts.h });
    slide.addImage({
      data: opts.data,
      x: fit.x,
      y: fit.y,
      w: fit.w,
      h: fit.h,
    });
    return true;
  } catch {
    return false;
  }
}

function drawFooter(
  slide: Slide,
  pptx: PptxDeck,
  theme: AiTheme,
  left: string,
  right: string,
) {
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: CONTENT_H,
    w: SLIDE_W,
    h: FOOTER_H,
    fill: { color: theme.primary },
    line: { width: 0 },
  });
  slide.addText(left, {
    x: 0.28,
    y: CONTENT_H + 0.03,
    w: 4.5,
    h: 0.16,
    fontSize: 8,
    color: "FFFFFF",
    fontFace: theme.fontFace,
    valign: "middle",
  });
  slide.addText(right, {
    x: SLIDE_W - 4.0,
    y: CONTENT_H + 0.03,
    w: 3.7,
    h: 0.16,
    fontSize: 8,
    color: "FFFFFF",
    fontFace: theme.fontFace,
    align: "right",
    valign: "middle",
  });
}

function addSpeakerNotes(slide: Slide, notes?: string) {
  if (notes?.trim()) slide.addNotes(notes.trim());
}

function measureBottomHighlightsHeight(bars: Array<{ label: string; accent: string }>): number {
  const items = bars.slice(0, 2).map((b) => ({
    label: truncate(b.label, 46),
    accent: truncate(b.accent, 50),
  }));
  if (!items.length) return 0;
  const cardW = (TEXT_W - BAR_GAP * (items.length - 1)) / items.length;
  const innerW = cardW - 0.2;
  const labelHeights = items.map((it) => estimateLines(it.label, 9, innerW, true) * lineHeightIn(9) + 0.04);
  const accentHeights = items.map((it) => estimateLines(it.accent, 8, innerW, false) * lineHeightIn(8) + 0.04);
  return Math.max(BAR_H, ...items.map((_, i) => 0.06 + labelHeights[i] + 0.02 + accentHeights[i] + 0.06));
}

function drawBottomHighlights(
  slide: Slide,
  pptx: PptxDeck,
  theme: AiTheme,
  bars: Array<{ label: string; accent: string }>,
  y: number,
  barH: number,
): void {
  const items = bars.slice(0, 2).map((b) => ({
    label: truncate(b.label, 46),
    accent: truncate(b.accent, 50),
  }));
  if (!items.length) return;
  const cardW = (TEXT_W - BAR_GAP * (items.length - 1)) / items.length;
  const innerW = cardW - 0.2;

  const labelHeights = items.map((it) => estimateLines(it.label, 9, innerW, true) * lineHeightIn(9) + 0.04);
  const accentHeights = items.map((it) => estimateLines(it.accent, 8, innerW, false) * lineHeightIn(8) + 0.04);

  items.forEach((bar, i) => {
    const x = TEXT_X + i * (cardW + BAR_GAP);
    slide.addShape(pptx.ShapeType.rect, {
      x,
      y,
      w: cardW,
      h: barH,
      fill: { color: theme.card },
      line: { color: theme.accent, width: 0.5 },
    });
    slide.addShape(pptx.ShapeType.rect, {
      x,
      y,
      w: 0.05,
      h: barH,
      fill: { color: theme.accent },
      line: { width: 0 },
    });
    slide.addText(bar.label, {
      x: x + 0.14,
      y: y + 0.06,
      w: innerW,
      h: labelHeights[i],
      fontSize: 9,
      bold: true,
      color: theme.text,
      fontFace: theme.fontFace,
      valign: "top",
      wrap: true,
    });
    slide.addText(bar.accent, {
      x: x + 0.14,
      y: y + 0.06 + labelHeights[i] + 0.02,
      w: innerW,
      h: accentHeights[i],
      fontSize: 8,
      color: theme.muted,
      fontFace: theme.fontFace,
      valign: "top",
      wrap: true,
    });
  });
}

function drawBenefits(
  slide: Slide,
  pptx: PptxDeck,
  theme: AiTheme,
  benefits: NonNullable<GeneratedSlide["benefits"]>,
  startY: number,
  maxY: number,
): number {
  const cols = 2;
  const cellW = (TEXT_W - 0.12) / cols;
  const innerW = cellW - 0.16;
  const items = benefits.slice(0, 4).map((b) => ({
    title: truncate(b.title, 30),
    text: truncate(b.text, 80),
  }));

  // Title area starts at cy+0.08; text area starts right after the title's own wrapped height.
  const cellHeights = items.map((it) => {
    const titleH = estimateLines(it.title, 9, innerW, true) * lineHeightIn(9);
    const textH = estimateLines(it.text, 8, innerW, false) * lineHeightIn(8);
    return 0.08 + titleH + 0.08 + textH + 0.1;
  });
  const cellH = Math.max(0.62, ...cellHeights);
  let y = startY;

  items.forEach((benefit, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = TEXT_X + col * (cellW + 0.12);
    const cy = y + row * (cellH + 0.1);
    if (cy + cellH > maxY) return;

    const titleH = Math.max(0.2, estimateLines(benefit.title, 9, innerW, true) * lineHeightIn(9) + 0.04);

    slide.addShape(pptx.ShapeType.rect, {
      x,
      y: cy,
      w: cellW,
      h: cellH,
      fill: { color: theme.card },
      line: { color: theme.accent, width: 0.5 },
    });
    slide.addText(benefit.title, {
      x: x + 0.1,
      y: cy + 0.08,
      w: innerW,
      h: titleH,
      fontSize: 9,
      bold: true,
      color: theme.text,
      fontFace: theme.fontFace,
      wrap: true,
      valign: "top",
    });
    slide.addText(benefit.text, {
      x: x + 0.1,
      y: cy + 0.08 + titleH + 0.04,
      w: innerW,
      h: cellH - (0.08 + titleH + 0.04 + 0.06),
      fontSize: 8,
      color: theme.muted,
      fontFace: theme.fontFace,
      wrap: true,
      valign: "top",
    });
  });

  const rows = Math.ceil(Math.min(benefits.length, 4) / cols);
  return y + rows * (cellH + 0.1);
}

async function renderSplitSlide(
  slide: Slide,
  pptx: PptxDeck,
  theme: AiTheme,
  data: GeneratedSlide,
  footerLeft: string,
  footerRight: string,
) {
  slide.background = { color: theme.bg };

  const heroUrl = data.heroImage?.url ?? data.backgroundImage?.url;
  const heroData = await imageData(heroUrl);
  if (heroData) {
    await addImageSafe(slide, {
      data: heroData,
      x: HERO_X,
      y: 0,
      w: HERO_W,
      h: CONTENT_H,
      sizing: "contain",
    });
  } else {
    slide.addShape(pptx.ShapeType.rect, {
      x: HERO_X,
      y: 0,
      w: HERO_W,
      h: CONTENT_H,
      fill: { color: theme.card },
      line: { width: 0 },
    });
  }

  const bars = data.bottomHighlights ?? [];
  const barsHeight = measureBottomHighlightsHeight(bars);
  const barZoneY = CONTENT_H - barsHeight - 0.14;
  const maxContentY = bars.length ? barZoneY - 0.1 : CONTENT_H - 0.2;

  let y = 0.32;

  const titleText = truncate(data.title, 70);
  const titleH = Math.max(0.3, estimateLines(titleText, 20, TEXT_W, true) * lineHeightIn(20) + 0.08);
  slide.addText(titleText, {
    x: TEXT_X,
    y,
    w: TEXT_W,
    h: titleH,
    fontSize: 20,
    bold: true,
    color: theme.text,
    fontFace: theme.fontFace,
    valign: "top",
    wrap: true,
  });
  y += titleH + 0.06;

  if (data.subtitle) {
    const subtitleText = truncate(data.subtitle, 70);
    const subtitleH = Math.max(0.24, estimateLines(subtitleText, 11, TEXT_W, true) * lineHeightIn(11) + 0.06);
    slide.addText(subtitleText, {
      x: TEXT_X,
      y,
      w: TEXT_W,
      h: subtitleH,
      fontSize: 11,
      color: theme.accent,
      fontFace: theme.fontFace,
      bold: true,
      valign: "top",
      wrap: true,
    });
    y += subtitleH + 0.05;
  }

  if (data.description) {
    const descriptionText = truncate(data.description, 140);
    const descriptionH = Math.max(0.3, estimateLines(descriptionText, 10, TEXT_W, false) * lineHeightIn(10) + 0.08);
    slide.addText(descriptionText, {
      x: TEXT_X,
      y,
      w: TEXT_W,
      h: descriptionH,
      fontSize: 10,
      color: theme.muted,
      fontFace: theme.fontFace,
      valign: "top",
      wrap: true,
    });
    y += descriptionH + 0.06;
  }

  if (data.showPrice && data.price != null) {
    slide.addText(`${String(data.price)} ₽`, {
      x: TEXT_X,
      y,
      w: TEXT_W,
      h: 0.22,
      fontSize: 11,
      bold: true,
      color: theme.muted,
      fontFace: theme.fontFace,
    });
    y += 0.26;
  }

  if (data.caption && !data.description) {
    slide.addText(truncate(data.caption, 100), {
      x: TEXT_X,
      y,
      w: TEXT_W,
      h: 0.4,
      fontSize: 10,
      color: theme.muted,
      fontFace: theme.fontFace,
      valign: "top",
      wrap: true,
      fit: "shrink",
    });
    y += 0.42;
  }

  const listItems = [
    ...(data.overviewItems ?? []).map((item) => truncate(item.name, 70)),
    ...(data.bullets ?? []).map((b) => truncate(b, 70)),
  ].filter(Boolean);

  if (listItems.length && y < maxContentY) {
    const rowH = 0.24;
    const maxRows = Math.max(1, Math.floor((maxContentY - y) / rowH));
    const visible = listItems.slice(0, maxRows);
    slide.addText(
      visible.map((text) => ({
        text,
        options: { bullet: true, breakLine: true },
      })),
      {
        x: TEXT_X,
        y,
        w: TEXT_W,
        h: Math.min(maxContentY - y, visible.length * rowH + 0.05),
        fontSize: 9,
        color: theme.text,
        fontFace: theme.fontFace,
        valign: "top",
        wrap: true,
      },
    );
    y += visible.length * rowH + 0.08;
  }

  if (data.benefits?.length && y + 0.7 < maxContentY) {
    y = drawBenefits(slide, pptx, theme, data.benefits, y, maxContentY);
  }

  if (bars.length) {
    drawBottomHighlights(slide, pptx, theme, bars, barZoneY, barsHeight);
  }

  drawFooter(slide, pptx, theme, footerLeft, footerRight);
  addSpeakerNotes(slide, data.speakerNotes);
}

async function renderCoverSlide(
  slide: Slide,
  pptx: PptxDeck,
  theme: AiTheme,
  data: GeneratedSlide,
  footerLeft: string,
  footerRight: string,
) {
  const bgData = await imageData(data.backgroundImage?.url ?? data.heroImage?.url);
  if (bgData) {
    await addImageSafe(slide, { data: bgData, x: 0, y: 0, w: SLIDE_W, h: CONTENT_H, sizing: "cover" });
    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: SLIDE_W,
      h: CONTENT_H,
      fill: { color: "000000", transparency: 35 },
      line: { width: 0 },
    });
  } else {
    slide.background = { color: theme.bg };
  }

  slide.addShape(pptx.ShapeType.rect, {
    x: TEXT_X,
    y: CONTENT_H - 2.1,
    w: 1.0,
    h: 0.04,
    fill: { color: theme.accent },
    line: { width: 0 },
  });

  const coverTitle = truncate(data.title, 70);
  const coverTitleH = Math.max(0.4, estimateLines(coverTitle, 28, 8.5, true) * lineHeightIn(28) + 0.08);
  slide.addText(coverTitle, {
    x: TEXT_X,
    y: CONTENT_H - 1.85,
    w: 8.5,
    h: coverTitleH,
    fontSize: 28,
    bold: true,
    color: bgData ? "FFFFFF" : theme.text,
    fontFace: theme.fontFace,
    wrap: true,
    valign: "top",
  });
  let coverY = CONTENT_H - 1.85 + coverTitleH + 0.08;

  if (data.subtitle) {
    const coverSubtitle = truncate(data.subtitle, 70);
    const coverSubtitleH = Math.max(0.24, estimateLines(coverSubtitle, 14, 8.0, true) * lineHeightIn(14) + 0.06);
    slide.addText(coverSubtitle, {
      x: TEXT_X,
      y: coverY,
      w: 8.0,
      h: coverSubtitleH,
      fontSize: 14,
      color: theme.accent,
      fontFace: theme.fontFace,
      bold: true,
      wrap: true,
      valign: "top",
    });
    coverY += coverSubtitleH + 0.06;
  }

  const caption = data.caption ?? data.description;
  if (caption) {
    const coverCaption = truncate(caption, 120);
    const coverCaptionH = Math.max(0.3, estimateLines(coverCaption, 11, 7.8, false) * lineHeightIn(11) + 0.06);
    slide.addText(coverCaption, {
      x: TEXT_X,
      y: coverY,
      w: 7.8,
      h: coverCaptionH,
      fontSize: 11,
      color: bgData ? "E2E8F0" : theme.muted,
      fontFace: theme.fontFace,
      wrap: true,
      valign: "top",
    });
  }

  drawFooter(slide, pptx, theme, footerLeft, footerRight);
  addSpeakerNotes(slide, data.speakerNotes);
}

async function renderClosingSlide(
  slide: Slide,
  pptx: PptxDeck,
  theme: AiTheme,
  data: GeneratedSlide,
  footerLeft: string,
  footerRight: string,
) {
  slide.background = { color: theme.bg };

  const bgData = await imageData(data.backgroundImage?.url);
  if (bgData) {
    await addImageSafe(slide, { data: bgData, x: 0, y: 0, w: SLIDE_W, h: CONTENT_H, sizing: "cover" });
    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: SLIDE_W,
      h: CONTENT_H,
      fill: { color: "000000", transparency: 40 },
      line: { width: 0 },
    });
  }

  const textColor = bgData ? "FFFFFF" : theme.text;
  const mutedColor = bgData ? "CBD5E1" : theme.muted;

  const closeTextX = TEXT_X + 0.2;
  const closeW = 7.8;
  let closeY = 1.35;

  const closeTitle = truncate(data.title, 70);
  const closeTitleH = Math.max(0.4, estimateLines(closeTitle, 26, closeW, true) * lineHeightIn(26) + 0.08);
  slide.addText(closeTitle, {
    x: closeTextX,
    y: closeY,
    w: closeW,
    h: closeTitleH,
    fontSize: 26,
    bold: true,
    color: textColor,
    fontFace: theme.fontFace,
    wrap: true,
    valign: "top",
  });
  closeY += closeTitleH + 0.1;

  slide.addShape(pptx.ShapeType.rect, {
    x: TEXT_X,
    y: 1.2,
    w: 0.06,
    h: Math.max(2.2, closeY - 1.2),
    fill: { color: theme.accent },
    line: { width: 0 },
  });

  if (data.subtitle) {
    const closeSubtitle = truncate(data.subtitle, 70);
    const closeSubtitleH = Math.max(0.24, estimateLines(closeSubtitle, 13, closeW, true) * lineHeightIn(13) + 0.06);
    slide.addText(closeSubtitle, {
      x: closeTextX,
      y: closeY,
      w: closeW,
      h: closeSubtitleH,
      fontSize: 13,
      color: theme.accent,
      fontFace: theme.fontFace,
      wrap: true,
      valign: "top",
    });
    closeY += closeSubtitleH + 0.1;
  }

  if (data.description) {
    const closeDescription = truncate(data.description, 140);
    const closeDescriptionH = Math.max(0.3, estimateLines(closeDescription, 11, closeW, false) * lineHeightIn(11) + 0.08);
    slide.addText(closeDescription, {
      x: closeTextX,
      y: closeY,
      w: closeW,
      h: closeDescriptionH,
      fontSize: 11,
      color: mutedColor,
      fontFace: theme.fontFace,
      wrap: true,
      valign: "top",
    });
    closeY += closeDescriptionH + 0.15;
  }

  if (data.bullets?.length) {
    const bullets = data.bullets.slice(0, 4).map((b) => truncate(b, 80));
    const bulletsH = bullets.reduce(
      (sum, b) => sum + estimateLines(b, 10, closeW - 0.2, false) * lineHeightIn(10) + 0.06,
      0,
    );
    slide.addText(
      bullets.map((text) => ({
        text,
        options: { bullet: true, breakLine: true },
      })),
      {
        x: closeTextX,
        y: closeY,
        w: closeW,
        h: Math.max(0.3, bulletsH),
        fontSize: 10,
        color: textColor,
        fontFace: theme.fontFace,
        valign: "top",
        wrap: true,
      },
    );
    closeY += Math.max(0.3, bulletsH) + 0.15;
  }

  if (data.caption) {
    const closeCaption = truncate(data.caption, 100);
    const closeCaptionH = Math.max(0.3, estimateLines(closeCaption, 12, closeW, true) * lineHeightIn(12) + 0.08);
    const captionY = Math.max(closeY, CONTENT_H - 0.75);
    slide.addText(closeCaption, {
      x: closeTextX,
      y: captionY,
      w: closeW,
      h: closeCaptionH,
      fontSize: 12,
      bold: true,
      color: textColor,
      fontFace: theme.fontFace,
      wrap: true,
      valign: "top",
    });
  }

  drawFooter(slide, pptx, theme, footerLeft, footerRight);
  addSpeakerNotes(slide, data.speakerNotes);
}

export async function generateNativeAiPptxBuffer(input: {
  title: string;
  slides: GeneratedSlide[];
  theme: PresentationTheme;
  logoUrl?: string;
  brandName?: string;
  brandWebsite?: string;
}): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.author = "Mercai";
  pptx.title = input.title;
  pptx.layout = "LAYOUT_16x9";

  const theme = toAiTheme(input.theme);
  const footerLeft = input.brandWebsite ?? "mercai.ru";
  const footerRight = input.brandName ?? "Brand";

  for (const slideData of input.slides) {
    const s = pptx.addSlide();

    switch (slideData.type) {
      case "cover":
        await renderCoverSlide(s, pptx, theme, slideData, footerLeft, footerRight);
        break;
      case "thank_you":
        await renderClosingSlide(s, pptx, theme, slideData, footerLeft, footerRight);
        break;
      default:
        await renderSplitSlide(s, pptx, theme, slideData, footerLeft, footerRight);
        break;
    }
  }

  const result = await pptx.write({ outputType: "nodebuffer" });
  return Buffer.from(result as ArrayBuffer);
}

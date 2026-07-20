import type PptxGenJS from "pptxgenjs";
import type { PresentationSlide } from "@/lib/brand-palette";
import { SLIDE_H, SLIDE_W, type PptxTheme } from "./pptx-theme";
import type { DeckArtDirection } from "./presentation-art-direction";
import { getIconDataUrl } from "./presentation-icons";

type Slide = PptxGenJS.Slide;
type PptxDeck = PptxGenJS;

export interface AgencyRenderContext {
  theme: PptxTheme;
  art: DeckArtDirection;
  logoDataUrl?: string;
  iconDataByKey: Map<string, string>;
}

function addImageSafe(
  slide: Slide,
  opts: { data?: string; x: number; y: number; w: number; h: number; sizing?: "cover" | "contain" },
): boolean {
  if (!opts.data?.startsWith("data:")) return false;
  try {
    slide.addImage({
      data: opts.data,
      x: opts.x,
      y: opts.y,
      w: opts.w,
      h: opts.h,
      sizing: { type: opts.sizing ?? "cover", w: opts.w, h: opts.h },
    });
    return true;
  } catch {
    return false;
  }
}

function drawAgencyFooter(
  slide: Slide,
  pptx: PptxDeck,
  theme: PptxTheme,
  left?: string,
  right?: string,
) {
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: SLIDE_H - 0.22,
    w: SLIDE_W,
    h: 0.22,
    fill: { color: theme.primary },
    line: { width: 0 },
  });
  if (left) {
    slide.addText(left, {
      x: 0.35,
      y: SLIDE_H - 0.19,
      w: 4.5,
      h: 0.16,
      fontSize: 8,
      color: theme.textOnDark,
      fontFace: theme.fontFace,
      valign: "middle",
    });
  }
  if (right) {
    slide.addText(right, {
      x: SLIDE_W - 4.2,
      y: SLIDE_H - 0.19,
      w: 3.85,
      h: 0.16,
      fontSize: 8,
      color: theme.textOnDark,
      fontFace: theme.fontFace,
      align: "right",
      valign: "middle",
    });
  }
}

export function renderAgencyCover(
  slide: Slide,
  pptx: PptxDeck,
  ctx: AgencyRenderContext,
  data: PresentationSlide,
) {
  slide.background = { color: ctx.art.bgTop };

  if (data.imageUrl) {
    addImageSafe(slide, { data: data.imageUrl, x: 0, y: 0, w: SLIDE_W, h: SLIDE_H, sizing: "cover" });
    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: SLIDE_W,
      h: SLIDE_H,
      fill: { color: "000000", transparency: 42 },
      line: { width: 0 },
    });
  }

  const brandTitle = data.title?.trim();
  const useAiCover = Boolean(brandTitle && brandTitle.length >= 2);
  const line1 = useAiCover ? brandTitle!.toUpperCase() : ctx.art.coverTitleLine1;
  const line2 = useAiCover
    ? (data.subtitle?.trim().slice(0, 64).toUpperCase() ?? ctx.art.coverTitleLine2)
    : ctx.art.coverTitleLine2;
  const line2FontSize = line2.length > 28 ? 28 : 40;

  slide.addText(line1, {
    x: 0.55,
    y: 1.35,
    w: 8.5,
    h: 0.9,
    fontSize: 40,
    bold: true,
    color: themeText(ctx),
    fontFace: ctx.theme.fontFace,
    charSpacing: 2,
  });
  slide.addText(line2, {
    x: 0.55,
    y: 2.15,
    w: 8.5,
    h: 0.95,
    fontSize: line2FontSize,
    bold: true,
    color: ctx.theme.accent,
    fontFace: ctx.theme.fontFace,
    charSpacing: 2,
  });

  const caption = useAiCover ? data.body?.trim() : data.subtitle?.trim();
  if (caption) {
    slide.addText(caption, {
      x: 0.58,
      y: 3.2,
      w: 7.5,
      h: 0.55,
      fontSize: 14,
      color: ctx.theme.textMutedOnDark,
      fontFace: ctx.theme.fontFace,
    });
  }

  if (ctx.logoDataUrl) {
    addImageSafe(slide, {
      data: ctx.logoDataUrl,
      x: SLIDE_W - 1.65,
      y: 0.28,
      w: 1.25,
      h: 0.55,
      sizing: "contain",
    });
  }

  drawAgencyFooter(
    slide,
    pptx,
    ctx.theme,
    data.footerLeft ?? ctx.art.footerLeft,
    data.footerRight ?? ctx.art.footerRight,
  );
}

function themeText(ctx: AgencyRenderContext): string {
  return ctx.theme.textOnDark;
}

export function renderAgencyOverview(
  slide: Slide,
  pptx: PptxDeck,
  ctx: AgencyRenderContext,
  data: PresentationSlide,
) {
  slide.background = { color: ctx.art.bgTop };

  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: 4.55,
    h: SLIDE_H - 0.22,
    fill: { color: "0C1220" },
    line: { width: 0 },
  });

  if (data.imageUrl) {
    addImageSafe(slide, {
      data: data.imageUrl,
      x: 0.15,
      y: 0.2,
      w: 4.25,
      h: SLIDE_H - 0.55,
      sizing: "cover",
    });
  }

  slide.addShape(pptx.ShapeType.rect, {
    x: 4.55,
    y: 0,
    w: SLIDE_W - 4.55,
    h: SLIDE_H - 0.22,
    fill: { color: ctx.art.bgBottom },
    line: { width: 0 },
  });

  slide.addText(data.title ?? "ОБЗОР", {
    x: 4.85,
    y: 0.45,
    w: 4.8,
    h: 0.55,
    fontSize: 22,
    bold: true,
    color: ctx.theme.textOnDark,
    fontFace: ctx.theme.fontFace,
  });

  if (data.subtitle) {
    slide.addText(data.subtitle, {
      x: 4.85,
      y: 1.0,
      w: 4.7,
      h: 0.35,
      fontSize: 11,
      color: ctx.theme.accent,
      fontFace: ctx.theme.fontFace,
    });
  }

  const items = data.overviewItems ?? [];
  const startY = 1.55;
  const rowH = 0.72;

  items.slice(0, 6).forEach((item, i) => {
    const y = startY + i * rowH;
    const iconKey = item.icon ?? "gift";
    const iconData = ctx.iconDataByKey.get(iconKey);

    slide.addShape(pptx.ShapeType.ellipse, {
      x: 4.9,
      y: y + 0.06,
      w: 0.42,
      h: 0.42,
      fill: { color: "142238" },
      line: { color: ctx.theme.accent, width: 0.75 },
    });

    if (iconData) {
      addImageSafe(slide, { data: iconData, x: 4.91, y: y + 0.07, w: 0.4, h: 0.4, sizing: "contain" });
    }

    slide.addText(item.name, {
      x: 5.45,
      y: y + 0.02,
      w: 4.2,
      h: 0.5,
      fontSize: 13,
      bold: true,
      color: ctx.theme.textOnDark,
      fontFace: ctx.theme.fontFace,
      valign: "middle",
    });
  });

  if (data.body) {
    slide.addText(data.body, {
      x: 4.85,
      y: SLIDE_H - 1.35,
      w: 4.8,
      h: 0.85,
      fontSize: 9.5,
      color: ctx.theme.textMutedOnDark,
      fontFace: ctx.theme.fontFace,
    });
  }

  drawAgencyFooter(slide, pptx, ctx.theme, data.footerLeft, data.footerRight);
}

export function renderAgencyProduct(
  slide: Slide,
  pptx: PptxDeck,
  ctx: AgencyRenderContext,
  data: PresentationSlide,
) {
  slide.background = { color: ctx.art.bgTop };

  if (data.imageUrl) {
    addImageSafe(slide, {
      data: data.imageUrl,
      x: 0,
      y: 0,
      w: 4.75,
      h: SLIDE_H - 0.22,
      sizing: "cover",
    });
  } else {
    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: 4.75,
      h: SLIDE_H - 0.22,
      fill: { color: "0C1220" },
      line: { width: 0 },
    });
  }

  slide.addShape(pptx.ShapeType.rect, {
    x: 4.75,
    y: 0,
    w: SLIDE_W - 4.75,
    h: SLIDE_H - 0.22,
    fill: { color: ctx.art.bgBottom },
    line: { width: 0 },
  });

  const productTitle = data.title ?? data.productName ?? "ПРОДУКТ";
  slide.addText(productTitle.toUpperCase(), {
    x: 5.05,
    y: 0.42,
    w: 4.6,
    h: 0.65,
    fontSize: 24,
    bold: true,
    color: ctx.theme.textOnDark,
    fontFace: ctx.theme.fontFace,
  });

  if (data.subtitle) {
    slide.addText(data.subtitle, {
      x: 5.05,
      y: 1.05,
      w: 4.5,
      h: 0.3,
      fontSize: 11,
      color: ctx.theme.accent,
      fontFace: ctx.theme.fontFace,
    });
  }

  if (data.price != null) {
    slide.addText(`${Math.round(data.price).toLocaleString("ru-RU")} ₽`, {
      x: 5.05,
      y: 1.38,
      w: 2.5,
      h: 0.28,
      fontSize: 12,
      bold: true,
      color: ctx.theme.textMutedOnDark,
      fontFace: ctx.theme.fontFace,
    });
  }

  const benefits = data.benefits ?? [];
  const cols = 2;
  const cellW = 2.15;
  const cellH = 1.35;
  const gridX = 5.05;
  const gridY = 1.85;

  benefits.slice(0, 4).forEach((benefit, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = gridX + col * (cellW + 0.15);
    const y = gridY + row * (cellH + 0.12);
    const iconKey = benefit.icon ?? "star";
    const iconData = ctx.iconDataByKey.get(iconKey);

    if (iconData) {
      addImageSafe(slide, { data: iconData, x, y, w: 0.38, h: 0.38, sizing: "contain" });
    }

    slide.addText(benefit.title, {
      x: x + 0.45,
      y,
      w: cellW - 0.5,
      h: 0.32,
      fontSize: 11,
      bold: true,
      color: ctx.theme.textOnDark,
      fontFace: ctx.theme.fontFace,
    });

    slide.addText(benefit.text, {
      x,
      y: y + 0.38,
      w: cellW,
      h: 0.85,
      fontSize: 9,
      color: ctx.theme.textMutedOnDark,
      fontFace: ctx.theme.fontFace,
    });
  });

  drawAgencyFooter(
    slide,
    pptx,
    ctx.theme,
    data.footerLeft ?? ctx.art.footerLeft,
    data.footerRight ?? ctx.art.footerRight,
  );
}

export function renderAgencyClosing(
  slide: Slide,
  pptx: PptxDeck,
  ctx: AgencyRenderContext,
  data: PresentationSlide,
) {
  slide.background = { color: ctx.art.bgTop };

  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: SLIDE_W,
    h: SLIDE_H - 0.22,
    fill: { color: ctx.art.bgBottom, transparency: 15 },
    line: { width: 0 },
  });

  slide.addShape(pptx.ShapeType.rect, {
    x: 0.55,
    y: 1.1,
    w: 0.08,
    h: 2.8,
    fill: { color: ctx.theme.accent },
    line: { width: 0 },
  });

  slide.addText(data.title ?? "СПАСИБО ЗА ВНИМАНИЕ", {
    x: 0.85,
    y: 1.35,
    w: 8.5,
    h: 0.75,
    fontSize: 32,
    bold: true,
    color: ctx.theme.textOnDark,
    fontFace: ctx.theme.fontFace,
  });

  if (data.subtitle) {
    slide.addText(data.subtitle, {
      x: 0.85,
      y: 2.15,
      w: 7.8,
      h: 0.45,
      fontSize: 14,
      color: ctx.theme.accent,
      fontFace: ctx.theme.fontFace,
    });
  }

  if (data.body) {
    slide.addText(data.body, {
      x: 0.85,
      y: 2.75,
      w: 7.5,
      h: 0.55,
      fontSize: 11,
      color: ctx.theme.textMutedOnDark,
      fontFace: ctx.theme.fontFace,
    });
  }

  if (data.bullets?.length) {
    slide.addText(
      data.bullets.map((b) => ({ text: b, options: { bullet: true, breakLine: true } })),
      {
        x: 0.85,
        y: 3.45,
        w: 7.2,
        h: 1.2,
        fontSize: 10,
        color: ctx.theme.textOnDark,
        fontFace: ctx.theme.fontFace,
      },
    );
  }

  if (ctx.logoDataUrl) {
    addImageSafe(slide, {
      data: ctx.logoDataUrl,
      x: SLIDE_W - 2.0,
      y: 1.4,
      w: 1.4,
      h: 0.65,
      sizing: "contain",
    });
  }

  drawAgencyFooter(
    slide,
    pptx,
    ctx.theme,
    data.footerLeft ?? ctx.art.footerLeft,
    data.footerRight ?? data.title ?? ctx.art.footerRight,
  );
}

export async function buildAgencyIconCache(
  accentHex: string,
  slides: PresentationSlide[],
): Promise<Map<string, string>> {
  const keys = new Set<string>();
  for (const slide of slides) {
    slide.benefits?.forEach((b) => keys.add(b.icon ?? "star"));
    slide.overviewItems?.forEach((o) => keys.add(o.icon ?? "gift"));
  }
  keys.add("gift");
  keys.add("star");
  keys.add("shield");
  keys.add("team");

  const map = new Map<string, string>();
  await Promise.all(
    [...keys].map(async (key) => {
      map.set(key, await getIconDataUrl(key as Parameters<typeof getIconDataUrl>[0], accentHex));
    }),
  );
  return map;
}

import type PptxGenJS from "pptxgenjs";
import {
  CONTENT_W,
  CONTENT_X,
  SIDEBAR_W,
  SLIDE_H,
  SLIDE_W,
  type PptxTheme,
} from "./pptx-theme";

type Slide = PptxGenJS.Slide;
type PptxDeck = PptxGenJS;

export function setDarkBackground(slide: Slide, theme: PptxTheme) {
  slide.background = { color: theme.dark };
}

export function setLightBackground(slide: Slide, theme: PptxTheme) {
  slide.background = { color: theme.light };
}

function addImageSafe(
  slide: Slide,
  opts: {
    data?: string;
    x: number;
    y: number;
    w: number;
    h: number;
    sizing?: "cover" | "contain";
  },
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

/** Брендовая полоса слева — как в референсе Mercury */
export function drawBrandSidebar(slide: Slide, theme: PptxTheme, pptx: PptxDeck) {
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: SIDEBAR_W,
    h: SLIDE_H,
    fill: { color: "FFFFFF" },
    line: { color: "FFFFFF", width: 0 },
  });

  const dots = theme.accent;
  const alt = theme.primary;
  for (let i = 0; i < 14; i++) {
    const y = 0.22 + i * 0.38;
    slide.addShape(pptx.ShapeType.ellipse, {
      x: 0.09,
      y,
      w: 0.05,
      h: 0.05,
      fill: { color: i % 3 === 0 ? dots : i % 3 === 1 ? alt : "B0B8C4" },
      line: { width: 0 },
    });
  }

  const label = theme.projectTitle.slice(0, 12).toUpperCase();
  slide.addText(label.split("").join("\n"), {
    x: 0.14,
    y: 0.5,
    w: 0.12,
    h: SLIDE_H - 1,
    fontSize: 7,
    bold: true,
    color: theme.primary,
    fontFace: theme.fontFace,
    rotate: 270,
    valign: "top",
  });
}

function drawBottomBar(slide: Slide, theme: PptxTheme, pptx: PptxDeck) {
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: SLIDE_H - 0.18,
    w: SLIDE_W,
    h: 0.18,
    fill: { color: theme.primary },
    line: { width: 0 },
  });
}

function drawDarkOverlay(slide: Slide, pptx: PptxDeck, opacity = 35) {
  slide.addShape(pptx.ShapeType.rect, {
    x: CONTENT_X,
    y: 0,
    w: SLIDE_W - CONTENT_X,
    h: SLIDE_H,
    fill: { color: "000000", transparency: opacity },
    line: { width: 0 },
  });
}

export function renderTitleSlide(
  slide: Slide,
  pptx: PptxDeck,
  theme: PptxTheme,
  data: { title?: string; subtitle?: string; body?: string; logoDataUrl?: string },
) {
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: 3.55,
    h: SLIDE_H,
    fill: { color: theme.light },
    line: { width: 0 },
  });
  slide.addShape(pptx.ShapeType.rect, {
    x: 3.55,
    y: 0,
    w: SLIDE_W - 3.55,
    h: SLIDE_H,
    fill: { color: theme.dark },
    line: { width: 0 },
  });
  slide.addShape(pptx.ShapeType.line, {
    x: 3.35,
    y: 0,
    w: 0.4,
    h: SLIDE_H,
    line: { color: theme.accent, width: 2 },
  });

  if (data.logoDataUrl?.startsWith("data:")) {
    addImageSafe(slide, {
      data: data.logoDataUrl,
      x: 5.2,
      y: 0.55,
      w: 1.6,
      h: 0.85,
      sizing: "contain",
    });
  }

  slide.addShape(pptx.ShapeType.line, {
    x: 4.2,
    y: 2.05,
    w: 5.2,
    h: 0,
    line: { color: theme.textOnDark, width: 0.75 },
  });

  slide.addText(data.title ?? theme.projectTitle, {
    x: 4.0,
    y: 2.25,
    w: 5.6,
    h: 0.85,
    fontSize: 24,
    bold: true,
    color: theme.textOnDark,
    fontFace: theme.fontFace,
    align: "center",
  });

  if (data.subtitle) {
    slide.addText(data.subtitle, {
      x: 4.0,
      y: 3.15,
      w: 5.6,
      h: 0.55,
      fontSize: 14,
      color: theme.textMutedOnDark,
      fontFace: theme.fontFace,
      align: "center",
    });
  }

  if (data.body) {
    slide.addText(data.body, {
      x: 4.0,
      y: 3.85,
      w: 5.6,
      h: 1.2,
      fontSize: 11,
      color: theme.textMutedOnDark,
      fontFace: theme.fontFace,
      align: "center",
      valign: "top",
    });
  }
}

export function renderInsightSlide(
  slide: Slide,
  pptx: PptxDeck,
  theme: PptxTheme,
  data: { title?: string; subtitle?: string; body?: string; imageUrl?: string },
) {
  setDarkBackground(slide, theme);
  drawBrandSidebar(slide, theme, pptx);

  if (data.imageUrl) {
    addImageSafe(slide, {
      data: data.imageUrl,
      x: CONTENT_X,
      y: 0.55,
      w: CONTENT_W,
      h: 3.5,
      sizing: "contain",
    });
  }

  const titleY = data.imageUrl ? 0.45 : 1.4;
  slide.addText(data.title ?? "", {
    x: CONTENT_X,
    y: titleY,
    w: CONTENT_W,
    h: 0.75,
    fontSize: 22,
    bold: true,
    color: theme.textOnDark,
    fontFace: theme.fontFace,
    align: "center",
  });

  if (data.subtitle) {
    slide.addText(data.subtitle, {
      x: CONTENT_X + 0.3,
      y: titleY + 0.85,
      w: CONTENT_W - 0.6,
      h: 0.55,
      fontSize: 13,
      color: theme.textMutedOnDark,
      fontFace: theme.fontFace,
      align: "center",
    });
  }

  if (data.body) {
    slide.addText(data.body, {
      x: CONTENT_X + 0.4,
      y: SLIDE_H - 1.35,
      w: CONTENT_W - 0.8,
      h: 0.9,
      fontSize: 11,
      color: theme.textMutedOnDark,
      fontFace: theme.fontFace,
      align: "center",
      valign: "top",
    });
  }

  drawBottomBar(slide, theme, pptx);
}

export function renderConceptsIntroSlide(
  slide: Slide,
  pptx: PptxDeck,
  theme: PptxTheme,
  data: { title?: string; subtitle?: string; body?: string; bullets?: string[]; imageUrl?: string },
) {
  setDarkBackground(slide, theme);
  drawBrandSidebar(slide, theme, pptx);

  if (data.imageUrl) {
    addImageSafe(slide, {
      data: data.imageUrl,
      x: CONTENT_X,
      y: 0,
      w: CONTENT_W,
      h: SLIDE_H,
      sizing: "cover",
    });
    drawDarkOverlay(slide, pptx, 50);
  }

  slide.addText(data.title ?? "", {
    x: CONTENT_X,
    y: 0.55,
    w: CONTENT_W,
    h: 0.7,
    fontSize: 26,
    bold: true,
    color: theme.textOnDark,
    fontFace: theme.fontFace,
    align: "center",
  });

  const items = data.bullets?.length
    ? data.bullets
    : [data.subtitle, data.body].filter(Boolean) as string[];
  items.slice(0, 3).forEach((text, i) => {
    const positions = [
      { x: CONTENT_X + 0.2, y: 2.0 },
      { x: CONTENT_X + CONTENT_W * 0.55, y: 2.8 },
      { x: CONTENT_X + 0.35, y: 4.0 },
    ];
    const pos = positions[i];
    if (!pos) return;
    slide.addText(text, {
      x: pos.x,
      y: pos.y,
      w: 3.2,
      h: 0.5,
      fontSize: 14,
      color: theme.textOnDark,
      fontFace: theme.fontFace,
    });
  });
}

export function renderSectionSlide(
  slide: Slide,
  pptx: PptxDeck,
  theme: PptxTheme,
  data: { title?: string; subtitle?: string },
) {
  setDarkBackground(slide, theme);
  drawBrandSidebar(slide, theme, pptx);

  slide.addText(data.title ?? "", {
    x: CONTENT_X,
    y: 2.0,
    w: CONTENT_W,
    h: 0.9,
    fontSize: 30,
    bold: true,
    color: theme.textOnDark,
    fontFace: theme.fontFace,
  });

  if (data.subtitle) {
    slide.addText(data.subtitle, {
      x: CONTENT_X,
      y: 2.95,
      w: CONTENT_W,
      h: 0.55,
      fontSize: 15,
      color: theme.textMutedOnDark,
      fontFace: theme.fontFace,
    });
  }

  slide.addShape(pptx.ShapeType.rect, {
    x: CONTENT_X,
    y: 2.75,
    w: 1.4,
    h: 0.06,
    fill: { color: theme.accent },
    line: { width: 0 },
  });
}

export function renderVisualizationHero(
  slide: Slide,
  pptx: PptxDeck,
  theme: PptxTheme,
  data: { title?: string; subtitle?: string; body?: string; imageUrl?: string },
) {
  setDarkBackground(slide, theme);
  drawBrandSidebar(slide, theme, pptx);

  if (data.imageUrl) {
    addImageSafe(slide, {
      data: data.imageUrl,
      x: CONTENT_X,
      y: 0,
      w: CONTENT_W,
      h: SLIDE_H,
      sizing: "cover",
    });
    drawDarkOverlay(slide, pptx, 30);
  }

  slide.addText(data.title ?? "", {
    x: CONTENT_X + 0.2,
    y: 0.45,
    w: CONTENT_W - 0.4,
    h: 0.65,
    fontSize: 24,
    bold: true,
    color: theme.textOnDark,
    fontFace: theme.fontFace,
  });

  if (data.subtitle) {
    slide.addText(data.subtitle, {
      x: CONTENT_X + 0.2,
      y: 1.1,
      w: CONTENT_W - 0.4,
      h: 0.45,
      fontSize: 13,
      color: theme.textMutedOnDark,
      fontFace: theme.fontFace,
    });
  }

  if (data.body) {
    slide.addText(data.body, {
      x: CONTENT_X + 0.2,
      y: SLIDE_H - 1.05,
      w: CONTENT_W - 0.4,
      h: 0.75,
      fontSize: 11,
      color: theme.textOnDark,
      fontFace: theme.fontFace,
      align: "center",
    });
  }
}

export function renderConceptShowcase(
  slide: Slide,
  pptx: PptxDeck,
  theme: PptxTheme,
  data: {
    title?: string;
    subtitle?: string;
    imageUrl?: string;
    galleryImages?: string[];
  },
) {
  setDarkBackground(slide, theme);
  drawBrandSidebar(slide, theme, pptx);

  const imgs = [data.imageUrl, ...(data.galleryImages ?? [])].filter(
    (u): u is string => Boolean(u?.startsWith("data:")),
  );
  const leftX = CONTENT_X;
  const gap = 0.06;
  const leftW = CONTENT_W * 0.42;
  const rightW = CONTENT_W - leftW - gap;
  const topH = (SLIDE_H - 0.55) / 2 - gap / 2;
  const headerY = 0.35;

  slide.addText(data.title ?? "", {
    x: leftX + leftW + gap,
    y: headerY,
    w: rightW,
    h: 0.45,
    fontSize: 18,
    bold: true,
    color: theme.textOnDark,
    fontFace: theme.fontFace,
  });
  if (data.subtitle) {
    slide.addText(data.subtitle, {
      x: leftX + leftW + gap,
      y: headerY + 0.48,
      w: rightW,
      h: 0.35,
      fontSize: 12,
      color: theme.textMutedOnDark,
      fontFace: theme.fontFace,
    });
  }

  const frameY = 1.05;
  const frameH = SLIDE_H - frameY - 0.15;

  if (imgs[0]) {
    addImageSafe(slide, { data: imgs[0], x: leftX, y: frameY, w: leftW, h: frameH, sizing: "cover" });
  }
  if (imgs[1]) {
    addImageSafe(slide, {
      data: imgs[1],
      x: leftX + leftW + gap,
      y: frameY,
      w: rightW,
      h: topH,
      sizing: "cover",
    });
  }
  if (imgs[2]) {
    addImageSafe(slide, {
      data: imgs[2],
      x: leftX + leftW + gap,
      y: frameY + topH + gap,
      w: rightW,
      h: topH,
      sizing: "cover",
    });
  }

  slide.addShape(pptx.ShapeType.line, {
    x: leftX + leftW,
    y: frameY,
    w: 0,
    h: frameH,
    line: { color: theme.line, width: 0.75 },
  });
  slide.addShape(pptx.ShapeType.line, {
    x: leftX + leftW + gap,
    y: frameY + topH,
    w: rightW,
    h: 0,
    line: { color: theme.line, width: 0.75 },
  });
}

export function renderConceptGrid(
  slide: Slide,
  pptx: PptxDeck,
  theme: PptxTheme,
  data: { title?: string; subtitle?: string; galleryImages?: string[]; imageUrl?: string },
) {
  setDarkBackground(slide, theme);
  drawBrandSidebar(slide, theme, pptx);

  const imgs = [...(data.galleryImages ?? []), data.imageUrl].filter(
    (u): u is string => Boolean(u?.startsWith("data:")),
  ).slice(0, 4);

  slide.addText(data.title ?? "", {
    x: CONTENT_X + CONTENT_W - 3.2,
    y: 0.35,
    w: 3.0,
    h: 0.45,
    fontSize: 16,
    bold: true,
    color: theme.textOnDark,
    fontFace: theme.fontFace,
    align: "right",
  });
  if (data.subtitle) {
    slide.addText(data.subtitle, {
      x: CONTENT_X + CONTENT_W - 3.2,
      y: 0.78,
      w: 3.0,
      h: 0.3,
      fontSize: 11,
      color: theme.textMutedOnDark,
      fontFace: theme.fontFace,
      align: "right",
    });
  }

  const gridX = CONTENT_X;
  const gridY = 1.0;
  const cellW = (CONTENT_W - 0.06) / 2;
  const cellH = (SLIDE_H - gridY - 0.2) / 2;

  imgs.forEach((img, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    addImageSafe(slide, {
      data: img,
      x: gridX + col * (cellW + 0.06),
      y: gridY + row * (cellH + 0.06),
      w: cellW,
      h: cellH,
      sizing: "cover",
    });
  });

  slide.addShape(pptx.ShapeType.line, {
    x: gridX + cellW + 0.03,
    y: gridY,
    w: 0,
    h: cellH * 2 + 0.06,
    line: { color: theme.line, width: 0.75 },
  });
  slide.addShape(pptx.ShapeType.line, {
    x: gridX,
    y: gridY + cellH + 0.03,
    w: cellW * 2 + 0.06,
    h: 0,
    line: { color: theme.line, width: 0.75 },
  });
}

export function renderHowItWorks(
  slide: Slide,
  pptx: PptxDeck,
  theme: PptxTheme,
  data: { title?: string; body?: string; subtitle?: string; imageUrl?: string },
) {
  setDarkBackground(slide, theme);
  drawBrandSidebar(slide, theme, pptx);

  const imgW = CONTENT_W * 0.52;
  if (data.imageUrl) {
    addImageSafe(slide, {
      data: data.imageUrl,
      x: CONTENT_X,
      y: 0.35,
      w: imgW,
      h: SLIDE_H - 0.7,
      sizing: "cover",
    });
  }

  slide.addText(data.title ?? "Как это работает", {
    x: CONTENT_X + imgW + 0.25,
    y: 0.55,
    w: CONTENT_W - imgW - 0.35,
    h: 0.5,
    fontSize: 20,
    bold: true,
    color: theme.textOnDark,
    fontFace: theme.fontFace,
  });

  if (data.body) {
    slide.addText(data.body, {
      x: CONTENT_X + imgW + 0.25,
      y: 1.15,
      w: CONTENT_W - imgW - 0.35,
      h: 2.2,
      fontSize: 11,
      color: theme.textMutedOnDark,
      fontFace: theme.fontFace,
      valign: "top",
    });
  }

  if (data.subtitle) {
    slide.addText(data.subtitle, {
      x: CONTENT_X + 0.15,
      y: SLIDE_H - 0.85,
      w: CONTENT_W - 0.3,
      h: 0.55,
      fontSize: 12,
      italic: true,
      color: theme.textOnDark,
      fontFace: theme.fontFace,
      align: "center",
    });
  }
}

export function renderQuoteSlide(
  slide: Slide,
  pptx: PptxDeck,
  theme: PptxTheme,
  data: { title?: string; subtitle?: string; imageUrl?: string },
) {
  setDarkBackground(slide, theme);
  drawBrandSidebar(slide, theme, pptx);

  if (data.imageUrl) {
    addImageSafe(slide, {
      data: data.imageUrl,
      x: CONTENT_X + CONTENT_W * 0.2,
      y: 1.2,
      w: CONTENT_W * 0.6,
      h: 2.8,
      sizing: "contain",
    });
  }

  const lines = [data.title, data.subtitle].filter(Boolean);
  slide.addText(lines.join("\n"), {
    x: CONTENT_X + 0.3,
    y: 0.55,
    w: CONTENT_W - 0.6,
    h: 0.9,
    fontSize: 20,
    bold: true,
    color: theme.textOnDark,
    fontFace: theme.fontFace,
    align: "center",
  });
}

export function renderProductsSlide(
  slide: Slide,
  pptx: PptxDeck,
  theme: PptxTheme,
  data: {
    title?: string;
    products?: Array<{
      name: string;
      description?: string;
      price?: number;
      imageUrl?: string;
    }>;
  },
) {
  setDarkBackground(slide, theme);
  drawBrandSidebar(slide, theme, pptx);

  slide.addText(data.title ?? "Состав набора", {
    x: CONTENT_X,
    y: 0.35,
    w: CONTENT_W,
    h: 0.45,
    fontSize: 18,
    bold: true,
    color: theme.textOnDark,
    fontFace: theme.fontFace,
  });

  const products = data.products ?? [];
  const count = Math.min(products.length, 4);
  const cols = count <= 2 ? count : 2;
  const cardW = (CONTENT_W - 0.15 * (cols - 1)) / cols;

  products.slice(0, 4).forEach((product, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = CONTENT_X + col * (cardW + 0.15);
    const y = 1.0 + row * 2.15;

    if (product.imageUrl?.startsWith("data:")) {
      addImageSafe(slide, {
        data: product.imageUrl,
        x,
        y,
        w: cardW,
        h: 1.35,
        sizing: "contain",
      });
    }

    const price = product.price != null ? `${Math.round(product.price)} ₽` : "";
    slide.addText(
      [
        { text: product.name, options: { bold: true, fontSize: 11, color: theme.textOnDark } },
        {
          text: product.description ? `\n${product.description}` : "",
          options: { fontSize: 9, color: theme.textMutedOnDark },
        },
        { text: price ? `\n${price}` : "", options: { fontSize: 10, color: theme.accent } },
      ],
      {
        x,
        y: y + 1.42,
        w: cardW,
        h: 0.65,
        fontFace: theme.fontFace,
        valign: "top",
      },
    );
  });
}

export function renderSummarySlide(
  slide: Slide,
  pptx: PptxDeck,
  theme: PptxTheme,
  data: { title?: string; body?: string; bullets?: string[] },
) {
  setDarkBackground(slide, theme);
  drawBrandSidebar(slide, theme, pptx);

  slide.addText(data.title ?? "Итоги", {
    x: CONTENT_X,
    y: 0.55,
    w: CONTENT_W,
    h: 0.6,
    fontSize: 24,
    bold: true,
    color: theme.textOnDark,
    fontFace: theme.fontFace,
  });

  if (data.body) {
    slide.addText(data.body, {
      x: CONTENT_X,
      y: 1.35,
      w: CONTENT_W,
      h: 1.0,
      fontSize: 12,
      color: theme.textMutedOnDark,
      fontFace: theme.fontFace,
      valign: "top",
    });
  }

  if (data.bullets?.length) {
    slide.addText(
      data.bullets.map((text, i) => ({
        text,
        options: {
          bullet: true,
          breakLine: i < data.bullets!.length - 1,
          fontSize: 12,
          color: theme.textOnDark,
        },
      })),
      {
        x: CONTENT_X + 0.15,
        y: 2.5,
        w: CONTENT_W - 0.3,
        h: 2.5,
        fontFace: theme.fontFace,
        valign: "top",
      },
    );
  }
}

export function renderClosingSlide(
  slide: Slide,
  pptx: PptxDeck,
  theme: PptxTheme,
  data: { title?: string; body?: string; bullets?: string[] },
) {
  setDarkBackground(slide, theme);
  drawBrandSidebar(slide, theme, pptx);

  slide.addText(data.title ?? "Спасибо за внимание", {
    x: CONTENT_X,
    y: 1.85,
    w: CONTENT_W,
    h: 0.75,
    fontSize: 28,
    bold: true,
    color: theme.textOnDark,
    fontFace: theme.fontFace,
    align: "center",
  });

  if (data.body) {
    slide.addText(data.body, {
      x: CONTENT_X + 0.5,
      y: 2.75,
      w: CONTENT_W - 1,
      h: 0.8,
      fontSize: 13,
      color: theme.textMutedOnDark,
      fontFace: theme.fontFace,
      align: "center",
    });
  }

  if (data.bullets?.length) {
    slide.addText(data.bullets[0], {
      x: CONTENT_X + 0.5,
      y: 3.75,
      w: CONTENT_W - 1,
      h: 0.45,
      fontSize: 12,
      color: theme.accent,
      fontFace: theme.fontFace,
      align: "center",
    });
  }

  drawBottomBar(slide, theme, pptx);
}

export function addSpeakerNotes(slide: Slide, notes?: string) {
  if (notes?.trim()) slide.addNotes(notes.trim());
}

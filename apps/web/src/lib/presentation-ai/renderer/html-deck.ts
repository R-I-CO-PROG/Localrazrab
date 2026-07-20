import type { GeneratedPresentation, GeneratedSlide, PresentationTheme } from "../types";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function benefitIcon(icon?: string): string {
  const icons: Record<string, string> = {
    gift: "🎁",
    shield: "🛡",
    team: "👥",
    star: "★",
    leaf: "🌿",
    laptop: "💻",
    magnet: "🧲",
    thermo: "🌡",
    spark: "✦",
    heart: "♥",
  };
  return icons[icon ?? "star"] ?? "★";
}

function slideStyles(theme: PresentationTheme): string {
  return `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #f1f5f9; font-family: ${theme.typography.bodyFont}; color: ${theme.colors.text}; }
    .deck { display: flex; flex-direction: column; gap: 24px; padding: 24px; }
    .slide {
      position: relative;
      width: 100%;
      max-width: 1280px;
      margin: 0 auto;
      aspect-ratio: 16 / 9;
      overflow: hidden;
      border-radius: 8px;
      background: #ffffff;
      border: 1px solid ${theme.colors.border};
      box-shadow: 0 8px 32px rgba(15, 23, 42, 0.08);
      display: grid;
      grid-template-columns: 1fr 1fr;
      grid-template-rows: 1fr auto;
      grid-template-areas: "text hero" "footer footer";
    }
    .product-text-panel {
      grid-area: text;
      display: flex;
      flex-direction: column;
      justify-content: center;
      padding: ${theme.layout.safeMargin}px;
      padding-bottom: calc(${theme.layout.safeMargin}px + 12px);
      background: #ffffff;
      min-height: 0;
    }
    .product-hero-panel {
      grid-area: hero;
      position: relative;
      overflow: hidden;
      background: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 0;
    }
    .product-hero-panel img {
      max-width: 100%;
      max-height: 100%;
      width: auto;
      height: auto;
      object-fit: contain;
      object-position: center;
    }
    h1 { font-family: ${theme.typography.headingFont}; font-weight: ${theme.typography.headingWeight}; font-size: 44px; line-height: 1.1; color: ${theme.colors.text}; }
    h2 { font-size: 22px; color: ${theme.colors.accent}; font-weight: 600; margin-top: 12px; }
    p { color: ${theme.colors.mutedText}; font-size: 17px; line-height: 1.5; margin-top: 14px; }
    .caption { color: ${theme.colors.text}; font-size: 18px; margin-top: 16px; }
    .benefits { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 18px; }
    .benefit { background: ${theme.colors.card}; border: 1px solid ${theme.colors.border}; border-radius: 10px; padding: 10px 12px; }
    .benefit-icon { width: 28px; height: 28px; border-radius: 50%; border: 1px solid ${theme.colors.accent}; display: flex; align-items: center; justify-content: center; font-size: 13px; margin-bottom: 6px; color: ${theme.colors.accent}; }
    .benefit h3 { font-size: 12px; font-weight: 700; color: ${theme.colors.text}; }
    .benefit span { font-size: 11px; color: ${theme.colors.mutedText}; display: block; margin-top: 4px; line-height: 1.35; }
    .bottom-bars { margin-top: auto; padding-top: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .bar { background: ${theme.colors.card}; border-left: 3px solid ${theme.colors.accent}; padding: 8px 12px; border-radius: 0 8px 8px 0; }
    .bar strong { display: block; font-size: 12px; color: ${theme.colors.text}; }
    .bar em { font-size: 11px; color: ${theme.colors.mutedText}; font-style: normal; }
    .overview-list { margin-top: 14px; display: flex; flex-direction: column; gap: 8px; }
    .overview-item { display: flex; align-items: center; gap: 10px; font-size: 14px; color: ${theme.colors.text}; }
    .overview-dot { width: 8px; height: 8px; border-radius: 50%; background: ${theme.colors.accent}; flex-shrink: 0; }
    .footer { grid-area: footer; height: 28px; background: ${theme.colors.primary}; display: flex; align-items: center; justify-content: space-between; padding: 0 20px; font-size: 10px; color: #fff; }
  `;
}

function renderSplitSlide(slide: GeneratedSlide, theme: PresentationTheme): string {
  const heroImg = slide.heroImage?.url
    ? `<img src="${escapeHtml(slide.heroImage.url)}" alt="" />`
    : "";
  const benefits = (slide.benefits ?? [])
    .map(
      (b) => `
      <div class="benefit">
        <div class="benefit-icon">${benefitIcon(b.icon)}</div>
        <h3>${escapeHtml(b.title)}</h3>
        <span>${escapeHtml(b.text)}</span>
      </div>`,
    )
    .join("");
  const bars = (slide.bottomHighlights ?? [])
    .map((h) => `<div class="bar"><strong>${escapeHtml(h.label)}</strong><em>${escapeHtml(h.accent)}</em></div>`)
    .join("");
  const overviewItems = (slide.overviewItems ?? [])
    .map((item) => `<div class="overview-item"><span class="overview-dot"></span>${escapeHtml(item.name)}</div>`)
    .join("");
  const bullets = (slide.bullets ?? [])
    .map((b) => `<div class="overview-item"><span class="overview-dot"></span>${escapeHtml(b)}</div>`)
    .join("");
  const priceBlock =
    slide.showPrice && slide.price != null
      ? `<p class="caption">${escapeHtml(String(slide.price))} ₽</p>`
      : "";
  const captionBlock =
    slide.caption && !slide.description
      ? `<p class="caption">${escapeHtml(slide.caption)}</p>`
      : "";

  return `
    <section class="slide">
      <div class="product-text-panel">
        <h1>${escapeHtml(slide.title)}</h1>
        <h2>${escapeHtml(slide.subtitle ?? "")}</h2>
        ${slide.description ? `<p>${escapeHtml(slide.description)}</p>` : ""}
        ${captionBlock}
        ${priceBlock}
        ${overviewItems ? `<div class="overview-list">${overviewItems}</div>` : ""}
        ${bullets ? `<div class="overview-list">${bullets}</div>` : ""}
        ${benefits ? `<div class="benefits">${benefits}</div>` : ""}
        ${bars ? `<div class="bottom-bars">${bars}</div>` : ""}
      </div>
      <div class="product-hero-panel">${heroImg}</div>
      <div class="footer"><span>mercai.ru</span><span>${escapeHtml(slide.title)}</span></div>
    </section>`;
}

function renderSlide(slide: GeneratedSlide, theme: PresentationTheme): string {
  return renderSplitSlide(slide, theme);
}

export const SLIDE_PAGE_W = 1328;
export const SLIDE_PAGE_H = 768;

/** Standalone single-slide document — used to render each PDF page identically to the HTML Preview. */
export function renderSingleSlideHtml(slide: GeneratedSlide, theme: PresentationTheme): string {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <style>
    ${slideStyles(theme)}
    html, body { width: ${SLIDE_PAGE_W}px; height: ${SLIDE_PAGE_H}px; overflow: hidden; }
    .deck { padding: 24px; gap: 0; width: ${SLIDE_PAGE_W}px; height: ${SLIDE_PAGE_H}px; }
  </style>
</head>
<body>
  <div class="deck">${renderSlide(slide, theme)}</div>
</body>
</html>`;
}

export function renderHtmlDeck(input: {
  presentation: GeneratedPresentation;
  logoUrl?: string;
}): string {
  const { presentation } = input;
  const slidesHtml = presentation.slides
    .map((s) => renderSlide(s, presentation.theme))
    .join("\n");

  return `<!DOCTYPE html>
<html lang="${presentation.language}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(presentation.title)}</title>
  <style>${slideStyles(presentation.theme)}</style>
</head>
<body>
  <div class="deck">
    ${slidesHtml}
  </div>
</body>
</html>`;
}

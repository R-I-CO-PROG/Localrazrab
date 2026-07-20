/** Shared layout constants for product slide hero + PPTX compositor. */
export const PRODUCT_SLIDE_W = 1920;
export const PRODUCT_SLIDE_H = 1080;
/** Left or right column reserved for text overlay (exact half of 16:9 slide). */
export const PRODUCT_TEXT_PANEL_W = 960;
export const PRODUCT_HERO_PANEL_W = PRODUCT_SLIDE_W - PRODUCT_TEXT_PANEL_W;

/** Product hero asset — half of 16:9 slide (960×1080). */
export const PRODUCT_HERO_ASPECT = "8:9";
/** Closest OpenRouter aspect for 8:9 portrait panel (crop to exact size after gen). */
export const PRODUCT_HERO_GENERATION_ASPECT = "4:5";

export type ProductHeroSide = "left" | "right";

export function heroSideFromLayout(layout?: string): ProductHeroSide {
  return layout === "product_right_image_left_text" ? "left" : "right";
}

/** X offset for the text column — opposite half from the product hero. */
export function textPanelX(heroSide: ProductHeroSide, margin = 56): number {
  return heroSide === "right" ? margin : PRODUCT_HERO_PANEL_W + margin;
}

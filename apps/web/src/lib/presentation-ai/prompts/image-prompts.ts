import type { BrandAnalysis, ProductInput, StyleDirection } from "../types";

function coverSplitComposition(): string {
  return "Strict 16:9 split layout: LEFT HALF empty dark gradient for title text; RIGHT HALF shows hero gift box or product cluster. Vertical center split.";
}

export function buildCoverImagePrompt(input: {
  brandName: string;
  brandAnalysis: BrandAnalysis;
  styleDirection: StyleDirection;
  occasion?: string;
  productNames: string[];
  referenceCount?: number;
}): string {
  const colors = [...input.brandAnalysis.primaryColors, ...input.brandAnalysis.accentColors]
    .slice(0, 4)
    .join(", ");

  return [
    `Create a premium cinematic corporate gift presentation cover for brand ${input.brandName}.`,
    `Style: ${input.styleDirection.theme}. ${input.styleDirection.background}.`,
    `Mood: ${input.styleDirection.mood}.`,
    `Occasion: ${input.occasion ?? "corporate gift"}.`,
    `Keywords: ${input.brandAnalysis.designKeywords.slice(0, 6).join(", ")}.`,
    `Brand colors: ${colors}.`,
    `Products context: ${input.productNames.slice(0, 5).join(", ")}.`,
    input.referenceCount
      ? `IMPORTANT: ${input.referenceCount} catalog product reference photo(s) attached — show these exact products in the hero scene.`
      : "",
    "Dark premium studio background, glowing accent light trails, luxury corporate style.",
    "16:9 composition, high contrast, realistic 3D render, dramatic lighting.",
    coverSplitComposition(),
    "No readable text except provided logo, no random letters, no watermark.",
  ].join(" ");
}

export function buildProductImagePrompt(input: {
  brandName: string;
  productName: string;
  productDescription: string;
  brandAnalysis: BrandAnalysis;
  styleDirection: StyleDirection;
  customPrompt?: string;
  hasReferencePhoto?: boolean;
  heroSide?: "left" | "right";
}): string {
  if (input.customPrompt?.trim()) return input.customPrompt.trim();

  const colors = input.brandAnalysis.primaryColors.join(", ");
  const refNote = input.hasReferencePhoto
    ? "IMPORTANT: Use the attached reference product photo(s) — reproduce the EXACT same product shape, color, and branding."
    : "";

  return [
    `Create a premium hero product render of ${input.productName} for a presentation slide panel.`,
    "Format: 8:9 vertical panel (half of a 16:9 slide). Product centered and large, filling most of the frame.",
    "Dark premium studio background with soft reflections, cinematic rim light, realistic shadows.",
    "Single product focus — this image will occupy ONE half of the final slide; text goes on the other half separately.",
    refNote,
    `Product description: ${input.productDescription}.`,
    `Brand: ${input.brandName}. Apply the provided logo naturally on the product or packaging.`,
    `Style: ${input.styleDirection.theme}. Scene: ${input.styleDirection.background}.`,
    `Brand colors: ${colors}.`,
    "Ultra-detailed premium advertising render.",
    "Restrictions: no random text, no misspelled words, no watermark, no extra logos, do not distort the brand logo.",
  ]
    .filter(Boolean)
    .join(" ");
}

export function buildCollectionOverviewImagePrompt(input: {
  brandName: string;
  brandAnalysis: BrandAnalysis;
  styleDirection: StyleDirection;
  products: ProductInput[];
  occasion?: string;
  referenceCount?: number;
}): string {
  const colors = input.brandAnalysis.primaryColors.join(", ");
  const productList = input.products.map((p) => p.name).join(", ");
  const refNote =
    (input.referenceCount ?? 0) > 0
      ? `IMPORTANT: ${input.referenceCount} reference product photo(s) are attached — include ALL these exact catalog products in the scene, matching their appearance from the references.`
      : "";

  return [
    `Create a premium product collection hero image for corporate gifts by ${input.brandName}.`,
    refNote,
    `Show the branded gift collection with these products: ${productList}.`,
    `Style: ${input.styleDirection.theme}. ${input.styleDirection.background}.`,
    `Brand colors: ${colors}. Occasion: ${input.occasion ?? "corporate"}.`,
    "Dark glossy surface, subtle reflections, cohesive brand colors, premium packaging.",
    "Logo applied naturally on products and boxes.",
    "Realistic product photography, cinematic lighting, 16:9 wide composition.",
    "Strict 16:9 split: products grouped on the RIGHT HALF; LEFT HALF empty dark gradient for text overlay.",
    "No random text, no watermark.",
  ]
    .filter(Boolean)
    .join(" ");
}

export function buildClosingImagePrompt(input: {
  brandName: string;
  brandAnalysis: BrandAnalysis;
  styleDirection: StyleDirection;
}): string {
  return [
    `Create a premium closing slide background for ${input.brandName} corporate presentation.`,
    `Style: ${input.styleDirection.theme}. ${input.styleDirection.background}.`,
    `Mood: ${input.styleDirection.mood}, confident, memorable.`,
    "Abstract premium dark background with subtle brand glow lines.",
    "16:9, centered empty space for text overlay, no readable text, no watermark.",
  ].join(" ");
}

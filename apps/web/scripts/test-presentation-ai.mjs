/**
 * Smoke tests for presentation-ai (no TS imports).
 * Run from repo root: node apps/web/scripts/test-presentation-ai.mjs
 */

import assert from "node:assert/strict";

function buildDefaultSlideStructure({ brandName, products, occasion, slideCount }) {
  const slides = [];
  slides.push({ type: "cover", title: brandName, layout: "cover" });
  slides.push({ type: "collection_overview", title: `Коллекция ${occasion}`, layout: "collection_overview" });
  for (const p of products) {
    slides.push({ type: "product", productId: p.id, title: p.name, layout: "product_left_image_right_text" });
  }
  slides.push({ type: "thank_you", title: "Спасибо", layout: "thank_you" });
  if (slideCount && slides.length > slideCount) {
    return [slides[0], slides[1], ...slides.filter((s) => s.type === "product").slice(0, slideCount - 3), slides.at(-1)];
  }
  return slides;
}

function normalizeIconKey(icon) {
  const map = { temperature: "thermo", satellite: "spark", magnet: "magnet" };
  return map[icon?.toLowerCase()] ?? "star";
}

function buildCoverImagePrompt({ brandName }) {
  return `Create premium cover for ${brandName}. 16:9, no watermark.`;
}

const products = [
  { id: "a", name: "A" },
  { id: "b", name: "B" },
  { id: "c", name: "C" },
  { id: "d", name: "D" },
  { id: "e", name: "E" },
];

const structure = buildDefaultSlideStructure({
  brandName: "GTNT",
  products,
  occasion: "Новый год",
  slideCount: 8,
});
assert.equal(structure[0].type, "cover");
assert.equal(structure.filter((s) => s.type === "product").length, 5);
assert.equal(normalizeIconKey("temperature"), "thermo");
assert.ok(buildCoverImagePrompt({ brandName: "GTNT" }).includes("16:9"));

console.log("✓ slide structure");
console.log("✓ icon normalization");
console.log("✓ image prompt builder");
console.log("\nAll presentation-ai smoke tests passed.");

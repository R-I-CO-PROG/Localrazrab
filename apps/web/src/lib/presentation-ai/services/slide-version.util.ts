import type { GeneratedSlide, SlideVariant, SlideVariantSnapshot } from "../types";

export function toSlideSnapshot(slide: GeneratedSlide): SlideVariantSnapshot {
  return {
    title: slide.title,
    subtitle: slide.subtitle,
    description: slide.description,
    caption: slide.caption,
    benefits: slide.benefits,
    bottomHighlights: slide.bottomHighlights,
    heroImage: slide.heroImage,
    backgroundImage: slide.backgroundImage,
    logoPlacement: slide.logoPlacement,
    overviewItems: slide.overviewItems,
    bullets: slide.bullets,
    speakerNotes: slide.speakerNotes,
    price: slide.price,
    showPrice: slide.showPrice,
  };
}

export function applySnapshotToSlide(
  slide: GeneratedSlide,
  snapshot: SlideVariantSnapshot,
): GeneratedSlide {
  return {
    ...slide,
    ...snapshot,
    id: slide.id,
    type: slide.type,
    layout: slide.layout,
    productId: slide.productId,
  };
}

export function ensureSlideVariants(slide: GeneratedSlide): GeneratedSlide {
  if (slide.variants?.length) return slide;

  const snapshot = toSlideSnapshot(slide);
  const variants: SlideVariant[] = [
    {
      id: `v-initial-${slide.id}`,
      createdAt: new Date().toISOString(),
      snapshot,
    },
  ];

  return {
    ...slide,
    variants,
    activeVariantIndex: 0,
  };
}

export function addSlideVariant(
  slide: GeneratedSlide,
  snapshot: SlideVariantSnapshot,
  refinementPrompt?: string,
): GeneratedSlide {
  const withVariants = ensureSlideVariants(slide);
  const variants = withVariants.variants ?? [];
  const newVariant: SlideVariant = {
    id: `v-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
    refinementPrompt,
    snapshot,
  };
  const nextVariants = [...variants, newVariant];
  const activeVariantIndex = nextVariants.length - 1;

  return applyVariantToSlide(
    {
      ...withVariants,
      variants: nextVariants,
      activeVariantIndex,
    },
    activeVariantIndex,
  );
}

export function applyVariantToSlide(slide: GeneratedSlide, index: number): GeneratedSlide {
  const variants = slide.variants ?? [];
  const variant = variants[index];
  if (!variant) return slide;

  return applySnapshotToSlide(
    {
      ...slide,
      variants,
      activeVariantIndex: index,
    },
    variant.snapshot,
  );
}

export function initializeSlidesVariants(slides: GeneratedSlide[]): GeneratedSlide[] {
  return slides.map(ensureSlideVariants);
}

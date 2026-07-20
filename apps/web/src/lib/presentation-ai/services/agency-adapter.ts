import type { PresentationSlide, PresentationBenefit } from "@/lib/brand-palette";
import type { GeneratedSlide, PresentationGenerationInput, PresentationTheme } from "../types";

function mapSlideType(type: GeneratedSlide["type"]): PresentationSlide["type"] {
  switch (type) {
    case "cover":
      return "agencyCover";
    case "collection_overview":
      return "agencyOverview";
    case "product":
      return "agencyProduct";
    case "thank_you":
      return "agencyClosing";
    default:
      return "agencyProduct";
  }
}

function imageUrlFromAsset(url?: string): string | undefined {
  if (!url) return undefined;
  return url;
}

export function convertToAgencySlides(
  slides: GeneratedSlide[],
  input: PresentationGenerationInput,
  theme: PresentationTheme,
): PresentationSlide[] {
  return slides.map((slide) => {
    const agencyType = mapSlideType(slide.type);
    const imageUrl =
      imageUrlFromAsset(slide.heroImage?.url) ??
      imageUrlFromAsset(slide.backgroundImage?.url);

    const base: PresentationSlide = {
      type: agencyType,
      title: slide.title,
      subtitle: slide.subtitle,
      body: slide.description ?? slide.caption,
      bullets: slide.bullets,
      speakerNotes: slide.speakerNotes,
      benefits: slide.benefits as PresentationBenefit[] | undefined,
      footerLeft: input.brand.website ?? "mercai.ru",
      footerRight: input.brand.name,
      imageUrl,
      productName: slide.type === "product" ? slide.title : undefined,
      price: typeof slide.price === "number" ? slide.price : undefined,
      overviewItems: slide.overviewItems?.map((item) => ({
        name: item.name,
        icon: item.icon,
      })),
    };

    if (agencyType === "agencyCover") {
      base.galleryImages = slides
        .filter((s) => s.heroImage?.url)
        .map((s) => s.heroImage!.url)
        .slice(0, 5);
      base.title = slide.title;
      base.subtitle = slide.subtitle;
      base.body = slide.caption ?? slide.description;
    }

    if (agencyType === "agencyClosing") {
      base.title = slide.title;
      base.subtitle = slide.subtitle;
      base.body = slide.description ?? slide.caption;
      base.bullets = slide.bullets;
    }

    if (agencyType === "agencyOverview" && slide.bottomHighlights?.length) {
      base.body = slide.description ?? base.body;
      base.bullets = slide.bottomHighlights.map((h) => `${h.label} — ${h.accent}`);
    }

    if (agencyType === "agencyProduct" && slide.bottomHighlights?.length) {
      base.bullets = slide.bottomHighlights.map((h) => h.label);
    }

    return base;
  });
}

export function buildPromptFromInput(input: PresentationGenerationInput): string {
  return [
    input.occasion ?? "корпоративный подарок",
    input.audience ? `для ${input.audience}` : "",
    input.brand.description ?? "",
    input.products.map((p) => p.name).join(", "),
  ]
    .filter(Boolean)
    .join(". ");
}

export function brandPaletteFromInput(
  input: PresentationGenerationInput,
  theme: PresentationTheme,
) {
  return {
    detectedColors: input.brand.colors ?? [],
    activeColors: input.brand.colors?.length
      ? input.brand.colors
      : [theme.colors.primary, theme.colors.accent, theme.colors.text],
    detectedStyle: "premium" as const,
    activeStyle: "premium" as const,
    manualOverride: Boolean(input.brand.colors?.length),
  };
}

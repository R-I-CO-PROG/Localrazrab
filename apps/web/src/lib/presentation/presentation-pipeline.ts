import type { BrandPaletteSettings, PresentationSlide } from "@/lib/brand-palette";
import { createDeckArtDirection } from "./presentation-art-direction";
import { resolveSlidesImagesForPptx } from "./presentation-images";
import {
  createCinematicCoverBackground,
  createOverviewMosaic,
  createStudioProductHero,
} from "./presentation-visual-assets";

export async function enrichAgencySlidesWithVisuals(input: {
  slides: PresentationSlide[];
  title: string;
  prompt: string;
  brand?: BrandPaletteSettings;
}): Promise<PresentationSlide[]> {
  const art = createDeckArtDirection({
    title: input.title,
    prompt: input.prompt,
    brand: input.brand,
  });

  const resolved = await resolveSlidesImagesForPptx(input.slides);

  const enriched: PresentationSlide[] = [];

  for (const slide of resolved) {
    const next = { ...slide };

    if (slide.type === "agencyCover") {
      const thumbs = slide.galleryImages ?? [];
      next.imageUrl = await createCinematicCoverBackground(art, thumbs);
      if (!next.footerLeft) next.footerLeft = art.footerLeft;
      if (!next.footerRight) next.footerRight = art.footerRight;
    }

    if (slide.type === "agencyOverview") {
      const mosaicSources = slide.galleryImages?.length
        ? slide.galleryImages
        : slide.overviewItems?.map((o) => o.thumbUrl).filter(Boolean);
      const mosaic = await createOverviewMosaic(
        (mosaicSources ?? []) as string[],
        art,
      );
      if (mosaic) next.imageUrl = mosaic;
      else if (slide.imageUrl) {
        next.imageUrl = await createStudioProductHero(slide.imageUrl, art);
      }
    }

    if (slide.type === "agencyProduct" && slide.imageUrl) {
      next.imageUrl = await createStudioProductHero(slide.imageUrl, art);
    }

    if (slide.type === "agencyClosing") {
      if (!next.footerLeft) next.footerLeft = art.footerLeft;
      if (!next.footerRight) next.footerRight = art.footerRight;
    }

    enriched.push(next);
  }

  return enriched;
}

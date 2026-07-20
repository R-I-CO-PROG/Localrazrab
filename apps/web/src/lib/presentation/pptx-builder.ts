import PptxGenJS from "pptxgenjs";
import type { BrandPaletteSettings, PresentationSlide } from "@/lib/brand-palette";
import { createDeckArtDirection } from "./presentation-art-direction";
import {
  buildAgencyIconCache,
  renderAgencyClosing,
  renderAgencyCover,
  renderAgencyOverview,
  renderAgencyProduct,
} from "./pptx-agency-layouts";
import { createPptxTheme } from "./pptx-theme";
import {
  addSpeakerNotes,
  renderClosingSlide,
  renderConceptGrid,
  renderConceptShowcase,
  renderConceptsIntroSlide,
  renderHowItWorks,
  renderInsightSlide,
  renderProductsSlide,
  renderQuoteSlide,
  renderSectionSlide,
  renderSummarySlide,
  renderTitleSlide,
  renderVisualizationHero,
} from "./pptx-layouts";
import type { PresentationVisualizationInput } from "./presentation-types";
import { buildAgencyPresentationSlides } from "./presentation-agency-structure";

export interface PresentationBuildInput {
  title: string;
  prompt: string;
  slides: PresentationSlide[];
  brand?: BrandPaletteSettings;
  logoDataUrl?: string;
}

function isAgencyDeck(slides: PresentationSlide[]): boolean {
  return slides.some((s) => s.type.startsWith("agency"));
}

export function buildPresentationSlides(input: {
  title: string;
  prompt: string;
  visualizations: PresentationVisualizationInput[];
}): PresentationSlide[] {
  return buildAgencyPresentationSlides(input);
}

export async function generatePptxBuffer(input: PresentationBuildInput): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.author = "Mercai";
  pptx.title = input.title;
  pptx.layout = "LAYOUT_16x9";

  const theme = createPptxTheme(input.brand, input.title);
  const agency = isAgencyDeck(input.slides);

  const art = createDeckArtDirection({
    title: input.title,
    prompt: input.prompt,
    brand: input.brand,
  });

  const iconDataByKey = agency
    ? await buildAgencyIconCache(art.accentHex, input.slides)
    : new Map<string, string>();

  const agencyCtx = {
    theme,
    art,
    logoDataUrl: input.logoDataUrl,
    iconDataByKey,
  };

  for (const slideData of input.slides) {
    const s = pptx.addSlide();
    addSpeakerNotes(s, slideData.speakerNotes);

    switch (slideData.type) {
      case "agencyCover":
        renderAgencyCover(s, pptx, agencyCtx, slideData);
        break;

      case "agencyOverview":
        renderAgencyOverview(s, pptx, agencyCtx, slideData);
        break;

      case "agencyProduct":
        renderAgencyProduct(s, pptx, agencyCtx, slideData);
        break;

      case "agencyClosing":
        renderAgencyClosing(s, pptx, agencyCtx, slideData);
        break;

      case "title":
        renderTitleSlide(s, pptx, theme, {
          title: slideData.title ?? input.title,
          subtitle: slideData.subtitle,
          body: slideData.body,
          logoDataUrl: input.logoDataUrl,
        });
        break;

      case "insight":
        renderInsightSlide(s, pptx, theme, slideData);
        break;

      case "conceptsIntro":
        renderConceptsIntroSlide(s, pptx, theme, slideData);
        break;

      case "section":
        renderSectionSlide(s, pptx, theme, slideData);
        break;

      case "visualization":
        renderVisualizationHero(s, pptx, theme, slideData);
        break;

      case "conceptShowcase":
        renderConceptShowcase(s, pptx, theme, slideData);
        break;

      case "conceptGrid":
        renderConceptGrid(s, pptx, theme, slideData);
        break;

      case "howItWorks":
        renderHowItWorks(s, pptx, theme, slideData);
        break;

      case "quote":
        renderQuoteSlide(s, pptx, theme, slideData);
        break;

      case "products":
        renderProductsSlide(s, pptx, theme, slideData);
        break;

      case "summary":
        renderSummarySlide(s, pptx, theme, slideData);
        break;

      case "closing":
        renderClosingSlide(s, pptx, theme, slideData);
        break;

      default:
        if (agency) {
          renderAgencyProduct(s, pptx, agencyCtx, slideData);
        } else {
          renderInsightSlide(s, pptx, theme, {
            title: slideData.title,
            subtitle: slideData.subtitle,
            body: slideData.body,
            imageUrl: slideData.imageUrl,
          });
        }
        break;
    }
  }

  const data = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
  return data;
}

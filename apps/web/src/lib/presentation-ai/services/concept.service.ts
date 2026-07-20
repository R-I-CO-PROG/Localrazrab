import type { BrandAnalysis, ConceptSlideOutline, PresentationConcept, ProductInput } from "../types";
import {
  buildConceptSystemPrompt,
  buildConceptUserMessage,
} from "../prompts/concept";
import { presentationConceptSchema, parseJsonWithRepair } from "../schemas";
import { getTextProvider } from "../providers/text-provider";
import { buildDefaultSlideStructure } from "./slide-structure.service";

export async function generatePresentationConcept(input: {
  brandAnalysis: BrandAnalysis;
  products: ProductInput[];
  occasion?: string;
  audience?: string;
  slideCount?: number;
  quality: string;
  language?: string;
}): Promise<PresentationConcept> {
  const fallbackTitle = `${input.brandAnalysis.brandName} — корпоративная коллекция`;
  const defaultSlides = buildDefaultSlideStructure({
    brandName: input.brandAnalysis.brandName,
    products: input.products,
    occasion: input.occasion,
    slideCount: input.slideCount,
  });

  const fallback: PresentationConcept = {
    presentationTitle: fallbackTitle,
    bigIdea: "Подарки, которые усиливают бренд",
    narrative: "Показать коллекцию как продолжение фирменного стиля и заботы о людях",
    styleDirection: {
      theme: input.brandAnalysis.visualTone,
      background: "deep navy, glowing accent light trails",
      composition: "50/50 split — product hero on one half, text on the other",
      visualDensity: "premium editorial",
      mood: "expensive, confident, corporate",
    },
    slides: defaultSlides,
  };

  const text = getTextProvider();
  if (!text.isAvailable()) return fallback;

  try {
    const raw = await text.generateText({
      systemPrompt: buildConceptSystemPrompt(input.language ?? "ru"),
      userMessage: buildConceptUserMessage(input),
      temperature: 0.55,
    });
    const parsed = parseJsonWithRepair(raw, presentationConceptSchema);
    return {
      ...parsed,
      slides: parsed.slides.map((slide, i) => ({
        ...slide,
        layout: (slide.layout as ConceptSlideOutline["layout"]) ?? undefined,
      })),
    };
  } catch {
    return fallback;
  }
}

import { z } from "zod";
import type { BrandAnalysis, GeneratedSlide, ProductStory } from "../types";
import {
  buildSlideRefineSystemPrompt,
  buildSlideRefineUserMessage,
} from "../prompts/slide-refine";
import { benefitSchema, bottomHighlightSchema, normalizeIconKey, parseJsonWithRepair } from "../schemas";
import { getTextProvider } from "../providers/text-provider";

const refineResponseSchema = z.object({
  title: z.string(),
  subtitle: z.string().optional(),
  description: z.string().optional(),
  caption: z.string().optional(),
  benefits: z.array(benefitSchema).optional(),
  bottomHighlights: z.array(bottomHighlightSchema).optional(),
  bullets: z.array(z.string()).optional(),
  imagePromptHint: z.string().optional(),
});

export async function refineSlideCopy(input: {
  slide: GeneratedSlide;
  refinementPrompt: string;
  brandAnalysis: BrandAnalysis;
  language?: string;
  occasion?: string;
}): Promise<{ slide: GeneratedSlide; imagePromptHint?: string }> {
  const text = getTextProvider();

  try {
    const raw = await text.generateText({
      systemPrompt: buildSlideRefineSystemPrompt(input.language ?? "ru"),
      userMessage: buildSlideRefineUserMessage({
        slide: input.slide,
        refinementPrompt: input.refinementPrompt,
        brandName: input.brandAnalysis.brandName,
        occasion: input.occasion,
      }),
      temperature: 0.55,
      maxTokens: 2000,
    });

    const parsed = parseJsonWithRepair(raw, refineResponseSchema);

    const benefits = parsed.benefits?.map((b) => ({
      ...b,
      icon: normalizeIconKey(b.icon),
    }));

    return {
      slide: {
        ...input.slide,
        title: parsed.title || input.slide.title,
        subtitle: parsed.subtitle ?? input.slide.subtitle,
        description: parsed.description ?? input.slide.description,
        caption: parsed.caption ?? input.slide.caption,
        benefits: benefits ?? input.slide.benefits,
        bottomHighlights: parsed.bottomHighlights ?? input.slide.bottomHighlights,
        bullets: parsed.bullets ?? input.slide.bullets,
      },
      imagePromptHint: parsed.imagePromptHint,
    };
  } catch (error) {
    console.warn("[presentation-ai] slide refine fallback:", error);
    return { slide: input.slide };
  }
}

export function augmentProductStoryForRegen(
  story: ProductStory | undefined,
  refinementPrompt: string,
  imagePromptHint?: string,
): ProductStory | undefined {
  if (!story) return undefined;

  const suffix = [refinementPrompt, imagePromptHint].filter(Boolean).join(". ");
  if (!suffix) return story;

  return {
    ...story,
    imagePrompt: `${story.imagePrompt}. User refinement: ${suffix}`,
    backgroundPrompt: `${story.backgroundPrompt}. ${suffix}`,
  };
}

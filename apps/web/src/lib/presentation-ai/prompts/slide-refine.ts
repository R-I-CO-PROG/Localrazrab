import type { GeneratedSlide } from "../types";

export function buildSlideRefineSystemPrompt(language = "ru"): string {
  return `You refine a single presentation slide based on user feedback.
Respond ONLY with valid JSON matching this schema:
{
  "title": "string",
  "subtitle": "string optional",
  "description": "string optional",
  "caption": "string optional",
  "benefits": [{ "title": "string", "text": "string", "icon": "gift|shield|team|star|leaf|laptop|magnet|thermo|spark|heart" }] optional,
  "bottomHighlights": [{ "label": "string", "accent": "string" }] optional,
  "bullets": ["string"] optional,
  "imagePromptHint": "string optional — extra instructions for AI image generation if photo will be regenerated"
}
Keep brand tone premium and corporate. Language: ${language}.`;
}

export function buildSlideRefineUserMessage(input: {
  slide: GeneratedSlide;
  refinementPrompt: string;
  brandName: string;
  occasion?: string;
}): string {
  return JSON.stringify(
    {
      brandName: input.brandName,
      occasion: input.occasion,
      slideType: input.slide.type,
      current: {
        title: input.slide.title,
        subtitle: input.slide.subtitle,
        description: input.slide.description,
        caption: input.slide.caption,
        benefits: input.slide.benefits,
        bottomHighlights: input.slide.bottomHighlights,
        bullets: input.slide.bullets,
      },
      userRequest: input.refinementPrompt,
    },
    null,
    2,
  );
}

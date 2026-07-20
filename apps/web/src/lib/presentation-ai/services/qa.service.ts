import type { PresentationQuality, SlideQaResult } from "../types";
import { QA_THRESHOLDS } from "../constants";
import { buildQaSystemPrompt, buildQaUserMessage } from "../prompts/qa";
import { slideQaSchema, parseJsonWithRepair } from "../schemas";
import { getTextProvider } from "../providers/text-provider";

export async function runSlideQa(input: {
  slideType: string;
  title: string;
  quality: PresentationQuality;
  stylePreset: string;
  hasHeroImage: boolean;
}): Promise<SlideQaResult> {
  const threshold = QA_THRESHOLDS[input.quality];
  const fallback: SlideQaResult = {
    score: input.hasHeroImage ? 0.85 : 0.72,
    issues: [],
    shouldRegenerate: false,
    suggestedFixes: [],
  };

  if (input.quality === "draft") return { ...fallback, score: 0.9 };

  const text = getTextProvider();
  if (!text.isAvailable()) return fallback;

  try {
    const raw = await text.generateText({
      systemPrompt: buildQaSystemPrompt(),
      userMessage: buildQaUserMessage(input),
      temperature: 0.2,
      maxTokens: 1500,
    });
    const result = parseJsonWithRepair(raw, slideQaSchema);
    if (result.score < threshold) {
      result.shouldRegenerate = true;
    }
    return result;
  } catch {
    return fallback;
  }
}

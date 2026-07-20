import { openRouterChatJson, isOpenRouterEnabled } from "@/lib/openrouter-client";

export interface TextGenerationInput {
  systemPrompt: string;
  userMessage: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface TextProvider {
  generateText(input: TextGenerationInput): Promise<string>;
  isAvailable(): boolean;
}

export class OpenRouterTextProvider implements TextProvider {
  isAvailable(): boolean {
    return isOpenRouterEnabled();
  }

  async generateText(input: TextGenerationInput): Promise<string> {
    return openRouterChatJson({
      systemPrompt: input.systemPrompt,
      userMessage: input.userMessage,
      model:
        input.model ||
        process.env.AI_PRESENTATION_MODEL?.trim() ||
        process.env.OPENROUTER_MODEL_PRESENTATION?.trim() ||
        "openai/o4-mini",
      maxTokens: input.maxTokens ?? (Number(process.env.OPENROUTER_MAX_TOKENS_PRESENTATION) || 8000),
      temperature: input.temperature ?? 0.5,
    });
  }
}

let textProvider: TextProvider | null = null;

export function getTextProvider(): TextProvider {
  if (!textProvider) {
    const name = (process.env.AI_TEXT_PROVIDER ?? "openrouter").toLowerCase();
    if (name === "openrouter" || name === "default") {
      textProvider = new OpenRouterTextProvider();
    } else {
      textProvider = new OpenRouterTextProvider();
    }
  }
  return textProvider;
}

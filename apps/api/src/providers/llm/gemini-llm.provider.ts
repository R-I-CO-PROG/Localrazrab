import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmProvider, LlmGenerationInput, LlmGenerationOutput } from './llm.interface';
import { buildLlmOutputFromContent } from './parse-llm-json';
import {
  buildLlmUserMessage,
  buildLlmUserPayload,
  resolveLlmSystemPrompt,
} from './llm-prompts';
import { shouldRespectUserProducts } from './respect-user-products';

@Injectable()
export class GeminiLlmProvider implements LlmProvider {
  private readonly logger = new Logger(GeminiLlmProvider.name);

  constructor(private readonly config: ConfigService) {}

  async generate(input: LlmGenerationInput): Promise<LlmGenerationOutput> {
    const apiKey = this.config.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not configured. Get a free key at https://aistudio.google.com/apikey');
    }

    const model = input.briefParseMode
      ? this.config.get<string>('BRIEF_PARSE_MODEL', 'google/gemini-2.5-flash')
      : this.config.get<string>('GEMINI_MODEL', 'gemini-2.5-flash-lite');
    const baseUrl = this.config.get<string>(
      'GEMINI_API_URL',
      'https://generativelanguage.googleapis.com/v1beta',
    );
    const url = `${baseUrl}/models/${model}:generateContent?key=${apiKey}`;

    const respectUser = shouldRespectUserProducts(input);
    const sceneOnly = input.sceneOnly ?? false;
    const userPayload = buildLlmUserPayload(input, {
      respectUserProducts: respectUser || sceneOnly,
    });
    const userMessage = input.briefParseMode
      ? buildLlmUserMessage({ task: input.userPrompt })
      : buildLlmUserMessage(userPayload);
    const systemPrompt = resolveLlmSystemPrompt(
      {
        sceneOnly,
        creativeMode: input.creativeMode,
        suggestMode: input.suggestMode,
        briefParseMode: input.briefParseMode,
      },
      respectUser,
    );

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userMessage }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.7,
        },
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      this.logger.error(`Gemini API error: ${response.status} ${text}`);
      if (text.includes('not supported for the API use') || text.includes('FAILED_PRECONDITION')) {
        throw new Error(
          'Gemini заблокирован в вашем регионе. Используйте LLM_PROVIDER=openrouter и ключ с https://openrouter.ai/keys',
        );
      }
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      error?: { message?: string };
    };

    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) {
      throw new Error(data.error?.message ?? 'Empty Gemini response');
    }

    return buildLlmOutputFromContent(content, input);
  }
}

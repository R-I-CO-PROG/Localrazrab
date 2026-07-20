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
export class DeepseekLlmProvider implements LlmProvider {
  private readonly logger = new Logger(DeepseekLlmProvider.name);

  constructor(private readonly config: ConfigService) {}

  async generate(input: LlmGenerationInput): Promise<LlmGenerationOutput> {
    const apiKey = this.config.get<string>('DEEPSEEK_API_KEY');
    const apiUrl = this.config.get<string>(
      'DEEPSEEK_API_URL',
      'https://api.deepseek.com/v1/chat/completions',
    );

    if (!apiKey) {
      throw new Error('DEEPSEEK_API_KEY is not configured');
    }

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

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      this.logger.error(`DeepSeek API error: ${response.status} ${text}`);
      throw new Error(`DeepSeek API error: ${response.status}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    const content = data.choices[0]?.message?.content;
    if (!content) throw new Error('Empty DeepSeek response');

    return buildLlmOutputFromContent(content, input);
  }
}

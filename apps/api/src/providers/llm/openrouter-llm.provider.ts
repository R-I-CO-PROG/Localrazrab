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
import { openRouterFetch } from './openrouter-proxy.util';
import { safeJsonParse } from './safe-json-parse.util';

/** GPT-4o mini — основной текстовый LLM через OpenRouter */
const DEFAULT_MODEL = 'openai/gpt-4o-mini';

const DEFAULT_FALLBACKS = [
  'liquid/lfm-2.5-1.2b-instruct:free',
  'nvidia/nemotron-nano-9b-v2:free',
  'meta-llama/llama-3.3-70b-instruct:free',
];

function isSkipModelError(msg: string): boolean {
  return (
    msg.includes('HTTP 404') ||
    msg.includes('unavailable for free') ||
    msg.includes('No endpoints found')
  );
}

function isRateLimited(msg: string): boolean {
  return msg.includes('429') || msg.includes('rate-limited') || msg.includes('rate limit');
}

@Injectable()
export class OpenrouterLlmProvider implements LlmProvider {
  private readonly logger = new Logger(OpenrouterLlmProvider.name);
  lastModelUsed: string | null = null;

  constructor(private readonly config: ConfigService) {}

  private resolveModels(input?: LlmGenerationInput): string[] {
    if (input?.briefParseMode) {
      const briefModel = this.config.get<string>(
        'BRIEF_PARSE_MODEL',
        'google/gemini-2.5-flash',
      );
      const extra = (this.config.get<string>('OPENROUTER_FALLBACK_MODELS', '') || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      return [...new Set([briefModel, ...extra, ...DEFAULT_FALLBACKS])];
    }
    const primary = this.config.get<string>('OPENROUTER_MODEL', DEFAULT_MODEL);
    if (this.config.get<string>('OPENROUTER_SINGLE_MODEL', 'false') === 'true') {
      return [primary];
    }
    const extra = (this.config.get<string>('OPENROUTER_FALLBACK_MODELS', '') || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return [...new Set([primary, ...extra, ...DEFAULT_FALLBACKS])];
  }

  async generate(input: LlmGenerationInput): Promise<LlmGenerationOutput> {
    const apiKey = this.config.get<string>('OPENROUTER_API_KEY');
    if (!apiKey?.trim()) {
      throw new Error('OPENROUTER_API_KEY is not configured');
    }

    const respectUser = shouldRespectUserProducts(input);
    const sceneOnly = input.sceneOnly ?? false;
    const userPayload = buildLlmUserPayload(input, {
      respectUserProducts: respectUser || sceneOnly,
      suggestMode: input.suggestMode,
      productAddMode: input.productAddMode,
      currentSetProducts: input.currentSetProductNames,
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
        catalogConceptsMode: input.catalogConceptsMode,
        productAddMode: input.productAddMode,
      },
      respectUser,
    );

    const models = this.resolveModels(input);
    const maxRetries = Number(this.config.get('OPENROUTER_MAX_RETRIES', 1));
    const rateLimitAbortAfter = Number(this.config.get('OPENROUTER_RATE_LIMIT_ABORT_AFTER', 2));
    const errors: string[] = [];
    let rateLimitHits = 0;

    for (const model of models) {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const started = Date.now();
          this.logger.log(`OpenRouter → ${model} (${attempt}/${maxRetries})…`);

          let content = '';
          for (const jsonMode of [true, false] as const) {
            try {
              content = await this.callModel(apiKey, model, systemPrompt, userMessage, jsonMode);
              if (content.trim()) break;
            } catch (callErr) {
              const callMsg = callErr instanceof Error ? callErr.message : String(callErr);
              if (
                jsonMode &&
                (callMsg.includes('Upstream error') ||
                  callMsg.includes('unexpected tokens') ||
                  callMsg.includes('response_format'))
              ) {
                this.logger.warn(`${model}: json_mode failed → plain (${callMsg.slice(0, 60)})`);
                continue;
              }
              throw callErr;
            }
          }
          if (!content.trim()) {
            throw new Error('Empty response');
          }

          this.lastModelUsed = model;
          this.logger.log(`OpenRouter OK: ${model} (${Date.now() - started}ms)`);

          return buildLlmOutputFromContent(content, input);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`${model}: ${msg.slice(0, 120)}`);

          if (isSkipModelError(msg)) {
            this.logger.warn(`Skip model ${model}: ${msg.slice(0, 80)}`);
            break;
          }

          // 429 на free tier — не ждём, сразу следующая модель или stub
          if (isRateLimited(msg)) {
            rateLimitHits++;
            this.logger.warn(
              `${model} rate-limited (${rateLimitHits}/${rateLimitAbortAfter}) → skip`,
            );
            if (rateLimitHits >= rateLimitAbortAfter) {
              throw new Error(
                `OpenRouter free tier rate-limited (${rateLimitHits} models) — use stub fallback`,
              );
            }
            break;
          }

          if (
            (msg.includes('Empty') || msg.includes('timeout')) &&
            attempt < maxRetries
          ) {
            await new Promise((r) => setTimeout(r, 1500 * attempt));
            continue;
          }

          break;
        }
      }
    }

    throw new Error(`OpenRouter failed (${errors.length} tries). Last: ${errors.slice(-2).join(' | ')}`);
  }

  private extractContent(data: {
    choices?: Array<{
      finish_reason?: string;
      message?: {
        content?: string | Array<{ type?: string; text?: string }>;
        reasoning?: string;
      };
    }>;
    error?: { message?: string };
  }): string {
    const choice = data.choices?.[0];
    const msg = choice?.message;
    if (!msg) {
      throw new Error(data.error?.message ?? 'No choices in response');
    }

    if (typeof msg.content === 'string' && msg.content.trim()) {
      return msg.content.trim();
    }

    if (Array.isArray(msg.content)) {
      const text = msg.content
        .filter((p) => p.type === 'text' && p.text)
        .map((p) => p.text!)
        .join('\n')
        .trim();
      if (text) return text;
    }

    // Reasoning-модели (nemotron): JSON может быть только в reasoning и только если там есть {
    if (msg.reasoning?.trim()) {
      const r = msg.reasoning.trim();
      if (r.includes('{')) return r;
    }

    throw new Error(
      `Empty response (finish_reason=${choice?.finish_reason ?? '?'}, reasoning-only without JSON)`,
    );
  }

  private async callModel(
    apiKey: string,
    model: string,
    systemPrompt: string,
    userMessage: string,
    jsonMode: boolean,
  ): Promise<string> {
    const apiUrl = this.config.get<string>(
      'OPENROUTER_API_URL',
      'https://openrouter.ai/api/v1/chat/completions',
    );

    const timeoutMs = Number(this.config.get('OPENROUTER_TIMEOUT_MS')) || 90_000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      // Через прокси: с IP хостера Cloudflare отдаёт 403 «Access denied by security policy».
      response = await openRouterFetch(apiUrl, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': this.config.get<string>('OPENROUTER_SITE_URL', 'http://localhost:3000'),
          'X-Title': this.config.get<string>('OPENROUTER_APP_NAME', 'Suvenir AI'),
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
          temperature: 0.35,
          max_tokens: Number(this.config.get('OPENROUTER_MAX_TOKENS')) || 2500,
        }),
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`timeout after ${timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }

    const text = await response.text();

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
    }

    let data: Parameters<OpenrouterLlmProvider['extractContent']>[0];
    try {
      data = safeJsonParse(text, 'OpenRouter LLM') as typeof data;
    } catch {
      throw new Error(`Invalid JSON: ${text.slice(0, 200)}`);
    }

    return this.extractContent(data);
  }
}

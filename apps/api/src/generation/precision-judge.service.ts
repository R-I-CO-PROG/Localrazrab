import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { openRouterFetch } from '../providers/llm/openrouter-proxy.util';
import { safeJsonParse } from '../providers/llm/safe-json-parse.util';
import { JUDGE_PROMPT, parseJudgeResponse, type PrecisionVerdict } from './precision-judge';

@Injectable()
export class PrecisionJudgeService {
  private readonly logger = new Logger(PrecisionJudgeService.name);

  constructor(private readonly config: ConfigService) {}

  isEnabled(): boolean {
    return this.config.get<string>('PRECISION_JUDGE_ENABLED', 'true') === 'true';
  }

  /** Падение судьи не должно ронять генерацию — возвращаем null */
  async judge(sourcePng: Buffer, resultPng: Buffer): Promise<PrecisionVerdict | null> {
    if (!this.isEnabled()) return null;
    const apiKey = this.config.get<string>('OPENROUTER_API_KEY', '').trim();
    if (!apiKey) return null;

    const model = this.config.get<string>('OPENROUTER_MODEL_PRECISION_JUDGE', 'google/gemini-2.5-flash');
    const uri = (b: Buffer) => `data:image/png;base64,${b.toString('base64')}`;

    try {
      const res = await openRouterFetch(
        process.env.OPENROUTER_API_URL?.trim() || 'https://openrouter.ai/api/v1/chat/completions',
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'text', text: JUDGE_PROMPT },
                  { type: 'image_url', image_url: { url: uri(sourcePng) } },
                  { type: 'image_url', image_url: { url: uri(resultPng) } },
                ],
              },
            ],
          }),
          signal: AbortSignal.timeout(60_000),
        },
      );
      if (!res.ok) throw new Error(`judge HTTP ${res.status}`);
      // Судья гоняется на КАЖДЫЙ рендер: сырой res.json() на битом/огромном теле роняет весь
      // API OOM-абортом (try/catch ниже не ловит FATAL). Читаем текстом + режем по размеру.
      const text = await res.text();
      const json = safeJsonParse<{ choices?: Array<{ message?: { content?: string } }> }>(text, 'precision judge');
      return parseJudgeResponse(json.choices?.[0]?.message?.content ?? '');
    } catch (e) {
      this.logger.warn(`Судья недоступен: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AgentDebugTraceFn } from './agent-debug.types';
import { safeJsonParse } from '../providers/llm/safe-json-parse.util';

// VPN-прокси (sing-box на сервере): OpenRouter за Cloudflare режет IP хостера (403), а egress
// через VPN — чистый. Направляем ТОЛЬКО OpenRouter-запросы через прокси (undici dispatcher), без
// релея. undici — транзитивная зависимость (есть на сервере в рантайме): guarded-require.
// ЛЕНИВО и мемоизировано: OPENROUTER_PROXY грузится dotenv/ConfigModule ПОЗЖЕ, чем выполняется
// module-load этого файла, поэтому читаем env при первом fetch, а не на верхнем уровне.
let _orDispatcher: unknown;
let _orDispatcherResolved = false;
function orProxyDispatcher(): unknown {
  if (_orDispatcherResolved) return _orDispatcher;
  _orDispatcherResolved = true;
  const url = process.env.OPENROUTER_PROXY?.trim();
  if (url) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { ProxyAgent } = require('undici');
      _orDispatcher = new ProxyAgent(url);
    } catch {
      /* undici недоступен — работаем без прокси (прямой fetch) */
    }
  }
  return _orDispatcher;
}

export interface AgentChatOptions {
  systemPrompt: string;
  userMessage: string;
  modelEnvKey: string;
  maxTokensEnvKey: string;
  defaultMaxTokens: number;
  agentName?: string;
  trace?: AgentDebugTraceFn;
}

const DEFAULT_FALLBACKS = [
  'qwen/qwen3-coder:free',
  'qwen/qwen3-next-80b-a3b-instruct:free',
  'openai/gpt-oss-120b:free',
  'openai/gpt-oss-20b:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'moonshotai/kimi-k2.6:free',
  'liquid/lfm-2.5-1.2b-instruct:free',
];

function isRateLimited(msg: string): boolean {
  return msg.includes('429') || msg.includes('rate-limited') || msg.includes('rate limit');
}

function isJsonModeError(msg: string): boolean {
  return (
    msg.includes('Upstream error') ||
    msg.includes('unexpected tokens') ||
    msg.includes('response_format') ||
    msg.includes('json_object')
  );
}

function isSkipModel(msg: string): boolean {
  return msg.includes('404') || msg.includes('unavailable') || msg.includes('No endpoints');
}

const DEPRECATED_MODEL_ALIASES: Record<string, string> = {
  'anthropic/claude-3-5-haiku': 'openai/gpt-4o-mini',
  'anthropic/claude-3.5-haiku': 'openai/gpt-4o-mini',
  // qwen-2.5-72b/32b НЕ задеприкейчены (живы на OpenRouter, 200) — алиас на gpt-4o-mini ошибочно
  // ронял КРЕАТИВ с сильной 72B на мелкую модель → однотипные идеи. Убран, чтобы креатив шёл на qwen.
};

const DEFAULT_AGENT_MODELS: Record<string, string> = {
  OPENROUTER_MODEL_IDEATOR: 'openai/gpt-4o-mini',
  OPENROUTER_MODEL_CRITIC: 'openai/gpt-4o-mini',
  OPENROUTER_MODEL_CATALOG_IDEATOR: 'openai/gpt-4o-mini',
};

@Injectable()
export class OpenrouterAgentClient {
  private readonly logger = new Logger(OpenrouterAgentClient.name);

  /** CIRCUIT-BREAKER: при полном отказе сети (WAF-блок IP, upstream down) каждый набор впустую жёг
   *  timeout×модели×концепции (45с×N). Считаем подряд-фейлы; после порога размыкаем цепь на короткое
   *  время — chatJson сразу бросает без сети, набор мгновенно уходит в детерминированный фолбэк.
   *  Один успех сбрасывает счётчик. Значения из env — при нуле брейкер выключен. */
  private consecutiveFullFailures = 0;
  private circuitOpenUntil = 0;

  constructor(private readonly config: ConfigService) {}

  isEnabled(): boolean {
    return (
      this.config.get<string>('OPENROUTER_ENABLED', 'true') === 'true' &&
      Boolean(this.config.get<string>('OPENROUTER_API_KEY', '').trim())
    );
  }

  private breakerThreshold(): number {
    return Number(this.config.get('OPENROUTER_BREAKER_THRESHOLD', 4));
  }

  private breakerCooldownMs(): number {
    return Number(this.config.get('OPENROUTER_BREAKER_COOLDOWN_MS', 60_000));
  }

  private resolveModels(modelEnvKey: string): string[] {
    const configured =
      this.config.get<string>(modelEnvKey) ||
      DEFAULT_AGENT_MODELS[modelEnvKey] ||
      this.config.get<string>('OPENROUTER_MODEL', 'openai/gpt-4o-mini');
    const primary = DEPRECATED_MODEL_ALIASES[configured] ?? configured;
    if (this.config.get<string>('OPENROUTER_SINGLE_MODEL', 'false') === 'true') {
      return [primary];
    }
    const extra = (this.config.get<string>('OPENROUTER_FALLBACK_MODELS', '') || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return [...new Set([primary, ...extra, ...DEFAULT_FALLBACKS])];
  }

  private getApiKey(): string {
    const key = this.config.get<string>('OPENROUTER_API_KEY', '').trim();
    if (!key) throw new Error('OPENROUTER_API_KEY is not configured');
    return key;
  }

  async chatJson(opts: AgentChatOptions): Promise<string> {
    if (!this.isEnabled()) {
      throw new Error('OpenRouter disabled or OPENROUTER_API_KEY missing');
    }

    // CIRCUIT-BREAKER: цепь разомкнута (недавно был шквал полных отказов) — не тратим сеть/таймауты,
    // сразу бросаем → вызывающий уходит в детерминированный фолбэк без 45с ожидания.
    const threshold = this.breakerThreshold();
    if (threshold > 0 && Date.now() < this.circuitOpenUntil) {
      throw new Error('OpenRouter circuit open (recent full failures) — deterministic fallback');
    }

    const apiKey = this.getApiKey();
    const models = this.resolveModels(opts.modelEnvKey);
    const singleModel = this.config.get<string>('OPENROUTER_SINGLE_MODEL', 'false') === 'true';
    const perModelRetries = singleModel
      ? Math.max(1, Number(this.config.get('OPENROUTER_AGENT_RETRIES')) || 2)
      : 1;
    const maxTokens =
      Number(this.config.get(opts.maxTokensEnvKey)) || opts.defaultMaxTokens;
    const apiUrl = this.config.get<string>(
      'OPENROUTER_API_URL',
      'https://openrouter.ai/api/v1/chat/completions',
    );
    const timeoutMs = Number(this.config.get('OPENROUTER_TIMEOUT_MS')) || 90_000;

    const errors: string[] = [];
    let rateLimitHits = 0;
    const rateLimitAbort = Number(this.config.get('OPENROUTER_RATE_LIMIT_ABORT_AFTER', 8));

    for (const model of models) {
      for (let attempt = 1; attempt <= perModelRetries; attempt++) {
        const t0 = Date.now();
        try {
          await opts.trace?.({
            step: 'openrouter_request',
            actor: opts.agentName ?? 'OpenRouter',
            direction: 'out',
            target: apiUrl,
            summary: `POST ${model}${attempt > 1 ? ` (retry ${attempt})` : ''}`,
            request: {
              model,
              max_tokens: maxTokens,
              system: opts.systemPrompt.slice(0, 400),
              user: opts.userMessage.slice(0, 600),
            },
          });

          let content = '';
          let lastCallErr: Error | null = null;
          for (const jsonMode of [true, false] as const) {
            try {
              content = await this.callOnce(apiKey, apiUrl, model, opts, maxTokens, timeoutMs, jsonMode);
              if (content.trim()) break;
            } catch (callErr) {
              const callMsg = callErr instanceof Error ? callErr.message : String(callErr);
              lastCallErr = callErr instanceof Error ? callErr : new Error(callMsg);
              if (jsonMode && isJsonModeError(callMsg)) {
                this.logger.warn(`${model} json_mode failed, retry plain: ${callMsg.slice(0, 80)}`);
                continue;
              }
              throw callErr;
            }
          }
          if (!content.trim()) {
            throw lastCallErr ?? new Error('Empty response');
          }

          await opts.trace?.({
            step: 'openrouter_response',
            actor: opts.agentName ?? 'OpenRouter',
            direction: 'in',
            target: apiUrl,
            summary: `OK ${model}`,
            response: content.slice(0, 2000),
            ms: Date.now() - t0,
          });
          this.logger.log(`${opts.agentName ?? 'Agent'} OpenRouter OK: ${model} (${Date.now() - t0}ms)`);
          this.consecutiveFullFailures = 0; // успех сбрасывает брейкер
          this.circuitOpenUntil = 0;
          return content;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`${model}: ${msg.slice(0, 100)}`);
          await opts.trace?.({
            step: 'openrouter_error',
            actor: opts.agentName ?? 'OpenRouter',
            direction: 'in',
            target: apiUrl,
            summary: msg.slice(0, 200),
            error: msg,
            ms: Date.now() - t0,
          });

          if (isSkipModel(msg)) {
            this.logger.warn(`Skip model ${model}: ${msg.slice(0, 80)}`);
            break;
          }
          if (isRateLimited(msg)) {
            rateLimitHits++;
            this.logger.warn(`${model} rate-limited (${rateLimitHits}/${rateLimitAbort})`);
            if (rateLimitHits >= rateLimitAbort) break;
            if (attempt < perModelRetries) {
              await new Promise((r) => setTimeout(r, 1500 * attempt));
              continue;
            }
            break;
          }
          if (attempt < perModelRetries) {
            await new Promise((r) => setTimeout(r, 1000 * attempt));
            continue;
          }
        }
      }
    }

    // Полный отказ (все модели/ретраи) — наращиваем брейкер; на пороге размыкаем цепь на cooldown.
    if (threshold > 0) {
      this.consecutiveFullFailures++;
      if (this.consecutiveFullFailures >= threshold) {
        this.circuitOpenUntil = Date.now() + this.breakerCooldownMs();
        this.logger.warn(
          `OpenRouter circuit OPEN на ${Math.round(this.breakerCooldownMs() / 1000)}с после ${this.consecutiveFullFailures} полных отказов подряд`,
        );
      }
    }
    throw new Error(
      `OpenRouter недоступен (${errors.length} попыток). ${errors[errors.length - 1] ?? 'unknown'}`,
    );
  }

  private async callOnce(
    apiKey: string,
    apiUrl: string,
    model: string,
    opts: AgentChatOptions,
    maxTokens: number,
    timeoutMs: number,
    jsonMode: boolean,
  ): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const body: Record<string, unknown> = {
        model,
        messages: [
          { role: 'system', content: opts.systemPrompt },
          { role: 'user', content: opts.userMessage },
        ],
        temperature: 0.35,
        max_tokens: maxTokens,
      };
      if (jsonMode) body.response_format = { type: 'json_object' };

      const response = await fetch(apiUrl, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': this.config.get<string>('OPENROUTER_SITE_URL', 'http://localhost:3000'),
          'X-Title': this.config.get<string>('OPENROUTER_APP_NAME', 'Suvenir AI'),
        },
        body: JSON.stringify(body),
        // undici: направить через VPN-прокси, если задан OPENROUTER_PROXY (обходит Cloudflare-блок IP)
        ...((): { dispatcher?: unknown } => {
          const d = orProxyDispatcher();
          return d ? { dispatcher: d } : {};
        })(),
      } as RequestInit & { dispatcher?: unknown });

      const text = await response.text();
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
      }

      const data = safeJsonParse(text, 'OpenRouter agent') as {
        choices?: Array<{ message?: { content?: string }; finish_reason?: string; native_finish_reason?: string }>;
        error?: { message?: string };
      };
      const content = data.choices?.[0]?.message?.content?.trim();
      if (!content) {
        throw new Error(data.error?.message ?? 'Empty OpenRouter response');
      }
      // Обрыв по лимиту токенов: JSON придёт неполным → parseCatalogComposeJson бросит → набор
      // целиком уйдёт в фолбэк (а не частично). Логируем как диагностику: поднять max_tokens.
      const finish = data.choices?.[0]?.finish_reason ?? data.choices?.[0]?.native_finish_reason;
      if (finish === 'length') {
        this.logger.warn(`${model} ответ ОБОРВАН по max_tokens (${maxTokens}) — JSON может быть неполным`);
      }
      return content;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`OpenRouter timeout after ${timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}

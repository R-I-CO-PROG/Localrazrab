"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var OpenrouterAgentClient_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenrouterAgentClient = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const DEFAULT_FALLBACKS = [
    'qwen/qwen3-coder:free',
    'qwen/qwen3-next-80b-a3b-instruct:free',
    'openai/gpt-oss-120b:free',
    'openai/gpt-oss-20b:free',
    'meta-llama/llama-3.3-70b-instruct:free',
    'moonshotai/kimi-k2.6:free',
    'liquid/lfm-2.5-1.2b-instruct:free',
];
function isRateLimited(msg) {
    return msg.includes('429') || msg.includes('rate-limited') || msg.includes('rate limit');
}
function isJsonModeError(msg) {
    return (msg.includes('Upstream error') ||
        msg.includes('unexpected tokens') ||
        msg.includes('response_format') ||
        msg.includes('json_object'));
}
function isSkipModel(msg) {
    return msg.includes('404') || msg.includes('unavailable') || msg.includes('No endpoints');
}
const DEPRECATED_MODEL_ALIASES = {
    'anthropic/claude-3-5-haiku': 'openai/gpt-4o-mini',
    'anthropic/claude-3.5-haiku': 'openai/gpt-4o-mini',
};
let OpenrouterAgentClient = OpenrouterAgentClient_1 = class OpenrouterAgentClient {
    constructor(config) {
        this.config = config;
        this.logger = new common_1.Logger(OpenrouterAgentClient_1.name);
    }
    isEnabled() {
        return (this.config.get('OPENROUTER_ENABLED', 'true') === 'true' &&
            Boolean(this.config.get('OPENROUTER_API_KEY', '').trim()));
    }
    resolveModels(modelEnvKey) {
        const configured = this.config.get(modelEnvKey) ||
            this.config.get('OPENROUTER_MODEL', 'openrouter/free');
        const primary = DEPRECATED_MODEL_ALIASES[configured] ?? configured;
        if (this.config.get('OPENROUTER_SINGLE_MODEL', 'false') === 'true') {
            return [primary];
        }
        const extra = (this.config.get('OPENROUTER_FALLBACK_MODELS', '') || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        return [...new Set([primary, ...extra, ...DEFAULT_FALLBACKS])];
    }
    getApiKey() {
        const key = this.config.get('OPENROUTER_API_KEY', '').trim();
        if (!key)
            throw new Error('OPENROUTER_API_KEY is not configured');
        return key;
    }
    async chatJson(opts) {
        if (!this.isEnabled()) {
            throw new Error('OpenRouter disabled or OPENROUTER_API_KEY missing');
        }
        const apiKey = this.getApiKey();
        const models = this.resolveModels(opts.modelEnvKey);
        const singleModel = this.config.get('OPENROUTER_SINGLE_MODEL', 'false') === 'true';
        const perModelRetries = singleModel
            ? Math.max(1, Number(this.config.get('OPENROUTER_AGENT_RETRIES')) || 2)
            : 1;
        const maxTokens = Number(this.config.get(opts.maxTokensEnvKey)) || opts.defaultMaxTokens;
        const apiUrl = this.config.get('OPENROUTER_API_URL', 'https://openrouter.ai/api/v1/chat/completions');
        const timeoutMs = Number(this.config.get('OPENROUTER_TIMEOUT_MS')) || 90_000;
        const errors = [];
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
                    let lastCallErr = null;
                    for (const jsonMode of [true, false]) {
                        try {
                            content = await this.callOnce(apiKey, apiUrl, model, opts, maxTokens, timeoutMs, jsonMode);
                            if (content.trim())
                                break;
                        }
                        catch (callErr) {
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
                    return content;
                }
                catch (err) {
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
                        if (rateLimitHits >= rateLimitAbort)
                            break;
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
        throw new Error(`OpenRouter недоступен (${errors.length} попыток). ${errors[errors.length - 1] ?? 'unknown'}`);
    }
    async callOnce(apiKey, apiUrl, model, opts, maxTokens, timeoutMs, jsonMode) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const body = {
                model,
                messages: [
                    { role: 'system', content: opts.systemPrompt },
                    { role: 'user', content: opts.userMessage },
                ],
                temperature: 0.35,
                max_tokens: maxTokens,
            };
            if (jsonMode)
                body.response_format = { type: 'json_object' };
            const response = await fetch(apiUrl, {
                method: 'POST',
                signal: controller.signal,
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                    'HTTP-Referer': this.config.get('OPENROUTER_SITE_URL', 'http://localhost:3000'),
                    'X-Title': this.config.get('OPENROUTER_APP_NAME', 'Suvenir AI'),
                },
                body: JSON.stringify(body),
            });
            const text = await response.text();
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
            }
            const data = JSON.parse(text);
            const content = data.choices?.[0]?.message?.content?.trim();
            if (!content) {
                throw new Error(data.error?.message ?? 'Empty OpenRouter response');
            }
            return content;
        }
        catch (err) {
            if (err instanceof Error && err.name === 'AbortError') {
                throw new Error(`OpenRouter timeout after ${timeoutMs}ms`);
            }
            throw err;
        }
        finally {
            clearTimeout(timer);
        }
    }
};
exports.OpenrouterAgentClient = OpenrouterAgentClient;
exports.OpenrouterAgentClient = OpenrouterAgentClient = OpenrouterAgentClient_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], OpenrouterAgentClient);
//# sourceMappingURL=openrouter-agent.client.js.map
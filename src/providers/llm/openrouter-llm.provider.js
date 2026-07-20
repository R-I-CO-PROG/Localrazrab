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
var OpenrouterLlmProvider_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenrouterLlmProvider = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const parse_llm_json_1 = require("./parse-llm-json");
const llm_prompts_1 = require("./llm-prompts");
const respect_user_products_1 = require("./respect-user-products");
const DEFAULT_MODEL = 'openai/gpt-4o-mini';
const DEFAULT_FALLBACKS = [
    'liquid/lfm-2.5-1.2b-instruct:free',
    'nvidia/nemotron-nano-9b-v2:free',
    'meta-llama/llama-3.3-70b-instruct:free',
];
function isSkipModelError(msg) {
    return (msg.includes('HTTP 404') ||
        msg.includes('unavailable for free') ||
        msg.includes('No endpoints found'));
}
function isRateLimited(msg) {
    return msg.includes('429') || msg.includes('rate-limited') || msg.includes('rate limit');
}
let OpenrouterLlmProvider = OpenrouterLlmProvider_1 = class OpenrouterLlmProvider {
    constructor(config) {
        this.config = config;
        this.logger = new common_1.Logger(OpenrouterLlmProvider_1.name);
        this.lastModelUsed = null;
    }
    resolveModels(input) {
        if (input?.briefParseMode) {
            const briefModel = this.config.get('BRIEF_PARSE_MODEL', 'google/gemini-2.5-flash');
            const extra = (this.config.get('OPENROUTER_FALLBACK_MODELS', '') || '')
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean);
            return [...new Set([briefModel, ...extra, ...DEFAULT_FALLBACKS])];
        }
        const primary = this.config.get('OPENROUTER_MODEL', DEFAULT_MODEL);
        if (this.config.get('OPENROUTER_SINGLE_MODEL', 'false') === 'true') {
            return [primary];
        }
        const extra = (this.config.get('OPENROUTER_FALLBACK_MODELS', '') || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        return [...new Set([primary, ...extra, ...DEFAULT_FALLBACKS])];
    }
    async generate(input) {
        const apiKey = this.config.get('OPENROUTER_API_KEY');
        if (!apiKey?.trim()) {
            throw new Error('OPENROUTER_API_KEY is not configured');
        }
        const respectUser = (0, respect_user_products_1.shouldRespectUserProducts)(input);
        const sceneOnly = input.sceneOnly ?? false;
        const userPayload = (0, llm_prompts_1.buildLlmUserPayload)(input, {
            respectUserProducts: respectUser || sceneOnly,
            suggestMode: input.suggestMode,
            productAddMode: input.productAddMode,
            currentSetProducts: input.currentSetProductNames,
        });
        const userMessage = input.briefParseMode
            ? (0, llm_prompts_1.buildLlmUserMessage)({ task: input.userPrompt })
            : (0, llm_prompts_1.buildLlmUserMessage)(userPayload);
        const systemPrompt = (0, llm_prompts_1.resolveLlmSystemPrompt)({
            sceneOnly,
            creativeMode: input.creativeMode,
            suggestMode: input.suggestMode,
            briefParseMode: input.briefParseMode,
            catalogConceptsMode: input.catalogConceptsMode,
            productAddMode: input.productAddMode,
        }, respectUser);
        const models = this.resolveModels(input);
        const maxRetries = Number(this.config.get('OPENROUTER_MAX_RETRIES', 1));
        const rateLimitAbortAfter = Number(this.config.get('OPENROUTER_RATE_LIMIT_ABORT_AFTER', 2));
        const errors = [];
        let rateLimitHits = 0;
        for (const model of models) {
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    const started = Date.now();
                    this.logger.log(`OpenRouter → ${model} (${attempt}/${maxRetries})…`);
                    let content = '';
                    for (const jsonMode of [true, false]) {
                        try {
                            content = await this.callModel(apiKey, model, systemPrompt, userMessage, jsonMode);
                            if (content.trim())
                                break;
                        }
                        catch (callErr) {
                            const callMsg = callErr instanceof Error ? callErr.message : String(callErr);
                            if (jsonMode &&
                                (callMsg.includes('Upstream error') ||
                                    callMsg.includes('unexpected tokens') ||
                                    callMsg.includes('response_format'))) {
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
                    return (0, parse_llm_json_1.buildLlmOutputFromContent)(content, input);
                }
                catch (err) {
                    const msg = err instanceof Error ? err.message : String(err);
                    errors.push(`${model}: ${msg.slice(0, 120)}`);
                    if (isSkipModelError(msg)) {
                        this.logger.warn(`Skip model ${model}: ${msg.slice(0, 80)}`);
                        break;
                    }
                    if (isRateLimited(msg)) {
                        rateLimitHits++;
                        this.logger.warn(`${model} rate-limited (${rateLimitHits}/${rateLimitAbortAfter}) → skip`);
                        if (rateLimitHits >= rateLimitAbortAfter) {
                            throw new Error(`OpenRouter free tier rate-limited (${rateLimitHits} models) — use stub fallback`);
                        }
                        break;
                    }
                    if ((msg.includes('Empty') || msg.includes('timeout')) &&
                        attempt < maxRetries) {
                        await new Promise((r) => setTimeout(r, 1500 * attempt));
                        continue;
                    }
                    break;
                }
            }
        }
        throw new Error(`OpenRouter failed (${errors.length} tries). Last: ${errors.slice(-2).join(' | ')}`);
    }
    extractContent(data) {
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
                .map((p) => p.text)
                .join('\n')
                .trim();
            if (text)
                return text;
        }
        if (msg.reasoning?.trim()) {
            const r = msg.reasoning.trim();
            if (r.includes('{'))
                return r;
        }
        throw new Error(`Empty response (finish_reason=${choice?.finish_reason ?? '?'}, reasoning-only without JSON)`);
    }
    async callModel(apiKey, model, systemPrompt, userMessage, jsonMode) {
        const apiUrl = this.config.get('OPENROUTER_API_URL', 'https://openrouter.ai/api/v1/chat/completions');
        const timeoutMs = Number(this.config.get('OPENROUTER_TIMEOUT_MS')) || 90_000;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        let response;
        try {
            response = await fetch(apiUrl, {
                method: 'POST',
                signal: controller.signal,
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                    'HTTP-Referer': this.config.get('OPENROUTER_SITE_URL', 'http://localhost:3000'),
                    'X-Title': this.config.get('OPENROUTER_APP_NAME', 'Suvenir AI'),
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
        }
        catch (err) {
            if (err instanceof Error && err.name === 'AbortError') {
                throw new Error(`timeout after ${timeoutMs}ms`);
            }
            throw err;
        }
        finally {
            clearTimeout(timer);
        }
        const text = await response.text();
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
        }
        let data;
        try {
            data = JSON.parse(text);
        }
        catch {
            throw new Error(`Invalid JSON: ${text.slice(0, 200)}`);
        }
        return this.extractContent(data);
    }
};
exports.OpenrouterLlmProvider = OpenrouterLlmProvider;
exports.OpenrouterLlmProvider = OpenrouterLlmProvider = OpenrouterLlmProvider_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], OpenrouterLlmProvider);
//# sourceMappingURL=openrouter-llm.provider.js.map
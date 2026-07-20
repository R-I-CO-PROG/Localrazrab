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
var GeminiLlmProvider_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeminiLlmProvider = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const parse_llm_json_1 = require("./parse-llm-json");
const llm_prompts_1 = require("./llm-prompts");
const respect_user_products_1 = require("./respect-user-products");
let GeminiLlmProvider = GeminiLlmProvider_1 = class GeminiLlmProvider {
    constructor(config) {
        this.config = config;
        this.logger = new common_1.Logger(GeminiLlmProvider_1.name);
    }
    async generate(input) {
        const apiKey = this.config.get('GEMINI_API_KEY');
        if (!apiKey) {
            throw new Error('GEMINI_API_KEY is not configured. Get a free key at https://aistudio.google.com/apikey');
        }
        const model = input.briefParseMode
            ? this.config.get('BRIEF_PARSE_MODEL', 'google/gemini-2.5-flash')
            : this.config.get('GEMINI_MODEL', 'gemini-2.5-flash-lite');
        const baseUrl = this.config.get('GEMINI_API_URL', 'https://generativelanguage.googleapis.com/v1beta');
        const url = `${baseUrl}/models/${model}:generateContent?key=${apiKey}`;
        const respectUser = (0, respect_user_products_1.shouldRespectUserProducts)(input);
        const sceneOnly = input.sceneOnly ?? false;
        const userPayload = (0, llm_prompts_1.buildLlmUserPayload)(input, {
            respectUserProducts: respectUser || sceneOnly,
        });
        const userMessage = input.briefParseMode
            ? (0, llm_prompts_1.buildLlmUserMessage)({ task: input.userPrompt })
            : (0, llm_prompts_1.buildLlmUserMessage)(userPayload);
        const systemPrompt = (0, llm_prompts_1.resolveLlmSystemPrompt)({
            sceneOnly,
            creativeMode: input.creativeMode,
            suggestMode: input.suggestMode,
            briefParseMode: input.briefParseMode,
        }, respectUser);
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
                throw new Error('Gemini заблокирован в вашем регионе. Используйте LLM_PROVIDER=openrouter и ключ с https://openrouter.ai/keys');
            }
            throw new Error(`Gemini API error: ${response.status}`);
        }
        const data = (await response.json());
        const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!content) {
            throw new Error(data.error?.message ?? 'Empty Gemini response');
        }
        return (0, parse_llm_json_1.buildLlmOutputFromContent)(content, input);
    }
};
exports.GeminiLlmProvider = GeminiLlmProvider;
exports.GeminiLlmProvider = GeminiLlmProvider = GeminiLlmProvider_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], GeminiLlmProvider);
//# sourceMappingURL=gemini-llm.provider.js.map
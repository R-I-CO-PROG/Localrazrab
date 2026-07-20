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
var DeepseekLlmProvider_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeepseekLlmProvider = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const parse_llm_json_1 = require("./parse-llm-json");
const llm_prompts_1 = require("./llm-prompts");
const respect_user_products_1 = require("./respect-user-products");
let DeepseekLlmProvider = DeepseekLlmProvider_1 = class DeepseekLlmProvider {
    constructor(config) {
        this.config = config;
        this.logger = new common_1.Logger(DeepseekLlmProvider_1.name);
    }
    async generate(input) {
        const apiKey = this.config.get('DEEPSEEK_API_KEY');
        const apiUrl = this.config.get('DEEPSEEK_API_URL', 'https://api.deepseek.com/v1/chat/completions');
        if (!apiKey) {
            throw new Error('DEEPSEEK_API_KEY is not configured');
        }
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
        const data = (await response.json());
        const content = data.choices[0]?.message?.content;
        if (!content)
            throw new Error('Empty DeepSeek response');
        return (0, parse_llm_json_1.buildLlmOutputFromContent)(content, input);
    }
};
exports.DeepseekLlmProvider = DeepseekLlmProvider;
exports.DeepseekLlmProvider = DeepseekLlmProvider = DeepseekLlmProvider_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], DeepseekLlmProvider);
//# sourceMappingURL=deepseek-llm.provider.js.map
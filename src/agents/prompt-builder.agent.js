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
var PromptBuilderAgent_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PromptBuilderAgent = void 0;
const common_1 = require("@nestjs/common");
const openrouter_agent_client_1 = require("./openrouter-agent.client");
const json_repair_util_1 = require("./json-repair.util");
const prompts_1 = require("./prompts");
let PromptBuilderAgent = PromptBuilderAgent_1 = class PromptBuilderAgent {
    constructor(openrouter) {
        this.openrouter = openrouter;
        this.logger = new common_1.Logger(PromptBuilderAgent_1.name);
    }
    async buildPrompt(input) {
        if (!this.openrouter.isEnabled()) {
            throw new Error('OpenRouter отключён — невозможно собрать промпт для SeeDream');
        }
        const content = await this.openrouter.chatJson({
            systemPrompt: prompts_1.SYSTEM_PROMPT_PROMPTBUILDER_CREATIVE,
            userMessage: JSON.stringify({
                brief: {
                    task: input.userQuery,
                    category: input.category,
                    budget: { min: input.budgetMin, max: input.budgetMax },
                    quantity: input.quantity,
                    colors: input.colors,
                    notes: input.notes,
                    hasLogo: input.hasLogo,
                    mode: 'creative',
                },
                chosenConcept: input.chosenIdea,
            }),
            modelEnvKey: 'OPENROUTER_MODEL_PROMPT',
            maxTokensEnvKey: 'OPENROUTER_MAX_TOKENS_PROMPT',
            defaultMaxTokens: 800,
            agentName: 'PromptBuilderAgent',
            trace: input.trace,
        });
        return this.normalize((0, json_repair_util_1.parseAgentJson)(content), input);
    }
    normalize(parsed, input) {
        const title = parsed.chosenIdeaTitle || ('title' in input.chosenIdea ? input.chosenIdea.title : 'Concept');
        const imagePrompt = parsed.imagePrompt?.trim().slice(0, 1200);
        if (!imagePrompt) {
            throw new Error('PromptBuilder вернул пустой imagePrompt');
        }
        return {
            chosenIdeaTitle: title,
            imagePrompt,
            negativePrompt: parsed.negativePrompt?.slice(0, 500) ||
                'taxi, street, car, vehicle, city traffic, office scene, people, watermark, blurry, cartoon',
            style: parsed.style || 'cinematic photo',
            background: parsed.background || 'describe scene',
            loopSafe: Boolean(parsed.loopSafe),
        };
    }
};
exports.PromptBuilderAgent = PromptBuilderAgent;
exports.PromptBuilderAgent = PromptBuilderAgent = PromptBuilderAgent_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [openrouter_agent_client_1.OpenrouterAgentClient])
], PromptBuilderAgent);
//# sourceMappingURL=prompt-builder.agent.js.map
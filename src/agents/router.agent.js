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
var RouterAgent_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RouterAgent = void 0;
const common_1 = require("@nestjs/common");
const openrouter_agent_client_1 = require("./openrouter-agent.client");
const json_repair_util_1 = require("./json-repair.util");
const prompts_1 = require("./prompts");
const DIRECT_KEYWORDS = [
    'ручка',
    'кружка',
    'футболка',
    'худи',
    'блокнот',
    'pen',
    'mug',
    'tshirt',
    'notebook',
    'cap',
    'кепка',
];
const IDEATION_KEYWORDS = [
    'набор',
    'welcome',
    'pack',
    'идеи',
    'идея',
    'сотрудник',
    'конференц',
    'партнёр',
    'партнер',
    'merch',
    'мерч',
    'gift',
    'подар',
];
let RouterAgent = RouterAgent_1 = class RouterAgent {
    constructor(openrouter) {
        this.openrouter = openrouter;
        this.logger = new common_1.Logger(RouterAgent_1.name);
    }
    async route(input) {
        if (this.openrouter.isEnabled()) {
            try {
                const content = await this.openrouter.chatJson({
                    systemPrompt: prompts_1.SYSTEM_PROMPT_ROUTER,
                    userMessage: JSON.stringify(input),
                    modelEnvKey: 'OPENROUTER_MODEL_ROUTER',
                    maxTokensEnvKey: 'OPENROUTER_MAX_TOKENS_ROUTER',
                    defaultMaxTokens: 400,
                    agentName: 'RouterAgent',
                    trace: input.trace,
                });
                const parsed = (0, json_repair_util_1.parseAgentJson)(content);
                return this.normalize(parsed, input.userQuery);
            }
            catch (err) {
                this.logger.warn(`Router LLM fallback: ${err instanceof Error ? err.message : err}`);
            }
        }
        const result = this.ruleBasedRoute(input.userQuery);
        await input.trace?.({
            step: 'router_fallback',
            actor: 'RouterAgent',
            direction: 'internal',
            summary: 'Rule-based route',
            response: result,
        });
        return result;
    }
    ruleBasedRoute(userQuery) {
        const q = userQuery.trim().toLowerCase();
        const words = q.split(/\s+/).filter(Boolean);
        const hasIdeation = IDEATION_KEYWORDS.some((k) => q.includes(k));
        const hasDirectItem = DIRECT_KEYWORDS.some((k) => q.includes(k));
        const shortQuery = words.length <= 8;
        let route = 'IDEATION_PIPELINE';
        let confidence = 0.55;
        let reason = 'Broad or ambiguous query';
        if (hasIdeation) {
            route = 'IDEATION_PIPELINE';
            confidence = 0.85;
            reason = 'Pack/concept keywords detected';
        }
        else if (shortQuery && hasDirectItem) {
            route = 'DIRECT_PRODUCT';
            confidence = 0.82;
            reason = 'Short query with concrete product';
        }
        if (confidence < 0.6) {
            route = 'IDEATION_PIPELINE';
        }
        return {
            route,
            confidence,
            reason,
            directProductQuery: {
                keywords: words.filter((w) => w.length > 2),
                colors: this.extractColors(q),
                categoryHints: [],
                mustInclude: [],
                mustNotInclude: [],
            },
        };
    }
    extractColors(q) {
        const map = {
            красн: 'red',
            чёрн: 'black',
            черн: 'black',
            бел: 'white',
            син: 'blue',
            зел: 'green',
            фиол: 'purple',
        };
        return Object.entries(map)
            .filter(([k]) => q.includes(k))
            .map(([, v]) => v);
    }
    normalize(parsed, userQuery) {
        const fallback = this.ruleBasedRoute(userQuery);
        const confidence = Number(parsed.confidence) || fallback.confidence;
        let route = parsed.route === 'DIRECT_PRODUCT' ? 'DIRECT_PRODUCT' : 'IDEATION_PIPELINE';
        if (confidence < 0.6)
            route = 'IDEATION_PIPELINE';
        return {
            route,
            confidence,
            reason: parsed.reason?.slice(0, 200) || fallback.reason,
            directProductQuery: {
                keywords: parsed.directProductQuery?.keywords?.slice(0, 12) ?? fallback.directProductQuery.keywords,
                colors: parsed.directProductQuery?.colors?.slice(0, 6) ?? [],
                categoryHints: parsed.directProductQuery?.categoryHints?.slice(0, 6) ?? [],
                mustInclude: parsed.directProductQuery?.mustInclude?.slice(0, 6) ?? [],
                mustNotInclude: parsed.directProductQuery?.mustNotInclude?.slice(0, 6) ?? [],
            },
        };
    }
};
exports.RouterAgent = RouterAgent;
exports.RouterAgent = RouterAgent = RouterAgent_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [openrouter_agent_client_1.OpenrouterAgentClient])
], RouterAgent);
//# sourceMappingURL=router.agent.js.map
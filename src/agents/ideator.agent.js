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
var IdeatorAgent_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.IdeatorAgent = void 0;
const common_1 = require("@nestjs/common");
const openrouter_agent_client_1 = require("./openrouter-agent.client");
const json_repair_util_1 = require("./json-repair.util");
const prompts_1 = require("./prompts");
const agent_constants_1 = require("./agent.constants");
const brief_context_util_1 = require("./brief-context.util");
const contracts_1 = require("./contracts");
const brief_realism_util_1 = require("./brief-realism.util");
const creative_merch_visual_util_1 = require("../generation/creative-merch-visual.util");
let IdeatorAgent = IdeatorAgent_1 = class IdeatorAgent {
    constructor(openrouter) {
        this.openrouter = openrouter;
        this.logger = new common_1.Logger(IdeatorAgent_1.name);
    }
    async generateIdeas(input) {
        if (!this.openrouter.isEnabled()) {
            throw new Error('OpenRouter отключён — задайте OPENROUTER_API_KEY и OPENROUTER_ENABLED=true');
        }
        const brief = (0, brief_context_util_1.buildAgentBriefPayload)(input);
        let allIdeas = [];
        let lastParseErr = null;
        for (let attempt = 1; attempt <= 4; attempt++) {
            const isTopUp = allIdeas.length > 0 && allIdeas.length < agent_constants_1.IDEATOR_MIN_IDEAS;
            const need = agent_constants_1.IDEATOR_TARGET_IDEAS - allIdeas.length;
            const userMessage = isTopUp
                ? JSON.stringify({
                    ...brief,
                    mode: 'creative',
                    task: `Add exactly ${Math.min(need, 12)} NEW merch gift-set ideas with 3-5 physical products each. Do not repeat existing titles.`,
                    existingTitles: allIdeas.map((i) => i.title),
                    count: Math.min(need, 12),
                })
                : JSON.stringify({
                    ...brief,
                    mode: 'creative',
                    task: `Generate exactly ${agent_constants_1.IDEATOR_TARGET_IDEAS} distinct corporate MERCH GIFT SET ideas. Each idea MUST include items[3-5] with productType + notes (specific product design, creative twists welcome). Industry from brief = audience/mood ONLY — do NOT propose street photos, fleets, or vehicles as the deliverable.`,
                });
            const content = await this.openrouter.chatJson({
                systemPrompt: isTopUp ? prompts_1.SYSTEM_PROMPT_IDEATOR_MORE : prompts_1.SYSTEM_PROMPT_IDEATOR_CREATIVE,
                userMessage,
                modelEnvKey: 'OPENROUTER_MODEL_IDEATOR',
                maxTokensEnvKey: 'OPENROUTER_MAX_TOKENS_IDEATOR',
                defaultMaxTokens: 6500,
                agentName: isTopUp ? 'IdeatorAgent(topup)' : 'IdeatorAgent',
                trace: input.trace,
            });
            try {
                const batch = this.normalize((0, json_repair_util_1.parseIdeatorOutput)(content), input);
                allIdeas = this.mergeUniqueIdeas(allIdeas, batch.ideas);
                this.logger.log(`Ideator batch ${attempt}: +${batch.ideas.length} → ${allIdeas.length} total`);
                if (allIdeas.length >= agent_constants_1.IDEATOR_MIN_IDEAS) {
                    this.logger.log(`Ideator OK: ${allIdeas.length} concepts`);
                    return {
                        ideas: allIdeas.slice(0, agent_constants_1.IDEATOR_MAX_IDEAS),
                        usedFallback: false,
                    };
                }
            }
            catch (err) {
                lastParseErr = err instanceof Error ? err : new Error(String(err));
                this.logger.warn(`Ideator parse attempt ${attempt}: ${lastParseErr.message.slice(0, 140)}`);
            }
        }
        if (allIdeas.length >= agent_constants_1.IDEATOR_MIN_IDEAS) {
            return { ideas: allIdeas.slice(0, agent_constants_1.IDEATOR_MAX_IDEAS), usedFallback: false };
        }
        const softMin = Math.max(agent_constants_1.IDEATOR_SOFT_MIN_IDEAS, agent_constants_1.CRITIC_TOP_N + 2);
        if (allIdeas.length >= softMin) {
            this.logger.warn(`Ideator soft OK: ${allIdeas.length}/${agent_constants_1.IDEATOR_MIN_IDEAS} (достаточно для Critic)`);
            return { ideas: allIdeas.slice(0, agent_constants_1.IDEATOR_MAX_IDEAS), usedFallback: false };
        }
        throw (lastParseErr ??
            new Error(`Ideator: недостаточно идей (${allIdeas.length}/${agent_constants_1.IDEATOR_MIN_IDEAS})`));
    }
    mergeUniqueIdeas(existing, incoming) {
        const seen = new Set(existing.map((i) => this.normTitle(i.title)));
        const merged = [...existing];
        for (const idea of incoming) {
            const key = this.normTitle(idea.title);
            if (!key || seen.has(key))
                continue;
            seen.add(key);
            merged.push(idea);
        }
        return merged;
    }
    normTitle(title) {
        return title.trim().toLowerCase().replace(/\s+/g, ' ');
    }
    normalize(output, input) {
        const allowGimmick = (0, brief_realism_util_1.briefAllowsFuturism)(input.userQuery);
        const ideas = (output.ideas ?? [])
            .filter((idea) => idea.title && idea.description)
            .filter((idea) => !this.isBlacklisted(`${idea.title} ${idea.description} ${idea.hook ?? ''}`))
            .filter((idea) => {
            if (allowGimmick)
                return true;
            const blob = `${idea.title} ${idea.description} ${idea.hook ?? ''}`;
            return (0, brief_realism_util_1.gimmickPenalty)(blob, input.userQuery) < 36;
        })
            .map((idea) => ({
            title: idea.title?.slice(0, 80) || 'Концепция',
            hook: idea.hook?.slice(0, 120) || undefined,
            description: idea.description?.slice(0, 280) || '',
            items: (0, creative_merch_visual_util_1.mapProductRolesToItems)(idea)
                .map((i) => ({
                productType: String(i.productType).slice(0, 40),
                notes: i.notes?.slice(0, 120),
                priority: i.priority === 'must' ? 'must' : 'nice',
            })),
            styleTags: (idea.styleTags ?? []).slice(0, 3),
            colorPalette: (idea.colorPalette ?? input.colors ?? []).slice(0, 5),
            whyItFits: idea.whyItFits?.slice(0, 160) || '',
        }));
        return { ideas };
    }
    isBlacklisted(text) {
        const t = text.toLowerCase();
        return contracts_1.AGENT_BLACKLIST.some((b) => t.includes(b));
    }
};
exports.IdeatorAgent = IdeatorAgent;
exports.IdeatorAgent = IdeatorAgent = IdeatorAgent_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [openrouter_agent_client_1.OpenrouterAgentClient])
], IdeatorAgent);
//# sourceMappingURL=ideator.agent.js.map
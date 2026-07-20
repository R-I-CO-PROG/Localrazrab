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
var CriticAgent_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CriticAgent = void 0;
const common_1 = require("@nestjs/common");
const openrouter_agent_client_1 = require("./openrouter-agent.client");
const json_repair_util_1 = require("./json-repair.util");
const prompts_1 = require("./prompts");
const agent_constants_1 = require("./agent.constants");
const brief_context_util_1 = require("./brief-context.util");
const brief_realism_util_1 = require("./brief-realism.util");
let CriticAgent = CriticAgent_1 = class CriticAgent {
    constructor(openrouter) {
        this.openrouter = openrouter;
        this.logger = new common_1.Logger(CriticAgent_1.name);
    }
    async pickTop5(ideas, brief, trace) {
        if (!this.openrouter.isEnabled()) {
            throw new Error('OpenRouter отключён — задайте OPENROUTER_API_KEY');
        }
        if (ideas.length < agent_constants_1.CRITIC_TOP_N) {
            throw new Error(`Critic: мало идей от Ideator (${ideas.length})`);
        }
        const payload = {
            ...(0, brief_context_util_1.buildAgentBriefPayload)(brief),
            mode: 'creative',
            candidateCount: ideas.length,
            ideas: ideas.map(brief_context_util_1.compactIdeaForCritic),
            task: (0, brief_realism_util_1.briefAllowsFuturism)(brief.userQuery)
                ? `Select exactly ${agent_constants_1.CRITIC_TOP_N} best ideas for this brief.`
                : `Select exactly ${agent_constants_1.CRITIC_TOP_N} best ideas. Prefer realistic real-world expansion of the brief subject; reject gimmick drones/gadgets/tubes unless they match the brief.`,
        };
        const content = await this.openrouter.chatJson({
            systemPrompt: prompts_1.SYSTEM_PROMPT_CRITIC_CREATIVE,
            userMessage: JSON.stringify(payload),
            modelEnvKey: 'OPENROUTER_MODEL_CRITIC',
            maxTokensEnvKey: 'OPENROUTER_MAX_TOKENS_CRITIC',
            defaultMaxTokens: 3200,
            agentName: 'CriticAgent',
            trace,
        });
        const parsed = (0, json_repair_util_1.parseCriticOutput)(content);
        const normalized = this.normalize(parsed, ideas, brief);
        if (normalized.topIdeas.length < agent_constants_1.CRITIC_TOP_N) {
            this.logger.warn(`Critic picked ${normalized.topIdeas.length}/${agent_constants_1.CRITIC_TOP_N} — supplementing from Ideator pool`);
            return this.supplementToFive(normalized, ideas, brief);
        }
        this.logger.log(`Critic OK: top ${agent_constants_1.CRITIC_TOP_N} from ${ideas.length} candidates`);
        return normalized;
    }
    normalize(parsed, ideas, brief) {
        const byTitle = new Map(ideas.map((i) => [i.title, i]));
        const forbidden = (brief.forbiddenItems ?? []).map((s) => s.toLowerCase());
        const top = (parsed.topIdeas ?? [])
            .map((t) => {
            const full = byTitle.get(t.title);
            const blob = `${t.title} ${t.conceptSummary ?? ''} ${full?.description ?? ''} ${full?.hook ?? ''}`;
            const fit = (0, brief_realism_util_1.adjustedBriefFitScore)(Number(t.briefFitScore ?? t.score) || 0, blob, brief.userQuery);
            return {
                ...t,
                briefFitScore: fit,
                score: fit,
            };
        })
            .filter((t) => byTitle.has(t.title))
            .filter((t) => !this.violatesForbidden(t, forbidden))
            .sort((a, b) => (b.briefFitScore ?? b.score) - (a.briefFitScore ?? a.score))
            .slice(0, agent_constants_1.CRITIC_TOP_N)
            .map((t, idx) => {
            const full = byTitle.get(t.title);
            return {
                title: t.title,
                score: Number(t.briefFitScore ?? t.score) || 85 - idx * 2,
                briefFitScore: Number(t.briefFitScore ?? t.score) || 85 - idx * 2,
                conceptSummary: (t.conceptSummary?.trim() ||
                    [full.hook, full.description, full.whyItFits].filter(Boolean).join(' ')).slice(0, 500),
                reasons: (t.reasons ?? []).slice(0, 4).length
                    ? (t.reasons ?? []).slice(0, 4)
                    : [full.whyItFits || 'Соответствует брифу клиента'],
                risks: (t.risks ?? []).slice(0, 3).filter((r) => !/каталог|наличи|sku|склад/i.test(r)),
                suggestedEdits: (t.suggestedEdits ?? []).slice(0, 3),
            };
        });
        return { topIdeas: top };
    }
    violatesForbidden(top, forbidden) {
        if (!forbidden.length)
            return false;
        const blob = `${top.title} ${top.conceptSummary ?? ''}`.toLowerCase();
        return forbidden.some((f) => f.length > 2 && blob.includes(f));
    }
    supplementToFive(parsed, ideas, brief) {
        const picked = new Set(parsed.topIdeas.map((t) => t.title));
        const rest = ideas
            .filter((i) => !picked.has(i.title))
            .map((idea) => {
            const blob = `${idea.title} ${idea.description} ${idea.hook ?? ''}`;
            return {
                idea,
                score: (0, brief_realism_util_1.adjustedBriefFitScore)(70, blob, brief.userQuery),
            };
        })
            .sort((a, b) => b.score - a.score);
        const top = [...parsed.topIdeas];
        for (const { idea, score } of rest) {
            if (top.length >= agent_constants_1.CRITIC_TOP_N)
                break;
            top.push({
                title: idea.title,
                score,
                briefFitScore: score,
                conceptSummary: [idea.hook, idea.description, idea.whyItFits].filter(Boolean).join(' ').slice(0, 500),
                reasons: [idea.whyItFits || 'Резервный отбор из пула Ideator'],
                risks: [],
                suggestedEdits: [],
            });
        }
        return { topIdeas: top.slice(0, agent_constants_1.CRITIC_TOP_N) };
    }
};
exports.CriticAgent = CriticAgent;
exports.CriticAgent = CriticAgent = CriticAgent_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [openrouter_agent_client_1.OpenrouterAgentClient])
], CriticAgent);
//# sourceMappingURL=critic.agent.js.map
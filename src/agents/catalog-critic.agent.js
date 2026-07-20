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
var CatalogCriticAgent_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CatalogCriticAgent = void 0;
const common_1 = require("@nestjs/common");
const openrouter_agent_client_1 = require("./openrouter-agent.client");
const json_repair_util_1 = require("./json-repair.util");
const prompts_1 = require("./prompts");
const agent_constants_1 = require("./agent.constants");
const brief_context_util_1 = require("./brief-context.util");
const catalog_concept_diversity_util_1 = require("../providers/llm/catalog-concept-diversity.util");
let CatalogCriticAgent = CatalogCriticAgent_1 = class CatalogCriticAgent {
    constructor(openrouter) {
        this.openrouter = openrouter;
        this.logger = new common_1.Logger(CatalogCriticAgent_1.name);
    }
    async pickTop5(ideas, brief, trace) {
        if (!this.openrouter.isEnabled()) {
            throw new Error('OpenRouter отключён — задайте OPENROUTER_API_KEY');
        }
        if (ideas.length < agent_constants_1.CRITIC_TOP_N) {
            throw new Error(`CatalogCritic: мало идей от Ideator (${ideas.length})`);
        }
        const payload = {
            ...(0, brief_context_util_1.buildAgentBriefPayload)(brief),
            mode: 'catalog',
            desired_item_count: brief.desiredItemCount,
            budget_per_set: brief.budgetPerSet,
            mandatory_types_from_brief: brief.mandatoryTypes,
            brandColors: brief.colors ?? [],
            colorRequirement: brief.colors?.length ?
                'Each set must work with brandColors — prefer apparel/headwear in those colors; note color in productSlots.notes when relevant.'
                : null,
            candidateCount: ideas.length,
            ideas: ideas.map((idea) => ({
                title: idea.title,
                composition: idea.composition,
                style: idea.style,
                themeAxis: idea.themeAxis,
                productSlots: idea.productSlots,
                whyItFits: idea.whyItFits,
            })),
            task: `Select exactly ${agent_constants_1.CRITIC_TOP_N} best gift sets for this client brief. ` +
                'Prioritize literal brief fit — what the client explicitly asked for.',
        };
        const content = await this.openrouter.chatJson({
            systemPrompt: prompts_1.SYSTEM_PROMPT_CRITIC_CATALOG,
            userMessage: JSON.stringify(payload),
            modelEnvKey: 'OPENROUTER_MODEL_CATALOG_CRITIC',
            maxTokensEnvKey: 'OPENROUTER_MAX_TOKENS_CATALOG_CRITIC',
            defaultMaxTokens: 3200,
            agentName: 'CatalogCriticAgent',
            trace,
        });
        const parsed = (0, json_repair_util_1.parseCriticOutput)(content);
        const normalized = this.normalize(parsed, ideas, brief);
        if (normalized.topIdeas.length < agent_constants_1.CRITIC_TOP_N) {
            this.logger.warn(`CatalogCritic picked ${normalized.topIdeas.length}/${agent_constants_1.CRITIC_TOP_N} — supplementing`);
            return this.supplementToFive(normalized, ideas, brief);
        }
        this.logger.log(`CatalogCritic OK: top ${agent_constants_1.CRITIC_TOP_N} from ${ideas.length} candidates`);
        return normalized;
    }
    normalize(parsed, ideas, brief) {
        const byTitle = new Map(ideas.map((i) => [i.title, i]));
        const forbidden = (brief.forbiddenItems ?? []).map((s) => s.toLowerCase());
        const scored = (parsed.topIdeas ?? [])
            .filter((t) => byTitle.has(t.title))
            .filter((t) => !this.violatesForbidden(t, forbidden))
            .map((t) => {
            const full = byTitle.get(t.title);
            const fit = Number(t.briefFitScore ?? t.score) || 80;
            return {
                ...t,
                briefFitScore: fit,
                score: fit,
                conceptSummary: t.conceptSummary?.trim() ||
                    [full.composition, full.whyItFits].filter(Boolean).join(' ').slice(0, 500),
            };
        })
            .sort((a, b) => (b.briefFitScore ?? b.score) - (a.briefFitScore ?? a.score));
        const diverse = (0, catalog_concept_diversity_util_1.pickDiverseCatalogIdeas)(scored, byTitle, agent_constants_1.CRITIC_TOP_N);
        const top = diverse
            .slice(0, agent_constants_1.CRITIC_TOP_N)
            .map((t, idx) => {
            const full = byTitle.get(t.title);
            return {
                title: t.title,
                score: Number(t.briefFitScore ?? t.score) || 85 - idx * 2,
                briefFitScore: Number(t.briefFitScore ?? t.score) || 85 - idx * 2,
                conceptSummary: (t.conceptSummary ?? full.composition).slice(0, 500),
                reasons: (t.reasons ?? []).slice(0, 4).length
                    ? (t.reasons ?? []).slice(0, 4)
                    : [full.whyItFits || 'Соответствует брифу клиента'],
                risks: (t.risks ?? []).slice(0, 3),
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
        const byTitle = new Map(ideas.map((i) => [i.title, i]));
        const ranked = ideas
            .filter((i) => !picked.has(i.title))
            .map((idea) => ({
            title: idea.title,
            score: 70,
            briefFitScore: 70,
            conceptSummary: [idea.composition, idea.whyItFits].filter(Boolean).join(' ').slice(0, 500),
            reasons: [idea.whyItFits || 'Резервный отбор из пула Ideator'],
            risks: [],
            suggestedEdits: [],
        }));
        const diverse = (0, catalog_concept_diversity_util_1.pickDiverseCatalogIdeas)(ranked, byTitle, agent_constants_1.CRITIC_TOP_N - parsed.topIdeas.length);
        const top = [...parsed.topIdeas];
        for (const item of diverse) {
            if (top.length >= agent_constants_1.CRITIC_TOP_N)
                break;
            top.push({
                title: item.title,
                score: item.score,
                briefFitScore: item.briefFitScore,
                conceptSummary: item.conceptSummary,
                reasons: item.reasons,
                risks: item.risks,
                suggestedEdits: item.suggestedEdits,
            });
        }
        return { topIdeas: top.slice(0, agent_constants_1.CRITIC_TOP_N) };
    }
};
exports.CatalogCriticAgent = CatalogCriticAgent;
exports.CatalogCriticAgent = CatalogCriticAgent = CatalogCriticAgent_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [openrouter_agent_client_1.OpenrouterAgentClient])
], CatalogCriticAgent);
//# sourceMappingURL=catalog-critic.agent.js.map
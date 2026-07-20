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
var CatalogIdeatorAgent_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CatalogIdeatorAgent = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const openrouter_agent_client_1 = require("./openrouter-agent.client");
const json_repair_util_1 = require("./json-repair.util");
const prompts_1 = require("./prompts");
const agent_constants_1 = require("./agent.constants");
const brief_context_util_1 = require("./brief-context.util");
const previous_generation_util_1 = require("./previous-generation.util");
const concept_diversity_util_1 = require("../providers/llm/concept-diversity.util");
const catalog_local_ideator_util_1 = require("../providers/llm/catalog-local-ideator.util");
const promise_timeout_util_1 = require("../common/promise-timeout.util");
const named_positions_util_1 = require("../requests/named-positions.util");
const DRINKWARE_FAMILY = 'drinkware';
const HEADWEAR_FAMILY = 'headwear';
const CARRY_FAMILY = 'carry';
const SLOT_ARCHETYPES = [
    ['tshirt', 'cap', 'sunglasses'],
    ['hoodie', 'bottle', 'notebook'],
    ['thermos', 'mug', 'pen'],
    ['powerbank', 'flash', 'diary'],
    ['shopper', 'umbrella', 'bottle'],
    ['backpack', 'thermos', 'notebook'],
    ['raincoat', 'shopper', 'bottle'],
    ['speaker', 'powerbank', 'bottle'],
    ['tshirt', 'shopper', 'bottle'],
    ['hoodie', 'cap', 'bottle'],
    ['mug', 'pen', 'notebook'],
    ['diary', 'pen', 'powerbank'],
    ['tshirt', 'bucket_hat', 'bottle'],
    ['hoodie', 'sunglasses', 'shopper'],
    ['thermos_mug', 'notebook', 'pen'],
    ['blanket', 'mug', 'watch'],
];
const SLOT_FILL_EXTRAS = [
    'bottle',
    'mug',
    'pen',
    'notebook',
    'diary',
    'powerbank',
    'flash',
    'umbrella',
    'thermos',
    'shopper',
    'watch',
    'lanyard',
];
const SLOT_TYPE_ALIASES = {
    tshirt: 'tshirt',
    't-shirt': 'tshirt',
    tee: 'tshirt',
    футболка: 'tshirt',
    oversize: 'tshirt',
    оверсайз: 'tshirt',
    cap: 'cap',
    кепка: 'cap',
    bucket_hat: 'bucket_hat',
    bucket: 'bucket_hat',
    панама: 'bucket_hat',
    sunglasses: 'sunglasses',
    glasses: 'sunglasses',
    очки: 'sunglasses',
    raincoat: 'raincoat',
    дождевик: 'raincoat',
    shopper: 'shopper',
    шоппер: 'shopper',
    bag: 'bag',
    сумка: 'bag',
    backpack: 'backpack',
    рюкзак: 'backpack',
};
let CatalogIdeatorAgent = CatalogIdeatorAgent_1 = class CatalogIdeatorAgent {
    constructor(openrouter, config) {
        this.openrouter = openrouter;
        this.config = config;
        this.logger = new common_1.Logger(CatalogIdeatorAgent_1.name);
    }
    isFastPipeline() {
        return this.config.get('CATALOG_FAST_PIPELINE', 'true') !== 'false';
    }
    ideatorTargets() {
        if (!this.isFastPipeline()) {
            return {
                target: agent_constants_1.IDEATOR_TARGET_IDEAS,
                min: agent_constants_1.IDEATOR_MIN_IDEAS,
                maxAttempts: 3,
            };
        }
        return {
            target: agent_constants_1.IDEATOR_TARGET_IDEAS_FAST,
            min: agent_constants_1.IDEATOR_MIN_IDEAS_FAST,
            maxAttempts: agent_constants_1.IDEATOR_MAX_ATTEMPTS_FAST,
        };
    }
    ideatorTimeoutMs() {
        if (this.isFastPipeline()) {
            return Number(this.config.get('CATALOG_IDEATOR_FAST_TIMEOUT_MS', 28_000)) || 28_000;
        }
        return Number(this.config.get('CATALOG_IDEATOR_TIMEOUT_MS', 60_000)) || 60_000;
    }
    ideatorMaxTokens() {
        if (this.isFastPipeline()) {
            return Number(this.config.get('OPENROUTER_MAX_TOKENS_CATALOG_IDEATOR_FAST', 4500)) || 4500;
        }
        return Number(this.config.get('OPENROUTER_MAX_TOKENS_CATALOG_IDEATOR', 8000)) || 8000;
    }
    async generateIdeas(input) {
        const { min } = this.ideatorTargets();
        if (!this.openrouter.isEnabled()) {
            this.logger.warn('OpenRouter disabled — using local catalog ideator');
            return this.buildLocalResult(input, 'openrouter_disabled');
        }
        try {
            const llmResult = await (0, promise_timeout_util_1.withTimeout)(this.generateIdeasFromLlm(input), this.ideatorTimeoutMs(), 'CatalogIdeator');
            if (llmResult.ideas.length >= min) {
                return { ...llmResult, usedFallback: false };
            }
            this.logger.warn(`CatalogIdeator: only ${llmResult.ideas.length}/${min} ideas from LLM — topping up locally`);
            return this.mergeWithLocal(input, llmResult.ideas, 'insufficient_llm_ideas');
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.logger.warn(`CatalogIdeator LLM failed (${msg}) — local fallback`);
            return this.buildLocalResult(input, msg.slice(0, 120));
        }
    }
    buildLocalResult(input, reason) {
        const ideas = (0, catalog_local_ideator_util_1.generateLocalCatalogIdeas)({
            userPrompt: input.userQuery,
            category: input.category,
            desiredItemCount: input.desiredItemCount,
            mandatoryTypes: input.mandatoryTypes,
            alternativeTypeGroups: input.alternativeTypeGroups,
        });
        return { ideas, usedFallback: true, fallbackReason: reason };
    }
    mergeWithLocal(input, existing, reason) {
        const local = (0, catalog_local_ideator_util_1.generateLocalCatalogIdeas)({
            userPrompt: input.userQuery ?? '',
            category: input.category,
            desiredItemCount: input.desiredItemCount,
            mandatoryTypes: input.mandatoryTypes,
            alternativeTypeGroups: input.alternativeTypeGroups,
            count: agent_constants_1.IDEATOR_MAX_IDEAS,
        });
        const merged = this.mergeUniqueIdeas(existing, local, input.generationHistory);
        return {
            ideas: merged.slice(0, agent_constants_1.IDEATOR_MAX_IDEAS),
            usedFallback: existing.length === 0,
            fallbackReason: reason,
        };
    }
    async generateIdeasFromLlm(input) {
        const brief = (0, brief_context_util_1.buildAgentBriefPayload)(input);
        let allIdeas = [];
        let lastParseErr = null;
        const { target, min, maxAttempts } = this.ideatorTargets();
        const catalogPayload = {
            catalog_overview: input.catalogOverview,
            catalog_total_in_scope: input.catalogOverview.totalInDatabase ?? input.catalogOverview.totalProducts,
            allowed_product_types: concept_diversity_util_1.CATALOG_IDEATOR_TYPE_SLUGS,
            catalog_note: 'Не выбирайте SKU. Только productSlots с type из allowed_product_types. ' +
                'catalog_overview.categories — ветки IMBA-каталога (51k SKU). ' +
                'Реальные товары подберёт система из всего каталога.',
        };
        const previousResults = (0, previous_generation_util_1.buildPreviousResultsPayload)(input.generationHistory);
        const regenerationNote = previousResults
            ? 'REPEAT GENERATION: user already saw previous_results — propose NEW angles and slot mixes.'
            : null;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            const isTopUp = allIdeas.length > 0 && allIdeas.length < min;
            const need = target - allIdeas.length;
            const userMessage = isTopUp
                ? JSON.stringify({
                    ...brief,
                    mode: 'catalog',
                    ...catalogPayload,
                    desired_item_count: input.desiredItemCount,
                    budget_per_set: input.budgetPerSet,
                    mandatory_types_from_brief: input.mandatoryTypes,
                    brandColors: input.colors ?? [],
                    colorNote: input.colors?.length ?
                        'Подбирайте слоты и notes с учётом brandColors — одежда и головные уборы в цветах бренда.'
                        : null,
                    task: `Add exactly ${Math.min(need, 12)} NEW gift set ideas. Do not repeat existing titles or themeAxis.`,
                    existingTitles: allIdeas.map((i) => i.title),
                    existingThemeAxes: allIdeas.map((i) => i.themeAxis).filter(Boolean),
                    previous_results: previousResults,
                    regeneration_note: regenerationNote,
                    count: Math.min(need, 12),
                })
                : JSON.stringify({
                    ...brief,
                    mode: 'catalog',
                    ...catalogPayload,
                    desired_item_count: input.desiredItemCount,
                    budget_per_set: input.budgetPerSet,
                    mandatory_types_from_brief: input.mandatoryTypes,
                    brandColors: input.colors ?? [],
                    colorNote: input.colors?.length ?
                        'Подбирайте слоты и notes с учётом brandColors — одежда и головные уборы в цветах бренда.'
                        : null,
                    previous_results: previousResults,
                    regeneration_note: regenerationNote,
                    task: `Generate exactly ${target} distinct cohesive gift set concepts that LITERALLY match clientBrief. ` +
                        'Use productSlots (types only). Read brief word by word.',
                });
            const content = await this.openrouter.chatJson({
                systemPrompt: isTopUp
                    ? `${prompts_1.SYSTEM_PROMPT_IDEATOR_CATALOG_MORE}${previousResults ? `\n\n${prompts_1.REGENERATION_NOVELTY_RULES}` : ''}`
                    : `${prompts_1.SYSTEM_PROMPT_IDEATOR_CATALOG}${previousResults ? `\n\n${prompts_1.REGENERATION_NOVELTY_RULES}` : ''}`,
                userMessage,
                modelEnvKey: 'OPENROUTER_MODEL_CATALOG_IDEATOR',
                maxTokensEnvKey: this.isFastPipeline()
                    ? 'OPENROUTER_MAX_TOKENS_CATALOG_IDEATOR_FAST'
                    : 'OPENROUTER_MAX_TOKENS_CATALOG_IDEATOR',
                defaultMaxTokens: this.ideatorMaxTokens(),
                agentName: isTopUp ? 'CatalogIdeatorAgent(topup)' : 'CatalogIdeatorAgent',
                trace: input.trace,
            });
            try {
                const batch = this.normalize((0, json_repair_util_1.parseCatalogIdeatorOutput)(content), input);
                allIdeas = this.mergeUniqueIdeas(allIdeas, batch.ideas, input.generationHistory);
                this.logger.log(`CatalogIdeator batch ${attempt}: +${batch.ideas.length} → ${allIdeas.length} total`);
                if (allIdeas.length >= min) {
                    return { ideas: allIdeas.slice(0, agent_constants_1.IDEATOR_MAX_IDEAS) };
                }
            }
            catch (err) {
                lastParseErr = err instanceof Error ? err : new Error(String(err));
                this.logger.warn(`CatalogIdeator parse attempt ${attempt}: ${lastParseErr.message.slice(0, 140)}`);
            }
        }
        if (allIdeas.length >= min) {
            return { ideas: allIdeas.slice(0, agent_constants_1.IDEATOR_MAX_IDEAS) };
        }
        throw (lastParseErr ??
            new Error(`CatalogIdeator: недостаточно идей (${allIdeas.length}/${min})`));
    }
    mergeUniqueIdeas(existing, incoming, generationHistory) {
        const seenTitles = new Set(existing.map((i) => this.normTitle(i.title)));
        const seenAxes = new Set(existing.map((i) => i.themeAxis).filter(Boolean));
        const blockedTitles = generationHistory?.conceptTitles ?? [];
        const blockedAxes = new Set((generationHistory?.themeAxes ?? []).map((a) => a.trim().toLowerCase()));
        const merged = [...existing];
        for (const idea of incoming) {
            const key = this.normTitle(idea.title);
            if (!key || seenTitles.has(key))
                continue;
            if (blockedTitles.some((t) => (0, previous_generation_util_1.isSimilarConceptTitle)(t, idea.title)))
                continue;
            if (idea.themeAxis) {
                const axis = idea.themeAxis.trim().toLowerCase();
                if (seenAxes.has(idea.themeAxis) || blockedAxes.has(axis))
                    continue;
            }
            seenTitles.add(key);
            if (idea.themeAxis)
                seenAxes.add(idea.themeAxis);
            merged.push(idea);
        }
        return merged;
    }
    normTitle(title) {
        return title.trim().toLowerCase().replace(/\s+/g, ' ');
    }
    resolveSlotType(raw, allowed) {
        const key = raw.trim().toLowerCase().replace(/\s+/g, '_');
        const mapped = SLOT_TYPE_ALIASES[key] ?? key;
        return allowed.has(mapped) ? mapped : null;
    }
    archetypeIndex(seed) {
        let hash = 0;
        for (let i = 0; i < seed.length; i++) {
            hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
        }
        return hash % SLOT_ARCHETYPES.length;
    }
    fillSlotsFromArchetype(deduped, desiredCount, mandatoryTypes, fillSeed, allowed) {
        let carryUsed = deduped.some((s) => (0, concept_diversity_util_1.getProductTypeFamily)(s.type) === CARRY_FAMILY);
        let headwearUsed = deduped.some((s) => (0, concept_diversity_util_1.getProductTypeFamily)(s.type) === HEADWEAR_FAMILY);
        let drinkwareUsed = deduped.some((s) => (0, concept_diversity_util_1.getProductTypeFamily)(s.type) === DRINKWARE_FAMILY);
        const seenTypes = new Set(deduped.map((s) => s.type));
        const seenFamilies = new Set(deduped.map((s) => (0, concept_diversity_util_1.getProductTypeFamily)(s.type)));
        const result = [...deduped];
        const archetype = SLOT_ARCHETYPES[this.archetypeIndex(fillSeed)] ?? SLOT_ARCHETYPES[0];
        const fillOrder = [...archetype, ...SLOT_FILL_EXTRAS];
        for (const type of fillOrder) {
            if (result.length >= desiredCount)
                break;
            if (!allowed.has(type) || seenTypes.has(type))
                continue;
            const family = (0, concept_diversity_util_1.getProductTypeFamily)(type);
            if (seenFamilies.has(family))
                continue;
            if (family === CARRY_FAMILY && carryUsed)
                continue;
            if (family === HEADWEAR_FAMILY && headwearUsed)
                continue;
            if (family === DRINKWARE_FAMILY && drinkwareUsed)
                continue;
            result.push({ type, priority: mandatoryTypes.includes(type) ? 'must' : 'nice' });
            seenTypes.add(type);
            seenFamilies.add(family);
            if (family === CARRY_FAMILY)
                carryUsed = true;
            if (family === HEADWEAR_FAMILY)
                headwearUsed = true;
            if (family === DRINKWARE_FAMILY)
                drinkwareUsed = true;
        }
        return result.slice(0, desiredCount);
    }
    buildDirectedSlots(namedTypes, namedItems, desiredCount) {
        const slots = [];
        for (let i = 0; i < namedTypes.length && slots.length < desiredCount; i++) {
            const type = namedTypes[i];
            slots.push({
                type,
                priority: 'must',
                notes: namedItems[i] ?? type,
                positionLabel: namedItems[i] ?? type,
            });
        }
        return slots.slice(0, desiredCount);
    }
    normalizeSlots(raw, desiredCount, mandatoryTypes, alternativeTypeGroups, conceptIndex, fillSeed, directedMode = false, namedTypes = [], namedItems = []) {
        if (directedMode && namedTypes.length > 0) {
            return this.buildDirectedSlots(namedTypes, namedItems, desiredCount);
        }
        const allowed = new Set(concept_diversity_util_1.CATALOG_IDEATOR_TYPE_SLUGS);
        const slots = [];
        if (Array.isArray(raw)) {
            for (const entry of raw) {
                if (!entry || typeof entry !== 'object')
                    continue;
                const e = entry;
                const type = this.resolveSlotType(String(e.type ?? ''), allowed);
                if (!type)
                    continue;
                slots.push({
                    type,
                    priority: e.priority === 'must' ? 'must' : 'nice',
                    notes: typeof e.notes === 'string' ? e.notes.slice(0, 80) : undefined,
                });
            }
        }
        let carryUsed = false;
        let headwearUsed = false;
        let drinkwareUsed = false;
        const deduped = [];
        const seenTypes = new Set();
        const seenFamilies = new Set();
        for (const slot of slots) {
            if (seenTypes.has(slot.type))
                continue;
            const family = (0, concept_diversity_util_1.getProductTypeFamily)(slot.type);
            if (seenFamilies.has(family))
                continue;
            if (family === CARRY_FAMILY) {
                if (carryUsed)
                    continue;
                carryUsed = true;
            }
            if (family === HEADWEAR_FAMILY) {
                if (headwearUsed)
                    continue;
                headwearUsed = true;
            }
            if (family === DRINKWARE_FAMILY) {
                if (drinkwareUsed)
                    continue;
                drinkwareUsed = true;
            }
            seenTypes.add(slot.type);
            seenFamilies.add(family);
            deduped.push(slot);
        }
        for (const type of mandatoryTypes) {
            if (deduped.some((s) => s.type === type))
                continue;
            if (deduped.length >= desiredCount)
                break;
            deduped.unshift({ type, priority: 'must' });
            seenTypes.add(type);
        }
        const altTypes = (0, concept_diversity_util_1.pickAlternativeTypesForConcept)(alternativeTypeGroups, conceptIndex);
        for (const type of altTypes) {
            if (seenTypes.has(type))
                continue;
            if (deduped.length >= desiredCount)
                break;
            deduped.push({ type, priority: 'must' });
            seenTypes.add(type);
        }
        return this.padSlotsToDesiredCount(this.fillSlotsFromArchetype(deduped, desiredCount, mandatoryTypes, fillSeed, allowed), desiredCount);
    }
    padSlotsToDesiredCount(slots, targetSlots) {
        const productSlots = [...slots];
        if (productSlots.length >= targetSlots) {
            return productSlots.slice(0, targetSlots);
        }
        const usedFamilies = new Set(productSlots.map((s) => (0, concept_diversity_util_1.getProductTypeFamily)(s.type)));
        const usedTypes = new Set(productSlots.map((s) => s.type));
        const fillerTypes = concept_diversity_util_1.CATALOG_IDEATOR_TYPE_SLUGS.filter((t) => !usedFamilies.has((0, concept_diversity_util_1.getProductTypeFamily)(t)) && !usedTypes.has(t));
        let fi = 0;
        while (productSlots.length < targetSlots && fi < fillerTypes.length) {
            const type = fillerTypes[fi];
            productSlots.push({
                type,
                priority: 'nice',
                notes: '',
            });
            usedFamilies.add((0, concept_diversity_util_1.getProductTypeFamily)(type));
            usedTypes.add(type);
            fi += 1;
        }
        return productSlots.slice(0, targetSlots);
    }
    normalize(output, input) {
        const named = (0, named_positions_util_1.resolveNamedItemsForBrief)(input.userQuery ?? '', input.allowedItems ?? []);
        const directedMode = input.directedMode ?? (0, named_positions_util_1.isDirectedBriefMode)(named.namedTypes);
        const namedTypes = input.namedTypes?.length ? input.namedTypes : named.namedTypes;
        const namedItems = input.namedItems?.length ? input.namedItems : named.namedItems;
        const ideas = (output.ideas ?? [])
            .filter((idea) => idea.title && idea.composition)
            .map((idea, conceptIndex) => {
            const productSlots = directedMode
                ? this.buildDirectedSlots(namedTypes, namedItems, input.desiredItemCount)
                : this.normalizeSlots(idea.productSlots ?? [], input.desiredItemCount, input.mandatoryTypes, input.alternativeTypeGroups ?? [], conceptIndex, `${idea.themeAxis?.trim() || idea.title?.trim() || 'set'}#${input.generationHistory?.generationCount ?? 0}`, directedMode, namedTypes, namedItems);
            const mandatoryTypes = input.mandatoryTypes ?? [];
            for (const mt of mandatoryTypes) {
                if (!productSlots.some((s) => s.type === mt)) {
                    productSlots.unshift({
                        type: mt,
                        priority: 'must',
                        notes: 'Mandatory from brief',
                    });
                }
            }
            for (const slot of productSlots) {
                if (mandatoryTypes.includes(slot.type)) {
                    slot.priority = 'must';
                }
            }
            return {
                title: idea.title?.slice(0, 80) || 'Набор',
                composition: idea.composition?.slice(0, 400) || '',
                style: idea.style?.slice(0, 60) || 'корпоративный',
                themeAxis: idea.themeAxis?.slice(0, 40) || undefined,
                productSlots,
                items: (idea.items ?? []).map((n) => String(n).trim()).filter(Boolean),
                whyItFits: idea.whyItFits?.slice(0, 200) || '',
            };
        })
            .filter((idea) => idea.productSlots.length >= Math.min(input.desiredItemCount, namedTypes.length || input.desiredItemCount));
        return { ideas };
    }
};
exports.CatalogIdeatorAgent = CatalogIdeatorAgent;
exports.CatalogIdeatorAgent = CatalogIdeatorAgent = CatalogIdeatorAgent_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [openrouter_agent_client_1.OpenrouterAgentClient,
        config_1.ConfigService])
], CatalogIdeatorAgent);
//# sourceMappingURL=catalog-ideator.agent.js.map
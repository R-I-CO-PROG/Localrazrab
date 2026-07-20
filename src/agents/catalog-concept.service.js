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
var CatalogConceptService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CatalogConceptService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const llm_brief_service_1 = require("../providers/llm/llm-brief.service");
const llm_provider_1 = require("../providers/llm/llm.provider");
const openrouter_llm_provider_1 = require("../providers/llm/openrouter-llm.provider");
const set_budget_util_1 = require("../providers/llm/set-budget.util");
const catalog_slot_picker_util_1 = require("../providers/llm/catalog-slot-picker.util");
const concept_product_picker_util_1 = require("../providers/llm/concept-product-picker.util");
const catalog_variant_util_1 = require("../providers/llm/catalog-variant.util");
const catalog_color_match_util_1 = require("../providers/llm/catalog-color-match.util");
const parse_llm_json_1 = require("../providers/llm/parse-llm-json");
const product_count_bounds_util_1 = require("../providers/llm/product-count-bounds.util");
const product_image_util_1 = require("../products/product-image.util");
const brief_constraints_util_1 = require("../requests/brief-constraints.util");
const parse_brief_util_1 = require("../requests/parse-brief.util");
const request_colors_util_1 = require("../requests/request-colors.util");
const mandatory_types_util_1 = require("../requests/mandatory-types.util");
const named_positions_util_1 = require("../requests/named-positions.util");
const catalog_local_ideator_util_1 = require("../providers/llm/catalog-local-ideator.util");
const concept_diversity_util_1 = require("../providers/llm/concept-diversity.util");
const catalog_brief_relevance_util_1 = require("../providers/llm/catalog-brief-relevance.util");
const catalog_ideator_agent_1 = require("./catalog-ideator.agent");
const catalog_critic_agent_1 = require("./catalog-critic.agent");
const catalog_fast_select_util_1 = require("../providers/llm/catalog-fast-select.util");
const catalog_pipeline_timing_util_1 = require("../providers/llm/catalog-pipeline-timing.util");
const regeneration_novelty_util_1 = require("../providers/llm/regeneration-novelty.util");
const cross_concept_uniqueness_util_1 = require("../providers/llm/cross-concept-uniqueness.util");
const brief_keyword_search_util_1 = require("../providers/llm/brief-keyword-search.util");
const selection_constraints_1 = require("../concept/selection-constraints");
const product_role_util_1 = require("../concept/product-role.util");
const selection_constraints_2 = require("../concept/selection-constraints");
const agent_constants_1 = require("./agent.constants");
const openrouter_agent_client_1 = require("./openrouter-agent.client");
const catalog_llm_set_critic_util_1 = require("../providers/llm/catalog-llm-set-critic.util");
const TARGET_CONCEPTS_DEFAULT = 8;
let CatalogConceptService = CatalogConceptService_1 = class CatalogConceptService {
    constructor(llmBrief, llmFactory, config, catalogIdeator, catalogCritic, openrouter) {
        this.llmBrief = llmBrief;
        this.llmFactory = llmFactory;
        this.config = config;
        this.catalogIdeator = catalogIdeator;
        this.catalogCritic = catalogCritic;
        this.openrouter = openrouter;
        this.logger = new common_1.Logger(CatalogConceptService_1.name);
    }
    targetConceptCount() {
        const n = Number(this.config.get('CATALOG_TARGET_CONCEPTS', String(TARGET_CONCEPTS_DEFAULT)));
        return Number.isFinite(n) && n > 0 ? Math.min(12, Math.round(n)) : TARGET_CONCEPTS_DEFAULT;
    }
    async discoverConcepts(briefInput, request, options) {
        const timing = new catalog_pipeline_timing_util_1.CatalogPipelineTiming();
        (0, concept_diversity_util_1.clearConceptProductTypeCache)();
        timing.lap('discover_setup');
        const colorsFromBrief = (0, parse_brief_util_1.extractBriefColorsFromText)(request.userPrompt);
        const colors = [
            ...new Set([
                ...(0, request_colors_util_1.normalizeRequestColors)(request.colors),
                ...colorsFromBrief,
                ...(0, request_colors_util_1.expandAbstractColorsFromText)(request.userPrompt),
            ]),
        ];
        const rawAllowed = request.allowedItems ?? [];
        const rawForbidden = request.forbiddenItems ?? [];
        const splitAllowed = (0, named_positions_util_1.splitAllowedItemsMixed)(rawAllowed);
        const namedResolved = (0, named_positions_util_1.resolveNamedItemsForBrief)(request.userPrompt, rawAllowed);
        const directedMode = (0, named_positions_util_1.isDirectedBriefMode)(namedResolved.namedTypes);
        const { allowedItems, forbiddenItems } = (0, brief_constraints_util_1.reconcileBriefConstraints)(request.userPrompt, [...splitAllowed.categories, ...namedResolved.categoryBuckets], rawForbidden, request.budgetMax);
        const logoAsset = request.assets.find((a) => a.type === 'logo');
        const budgetPerSet = (0, set_budget_util_1.resolveBudgetPerSet)(request.budgetMin, request.budgetMax);
        const countBounds = (0, product_count_bounds_util_1.resolveProductCountBounds)({ ...request, budgetPerSet });
        const desiredCount = (0, product_count_bounds_util_1.averageItemCount)(countBounds);
        const mandatoryConceptTypes = (0, mandatory_types_util_1.resolveMandatoryTypesForBrief)(request.userPrompt, rawAllowed);
        const alternativeTypeGroups = (0, concept_diversity_util_1.detectAlternativeTypeGroupsFromBrief)(request.userPrompt);
        if (directedMode) {
            this.logger.log(`Directed brief mode: mandatory named types [${namedResolved.namedTypes.join(', ')}] from [${namedResolved.namedItems.join(', ')}]`);
        }
        const diversityTracker = new concept_diversity_util_1.ConceptDiversityTracker(new Set(mandatoryConceptTypes));
        (0, set_budget_util_1.assertBudgetPerSetInRange)(budgetPerSet, request.budgetMin, request.budgetMax, (msg) => this.logger.warn(msg));
        if (budgetPerSet != null) {
            this.logger.log(`budgetPerSet=${budgetPerSet} (budgetMin=${request.budgetMin}, budgetMax=${request.budgetMax}, quantity=${request.quantity})`);
        }
        const generationHistory = options?.generationHistory ?? null;
        const previousProductIds = new Set(generationHistory?.productIds ?? []);
        const seedOverride = this.config.get('CATALOG_RUN_SEED', '');
        const runSeed = seedOverride !== '' && Number.isFinite(Number(seedOverride))
            ? Number(seedOverride)
            : Math.floor(Math.random() * 1_000_000);
        const regenerationSeed = (generationHistory?.generationCount ?? 0) * 997 + runSeed;
        const blacklistedProductIds = [
            ...new Set([
                ...(request.blacklistedProductIds ?? []),
                ...(generationHistory?.productIds ?? []),
            ]),
        ];
        const blacklistedSupplierIds = request.blacklistedSupplierIds ?? [];
        const filterInput = {
            userPrompt: request.userPrompt,
            projectCategory: request.category,
            quantity: request.quantity,
            budgetMin: request.budgetMin,
            budgetMax: request.budgetMax,
            budgetPerSet,
            setItemCount: desiredCount,
            useProductCountLimit: countBounds.useLimit,
            minProductsPerSet: countBounds.min,
            maxProductsPerSet: countBounds.max,
            colors,
            allowedItems,
            forbiddenItems,
            blacklistedProductIds,
            blacklistedSupplierIds,
        };
        const stratifiedMax = Number(this.config.get('CATALOG_STRATIFIED_MAX', 800)) || 800;
        const catalogPipeline = await this.llmBrief.prepareCatalogPipeline(filterInput, stratifiedMax, timing);
        const fullCatalog = catalogPipeline.relevance;
        const filteredCatalog = catalogPipeline.filtered;
        const relevanceCatalog = catalogPipeline.relevance;
        const catalogForLlm = catalogPipeline.forLlm;
        const catalogOverview = catalogPipeline.overview;
        const catalogTypeIndex = catalogPipeline.typeIndex;
        const fastPipeline = this.config.get('CATALOG_FAST_PIPELINE', 'true') !== 'false';
        this.logger.log(`Catalog pipeline: ${catalogPipeline.totalInDb} total, ${filteredCatalog.length} filtered, ` +
            `${relevanceCatalog.length} relevance-scored, ${catalogOverview.categories.length} categories`);
        const agentBrief = {
            ...briefInput,
            allowedItems,
            forbiddenItems,
        };
        let rawConcepts = [];
        let usedFallback = false;
        let pipeline = 'ideator_critic';
        let ideatorOutput;
        let criticOutput;
        try {
            const ideatorResult = await (0, catalog_pipeline_timing_util_1.timedStage)(timing, 'ideator_llm', () => this.catalogIdeator.generateIdeas({
                ...agentBrief,
                desiredItemCount: countBounds.max,
                budgetPerSet,
                mandatoryTypes: mandatoryConceptTypes,
                namedTypes: namedResolved.namedTypes,
                namedItems: namedResolved.namedItems,
                directedMode,
                alternativeTypeGroups,
                catalogOverview,
                trace: options?.trace,
                generationHistory,
            }));
            ideatorOutput = { ideas: ideatorResult.ideas };
            usedFallback = ideatorResult.usedFallback;
            if (fastPipeline) {
                criticOutput = (0, catalog_pipeline_timing_util_1.timedStageSync)(timing, 'critic_local', () => (0, catalog_fast_select_util_1.pickTopCatalogIdeasLocally)(ideatorResult.ideas, agentBrief, agent_constants_1.CRITIC_TOP_N, generationHistory));
                this.logger.log(`Catalog fast select: ${ideatorResult.ideas.length} ideas → ${criticOutput.topIdeas.length} sets (no LLM Critic)`);
            }
            else {
                criticOutput = await (0, catalog_pipeline_timing_util_1.timedStage)(timing, 'critic_llm', () => this.catalogCritic.pickTop5(ideatorResult.ideas, {
                    ...agentBrief,
                    desiredItemCount: countBounds.max,
                    budgetPerSet,
                    mandatoryTypes: mandatoryConceptTypes,
                }, options?.trace));
            }
            rawConcepts = criticOutput.topIdeas.map((top) => {
                const full = ideatorResult.ideas.find((i) => i.title === top.title);
                return {
                    title: top.title,
                    composition: top.conceptSummary ?? full?.composition ?? '',
                    style: full?.style ?? 'корпоративный',
                    items: full?.items ?? [],
                    productSlots: full?.productSlots ?? [],
                };
            });
            this.logger.log(`Catalog Ideator→Critic: ${ideatorResult.ideas.length} ideas → ${rawConcepts.length} sets`);
        }
        catch (agentErr) {
            const msg = agentErr instanceof Error ? agentErr.message : String(agentErr);
            this.logger.warn(`Catalog Ideator→Critic failed: ${msg} — trying legacy LLM`);
            pipeline = 'legacy_llm';
            try {
                rawConcepts = await this.callLegacyCatalogConceptsLlm(request, catalogForLlm, colors, allowedItems, forbiddenItems, desiredCount, mandatoryConceptTypes, Boolean(logoAsset), logoAsset?.url ?? null);
            }
            catch (legacyErr) {
                const legacyMsg = legacyErr instanceof Error ? legacyErr.message : String(legacyErr);
                this.logger.warn(`Legacy catalog LLM failed: ${legacyMsg} — using algorithmic fallback`);
                pipeline = 'fallback';
                usedFallback = true;
                rawConcepts = this.buildFallbackConcepts(catalogForLlm, desiredCount, request.userPrompt, diversityTracker);
            }
        }
        if (rawConcepts.length === 0) {
            this.logger.warn('No catalog ideas after pipeline — generating local fallback concepts');
            pipeline = 'fallback';
            usedFallback = true;
            const localIdeas = (0, catalog_local_ideator_util_1.generateLocalCatalogIdeas)({
                userPrompt: request.userPrompt,
                category: request.category,
                desiredItemCount: countBounds.max,
                mandatoryTypes: mandatoryConceptTypes,
                namedTypes: namedResolved.namedTypes,
                namedItems: namedResolved.namedItems,
                directedMode,
                alternativeTypeGroups,
            });
            rawConcepts = localIdeas.map((idea) => ({
                title: idea.title,
                composition: idea.composition,
                style: idea.style ?? 'корпоративный',
                items: idea.items ?? [],
                productSlots: idea.productSlots ?? [],
            }));
        }
        const usedProductIds = new Set(generationHistory?.productIds ?? []);
        const catalogById = new Map(relevanceCatalog.map((p) => [p.id, p]));
        const usedVariantKeys = new Set(generationHistory?.productVariantKeys ?? []);
        for (const vk of (0, cross_concept_uniqueness_util_1.seedVariantKeysFromProductIds)(usedProductIds, catalogById)) {
            usedVariantKeys.add(vk);
        }
        if (usedProductIds.size > 0 || usedVariantKeys.size > 0) {
            this.logger.log(`Cross-concept seed: ${usedProductIds.size} blocked ids, ${usedVariantKeys.size} blocked variant keys from history`);
        }
        const concepts = [];
        const targetConcepts = this.targetConceptCount();
        const conceptBuildCount = Math.min(rawConcepts.length, targetConcepts);
        const parallelToConcept = this.config.get('CATALOG_TO_CONCEPT_PARALLEL', 'true') !== 'false';
        const diversityMandatory = new Set(mandatoryConceptTypes);
        const runToConcept = (raw, index, blockedIds, blockedVariants, tracker) => this.toConcept(raw, catalogForLlm, relevanceCatalog, (0, product_count_bounds_util_1.pickConceptItemCount)(countBounds, index), index, usedFallback, blockedIds, blockedVariants, colors, tracker, budgetPerSet, request.userPrompt, filterInput, catalogTypeIndex, options?.trace, regenerationSeed);
        const absorbConceptIntoRunState = (concept) => {
            concepts.push(concept);
            const types = [];
            for (const cp of concept.catalogProducts ?? []) {
                usedProductIds.add(cp.id);
                const row = catalogById.get(cp.id);
                if (row) {
                    usedVariantKeys.add((0, catalog_variant_util_1.productVariantKey)(row));
                    types.push((0, concept_diversity_util_1.detectConceptProductType)(row));
                }
            }
            if (types.length > 0) {
                diversityTracker.recordConceptTypes(types);
            }
        };
        if (parallelToConcept && conceptBuildCount > 1) {
            const built = await (0, catalog_pipeline_timing_util_1.timedStage)(timing, 'toConcept_parallel', () => Promise.all(Array.from({ length: conceptBuildCount }, (_, index) => runToConcept(rawConcepts[index], index, new Set(usedProductIds), new Set(usedVariantKeys), new concept_diversity_util_1.ConceptDiversityTracker(diversityMandatory)))));
            for (const concept of built) {
                absorbConceptIntoRunState(concept);
            }
        }
        else {
            for (let index = 0; index < conceptBuildCount; index++) {
                absorbConceptIntoRunState((0, catalog_pipeline_timing_util_1.timedStageSync)(timing, `toConcept_${index + 1}`, () => runToConcept(rawConcepts[index], index, usedProductIds, usedVariantKeys, diversityTracker)));
            }
        }
        while (concepts.length < targetConcepts && catalogForLlm.length > 0) {
            const extra = this.buildFallbackConcepts(catalogForLlm, countBounds.max, request.userPrompt, diversityTracker, concepts.length, usedProductIds, usedVariantKeys);
            for (const raw of extra) {
                if (concepts.length >= targetConcepts)
                    break;
                const conceptItemCount = (0, product_count_bounds_util_1.pickConceptItemCount)(countBounds, concepts.length);
                concepts.push(this.toConcept(raw, catalogForLlm, relevanceCatalog, conceptItemCount, concepts.length, true, usedProductIds, usedVariantKeys, colors, diversityTracker, budgetPerSet, request.userPrompt, filterInput, catalogTypeIndex, options?.trace, regenerationSeed));
            }
            break;
        }
        const emptyCount = concepts.filter((c) => !c.catalogProducts?.length).length;
        if (emptyCount > 0) {
            this.logger.warn(`Catalog concepts: ${emptyCount}/${concepts.length} sets empty — attempting refill`);
            this.refillEmptyConceptProducts(concepts, catalogForLlm.length >= desiredCount * 4 ? catalogForLlm : relevanceCatalog, desiredCount, usedProductIds, usedVariantKeys, diversityTracker, budgetPerSet, request.userPrompt, colors);
        }
        concepts.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
        let finalConcepts = concepts.slice(0, targetConcepts);
        const uniquenessCatalog = relevanceCatalog.length ? relevanceCatalog : catalogForLlm;
        finalConcepts = (0, cross_concept_uniqueness_util_1.enforceGlobalConceptUniqueness)(finalConcepts, uniquenessCatalog, request.userPrompt, colors, filterInput.minProductsPerSet ?? desiredCount, (msg) => this.logger.warn(msg), budgetPerSet, directedMode);
        finalConcepts = await (0, catalog_llm_set_critic_util_1.critiqueConceptSetsWithLlm)(finalConcepts, request.userPrompt, uniquenessCatalog, colors, this.openrouter, this.config, (msg) => this.logger.warn(msg), filterInput, filterInput.minProductsPerSet ?? desiredCount, filterInput.maxProductsPerSet ?? countBounds.max);
        if (previousProductIds.size > 0) {
            finalConcepts = (0, regeneration_novelty_util_1.replacePreviousGenerationProducts)(finalConcepts, previousProductIds, relevanceCatalog.length ? relevanceCatalog : catalogForLlm, request.userPrompt, colors, regenerationSeed);
            finalConcepts = (0, regeneration_novelty_util_1.refillConceptsAvoidingPrevious)(finalConcepts, previousProductIds, relevanceCatalog.length ? relevanceCatalog : catalogForLlm, desiredCount, request.userPrompt, colors, regenerationSeed);
            this.logger.log(`Regeneration novelty: blocked ${previousProductIds.size} previous SKUs, run #${generationHistory?.generationCount ?? 0}`);
        }
        finalConcepts = (0, cross_concept_uniqueness_util_1.enforceGlobalConceptUniqueness)(finalConcepts, uniquenessCatalog, request.userPrompt, colors, filterInput.minProductsPerSet ?? desiredCount, (msg) => this.logger.warn(msg), budgetPerSet, directedMode);
        timing.lap('post_process');
        const timingRecord = timing.toRecord();
        this.logger.log(`discoverConcepts timing ${timing.totalMs()}ms:\n${timing.toTable()}`);
        void options?.trace?.({
            step: 'catalog_pipeline_timing',
            actor: 'CatalogConceptService',
            direction: 'internal',
            summary: `discoverConcepts ${timing.totalMs()}ms`,
            ms: timing.totalMs(),
            response: { stages: timingRecord, table: timing.toTable() },
        });
        return {
            concepts: finalConcepts,
            ideatorOutput,
            criticOutput,
            pipeline,
            timingMs: timing.totalMs(),
            timingStages: timing.toRecord(),
        };
    }
    resolveSetItemCount(request) {
        return (0, product_count_bounds_util_1.averageItemCount)((0, product_count_bounds_util_1.resolveProductCountBounds)(request));
    }
    normalizeHexColors(colors) {
        if (!Array.isArray(colors))
            return [];
        return colors
            .map((c) => {
            if (typeof c === 'string')
                return c.trim();
            if (c && typeof c === 'object' && 'hex' in c) {
                return String(c.hex ?? '').trim();
            }
            return '';
        })
            .filter(Boolean);
    }
    async callLegacyCatalogConceptsLlm(request, catalogForLlm, colors, allowedItems, forbiddenItems, desiredCount, mandatoryConceptTypes, hasLogo, logoUrl) {
        const llmInput = this.llmBrief.buildInput({
            userPrompt: request.userPrompt,
            category: request.category,
            quantity: request.quantity,
            budgetMin: request.budgetMin,
            budgetMax: request.budgetMax,
            colors,
            allowedItems,
            forbiddenItems,
            productNames: [],
            catalog: catalogForLlm,
            hasLogo,
            logoUrl,
            desiredItemCount: desiredCount,
            catalogConceptsMode: true,
            mandatoryConceptTypes,
        });
        const chain = this.llmFactory.getGenerationProviderChain();
        const errors = [];
        for (const { name, provider } of chain) {
            try {
                const output = await provider.generate({ ...llmInput, catalogConceptsMode: true });
                const parsed = (0, parse_llm_json_1.parseCatalogConceptsJson)(output.composition);
                if (parsed.concepts.length < 3) {
                    throw new Error(`Only ${parsed.concepts.length} concepts returned`);
                }
                this.logger.log(`Legacy catalog LLM OK (${name}${provider instanceof openrouter_llm_provider_1.OpenrouterLlmProvider ? `/${provider.lastModelUsed}` : ''}): ${parsed.concepts.length} sets`);
                return parsed.concepts;
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                errors.push(`${name}: ${msg.slice(0, 100)}`);
                this.logger.warn(`Legacy catalog ${name} failed: ${msg.slice(0, 140)}`);
            }
        }
        throw new Error(errors.join(' | ') || 'No LLM providers for catalog concepts');
    }
    buildFallbackConcepts(catalog, desiredCount, userPrompt, diversityTracker, offset = 0, usedProductIds = new Set(), usedVariantKeys = new Set()) {
        const themes = [
            'Премиальный welcome pack',
            'Tech-набор для IT',
            'Эко-набор',
            'Офисный daily use',
            'Подарок для клиентов',
        ];
        const concepts = [];
        const pool = catalog.filter((p) => !usedProductIds.has(p.id) && !usedVariantKeys.has((0, catalog_variant_util_1.productVariantKey)(p)));
        const source = pool.length >= desiredCount
            ? pool
            : catalog.filter((p) => !usedProductIds.has(p.id) && !usedVariantKeys.has((0, catalog_variant_util_1.productVariantKey)(p)));
        const targetConcepts = this.targetConceptCount();
        for (let i = 0; i < targetConcepts; i++) {
            const blockedIds = new Set(usedProductIds);
            const blockedVariants = new Set(usedVariantKeys);
            const slice = (0, concept_diversity_util_1.enforceConceptSetDiversity)([], source.length ? source : pool, desiredCount, diversityTracker, blockedIds, blockedVariants, offset * targetConcepts + i);
            if (!slice.length)
                break;
            concepts.push({
                title: themes[i] ?? `Набор ${offset + i + 1}`,
                composition: `Подбор товаров под задачу: ${userPrompt.slice(0, 120)}`,
                style: themes[i]?.split(' ')[0] ?? 'корпоративный',
                items: slice.map((p) => p.name),
            });
        }
        return concepts;
    }
    toConcept(raw, catalog, fullCatalog, desiredCount, index, usedFallback, usedProductIds, usedVariantKeys, brandColors, diversityTracker, budgetPerSet, brief, filterInput, catalogTypeIndex, trace, regenerationSeed = 0) {
        const conceptTitle = raw.title?.trim() || `Набор ${index + 1}`;
        const conceptComposition = raw.composition?.trim() ?? '';
        const conceptStyle = raw.style?.trim();
        const namedResolved = (0, named_positions_util_1.resolveNamedItemsForBrief)(brief, filterInput.allowedItems ?? []);
        const directedMode = (0, named_positions_util_1.isDirectedBriefMode)(namedResolved.namedTypes);
        const exclusiveMode = (0, named_positions_util_1.isExclusiveBriefMode)(brief, namedResolved.namedTypes);
        const mandatoryTypes = (0, mandatory_types_util_1.resolveMandatoryTypesForBrief)(brief, filterInput.allowedItems ?? []);
        const minItems = filterInput.minProductsPerSet ?? desiredCount;
        const maxItems = filterInput.maxProductsPerSet ?? desiredCount;
        const namedCount = namedResolved.namedTypes.length;
        const fillTarget = exclusiveMode
            ? Math.min(maxItems, Math.max(1, namedCount))
            : Math.min(maxItems, Math.max(minItems, desiredCount, namedCount));
        const searchCatalog = fullCatalog.length >= catalog.length ? fullCatalog : catalog;
        const pickPool = searchCatalog.filter((p) => !usedProductIds.has(p.id) && !usedVariantKeys.has((0, catalog_variant_util_1.productVariantKey)(p)));
        const pool = pickPool.length ? pickPool : searchCatalog;
        const diversePool = pool.filter((p) => diversityTracker.canUseType((0, concept_diversity_util_1.detectConceptProductType)(p)));
        const selectionPool = diversePool.length >= Math.max(fillTarget * 3, 24) ? diversePool : pool;
        this.logger.log(`Concept #${index + 1} "${conceptTitle}": pool=${pool.length}, diverse=${selectionPool.length}, ` +
            `fillTarget=${fillTarget}, usedIds=${usedProductIds.size}, usedVariants=${usedVariantKeys.size}`);
        const initial = this.gatherConceptCandidates({
            raw,
            pool: selectionPool,
            brief,
            conceptTitle,
            conceptComposition,
            conceptStyle,
            brandColors,
            filterInput,
            directedMode,
            exclusiveMode,
            namedResolved,
            mandatoryTypes,
            usedProductIds,
            usedVariantKeys,
            budgetPerSet,
            fillTarget,
            catalogTypeIndex,
            index,
            regenerationSeed,
        });
        const selectionInput = (0, selection_constraints_1.selectionConstraintsFromFilterInput)(filterInput, {
            min: fillTarget,
            max: maxItems,
        });
        const { products: finalized, report: selectionReport } = (0, selection_constraints_1.finalizeConceptSelection)(initial, selectionInput, {
            catalog: selectionPool,
            filterInput,
            conceptTitle,
            conceptComposition,
            typeIndex: catalogTypeIndex,
            seed: index * 19 + regenerationSeed,
            crossConceptBlockedIds: usedProductIds,
            crossConceptBlockedVariants: usedVariantKeys,
            onWarn: (msg) => this.logger.warn(`Selection "${conceptTitle}": ${msg}`),
        });
        let products = finalized;
        let report = selectionReport;
        if (budgetPerSet != null && budgetPerSet > 0 && products.length > 0 && !exclusiveMode) {
            const upgradeCtx = {
                title: conceptTitle,
                composition: conceptComposition,
                brief,
                style: conceptStyle,
                brandColors,
                filterInput,
                budgetMin: filterInput.budgetMin,
                budgetMax: budgetPerSet,
                maxProductsPerSet: maxItems,
            };
            products = (0, concept_product_picker_util_1.upgradeSetToTargetBudget)(products, selectionPool, budgetPerSet, upgradeCtx, catalogTypeIndex);
            const { floor: budgetFloor } = (0, set_budget_util_1.resolveSetBudgetRange)(filterInput.budgetMin, budgetPerSet);
            if ((0, set_budget_util_1.estimateSetTotalPrice)(products) < budgetFloor && products.length < maxItems) {
                const colorScore = (0, catalog_color_match_util_1.buildBrandColorScoreFn)(brandColors);
                const perSlot = budgetPerSet / Math.max(maxItems, 1);
                const affordable = selectionPool.filter((p) => (p.price ?? 0) <= budgetPerSet);
                const budgetScore = (p) => {
                    const price = p.price ?? 0;
                    const fit = price > 0 ? Math.min(price, perSlot) / perSlot : 0;
                    return (0, catalog_brief_relevance_util_1.scoreBriefRelevance)(p, brief, brandColors) + colorScore(p) + fit * 25;
                };
                products = (0, concept_product_picker_util_1.ensureConceptProducts)(products, affordable.length >= maxItems ? affordable : selectionPool, maxItems, { title: conceptTitle, composition: conceptComposition, brief, style: conceptStyle }, usedProductIds, usedVariantKeys, diversityTracker, index * 23 + regenerationSeed, false, budgetScore, mandatoryTypes);
                products = (0, concept_product_picker_util_1.upgradeSetToTargetBudget)(products, selectionPool, budgetPerSet, upgradeCtx, catalogTypeIndex);
            }
        }
        products = (0, catalog_variant_util_1.upgradeToBrandColorVariants)(products, searchCatalog, brandColors);
        products = this.fixSetCohesion(products, pool, usedProductIds, usedVariantKeys, brandColors, brief, conceptTitle);
        const postFinal = (0, selection_constraints_1.finalizeConceptSelection)(products, selectionInput, {
            catalog: selectionPool,
            filterInput,
            conceptTitle,
            conceptComposition,
            typeIndex: catalogTypeIndex,
            seed: index * 37 + regenerationSeed + 1,
            crossConceptBlockedIds: usedProductIds,
            crossConceptBlockedVariants: usedVariantKeys,
            maxRepairRounds: 6,
            onWarn: (msg) => this.logger.warn(`Selection post-final "${conceptTitle}": ${msg}`),
        });
        products = postFinal.products;
        const mergedReport = {
            ...report,
            violations: [...report.violations, ...postFinal.report.violations],
            repairs: [...report.repairs, ...postFinal.report.repairs],
            finalCount: postFinal.report.finalCount,
            valid: postFinal.report.valid,
            budgetUsedPct: postFinal.report.budgetUsedPct,
            budgetFitFailed: postFinal.report.budgetFitFailed,
        };
        report = mergedReport;
        if (products.length < fillTarget) {
            const globalPool = searchCatalog.length >= fillTarget * 4 ? searchCatalog : fullCatalog;
            const relaxed = (0, selection_constraints_1.buildSetWithRelaxation)({
                constraints: selectionInput,
                options: {
                    catalog: selectionPool.length ? selectionPool : globalPool,
                    filterInput,
                    conceptTitle,
                    conceptComposition,
                    typeIndex: catalogTypeIndex,
                    seed: index * 41 + regenerationSeed,
                    crossConceptBlockedIds: usedProductIds,
                    crossConceptBlockedVariants: usedVariantKeys,
                    onWarn: (msg) => this.logger.warn(`Relaxation "${conceptTitle}": ${msg}`),
                },
                initial: products.length ? products : initial,
                targetCount: fillTarget,
                onLog: (msg) => this.logger.warn(`Relaxation "${conceptTitle}": ${msg}`),
            }, globalPool);
            if (relaxed.products.length > products.length) {
                this.logger.warn(`Concept "${conceptTitle}": buildSetWithRelaxation L${relaxed.level} → ${relaxed.products.length} items [${relaxed.relaxed.join(', ')}]`);
                const reFinal = (0, selection_constraints_1.finalizeConceptSelection)(relaxed.products, selectionInput, {
                    catalog: selectionPool.length ? selectionPool : globalPool,
                    filterInput,
                    conceptTitle,
                    conceptComposition,
                    typeIndex: catalogTypeIndex,
                    seed: index * 43 + regenerationSeed,
                    crossConceptBlockedIds: usedProductIds,
                    crossConceptBlockedVariants: usedVariantKeys,
                    onWarn: (msg) => this.logger.warn(`Selection relaxed-final "${conceptTitle}": ${msg}`),
                });
                products = reFinal.products;
                report = {
                    ...report,
                    violations: [...report.violations, ...reFinal.report.violations],
                    repairs: [...report.repairs, ...reFinal.report.repairs],
                    finalCount: reFinal.report.finalCount,
                    valid: reFinal.report.valid,
                    budgetUsedPct: reFinal.report.budgetUsedPct,
                    budgetFitFailed: reFinal.report.budgetFitFailed,
                };
            }
        }
        if (products.length > 0) {
            diversityTracker.recordConceptTypes(products.map(concept_diversity_util_1.detectConceptProductType));
        }
        for (const p of products) {
            usedProductIds.add(p.id);
            usedVariantKeys.add((0, catalog_variant_util_1.productVariantKey)(p));
        }
        if (report.repairs.length > 0 || report.violations.length > 0) {
            this.logger.log(`Selection "${conceptTitle}": ${report.finalCount} items, ` +
                `${report.violations.length} violations, ${report.repairs.length} repairs`);
            void trace?.({
                step: 'selection_finalize',
                actor: 'SelectionConstraints',
                direction: 'internal',
                summary: `${conceptTitle}: ${report.finalCount} items, ${report.violations.length} violations`,
                response: {
                    title: conceptTitle,
                    valid: report.valid,
                    violations: report.violations,
                    repairs: report.repairs,
                    budgetUsedPct: report.budgetUsedPct,
                    budgetFitFailed: report.budgetFitFailed,
                    finalCount: report.finalCount,
                },
            });
        }
        const syncedComposition = (0, catalog_slot_picker_util_1.buildCompositionFromProducts)(products, conceptStyle, conceptComposition);
        return this.mapProductsToConcept(conceptTitle, syncedComposition, raw.style, products, usedFallback, index, undefined, undefined, brandColors, report, budgetPerSet);
    }
    gatherConceptCandidates(args) {
        const { raw, pool, brief, conceptTitle, conceptComposition, conceptStyle, brandColors, filterInput, directedMode, exclusiveMode, namedResolved, mandatoryTypes, usedProductIds, usedVariantKeys, budgetPerSet, fillTarget, catalogTypeIndex, index, regenerationSeed, } = args;
        const briefKeywords = (0, brief_keyword_search_util_1.extractProductKeywordsFromBrief)(brief);
        const keywordProducts = briefKeywords.length > 0
            ? (0, brief_keyword_search_util_1.findProductsByBriefKeywords)(briefKeywords, pool, usedProductIds, usedVariantKeys)
            : [];
        if (keywordProducts.length > 0) {
            this.logger.log(`Brief keywords [${briefKeywords.join(', ')}] → ${keywordProducts.length} direct matches for "${conceptTitle}"`);
        }
        const keywordTypes = new Set(keywordProducts.map((p) => (0, concept_diversity_util_1.detectConceptProductType)(p)));
        const blockedIds = new Set([...usedProductIds, ...keywordProducts.map((p) => p.id)]);
        const blockedVariants = new Set([
            ...usedVariantKeys,
            ...keywordProducts.map((p) => (0, catalog_variant_util_1.productVariantKey)(p)),
        ]);
        let slotProducts = [];
        if (directedMode || raw.productSlots?.length) {
            const slotsForPicker = (directedMode
                ? namedResolved.namedTypes.map((type, i) => ({
                    type,
                    priority: 'must',
                    notes: namedResolved.namedItems[i] ?? type,
                    positionLabel: namedResolved.namedItems[i] ?? type,
                }))
                : raw.productSlots ?? []).filter((s) => !(0, concept_diversity_util_1.typeConflictsInSet)(keywordTypes, s.type));
            if (slotsForPicker.length > 0) {
                slotProducts = (0, catalog_slot_picker_util_1.resolveConceptFromSlots)(slotsForPicker, pool, fillTarget, {
                    brief,
                    conceptTitle,
                    conceptComposition,
                    conceptStyle,
                    brandColors,
                    filterInput,
                    blockedIds,
                    blockedVariants,
                    seed: index * 17 + regenerationSeed,
                    perSetBudget: budgetPerSet,
                    budgetMax: budgetPerSet ?? filterInput.budgetMax ?? undefined,
                    slotTypes: slotsForPicker.map((s) => s.type),
                    desiredCount: fillTarget,
                    mandatoryTypes,
                    strictMandatory: exclusiveMode,
                    logMissing: (msg) => this.logger.warn(`Concept "${conceptTitle}": ${msg}`),
                }, catalogTypeIndex);
            }
        }
        else {
            slotProducts = (0, concept_product_picker_util_1.resolveConceptProductSelection)({
                llmItems: raw.items ?? [],
                conceptTitle,
                conceptComposition,
                brief,
                catalog: pool,
                desiredCount: fillTarget,
                blockedIds,
                blockedVariants,
                brandColors,
            });
        }
        const merged = [];
        const mergedTypes = new Set();
        for (const p of [...keywordProducts, ...slotProducts]) {
            const type = (0, concept_diversity_util_1.detectConceptProductType)(p);
            if (merged.some((m) => m.id === p.id))
                continue;
            if ((0, concept_diversity_util_1.typeConflictsInSet)(mergedTypes, type))
                continue;
            merged.push(p);
            mergedTypes.add(type);
            if (merged.length >= fillTarget)
                break;
        }
        return merged;
    }
    fixSetCohesion(products, pool, usedProductIds, usedVariantKeys, brandColors, brief, conceptTitle) {
        if (products.length === 0)
            return products;
        const { scoreSetCohesion, tryFixSetOutlier } = require('../providers/llm/set-cohesion.util');
        const cohesion = scoreSetCohesion(products, { brief, brandColors });
        if (cohesion.outlierIndex !== null && cohesion.score < 55) {
            const fixed = tryFixSetOutlier(products, cohesion.outlierIndex, pool, usedProductIds, usedVariantKeys, brandColors, brief);
            if (fixed) {
                this.logger.log(`Set cohesion fix "${conceptTitle}": replaced ${products[cohesion.outlierIndex]?.name} (${cohesion.reason})`);
                return fixed;
            }
        }
        return products;
    }
    refillEmptyConceptProducts(concepts, catalog, desiredCount, usedProductIds, usedVariantKeys, diversityTracker, budgetPerSet, brief, brandColors = []) {
        const mandatoryTypes = (0, mandatory_types_util_1.resolveMandatoryTypesForBrief)(brief);
        for (let i = 0; i < concepts.length; i++) {
            if (concepts[i].catalogProducts?.length)
                continue;
            const concept = concepts[i];
            let pool = catalog.filter((p) => !usedProductIds.has(p.id) && !usedVariantKeys.has((0, catalog_variant_util_1.productVariantKey)(p)));
            if (!pool.length)
                continue;
            if (budgetPerSet != null && budgetPerSet > 0) {
                const affordable = pool.filter((p) => (p.price ?? 0) <= budgetPerSet);
                if (affordable.length >= desiredCount)
                    pool = affordable;
            }
            const colorScore = (0, catalog_color_match_util_1.buildBrandColorScoreFn)(brandColors);
            let products = (0, concept_product_picker_util_1.ensureConceptProducts)([], pool, desiredCount, {
                title: concept.title,
                composition: concept.composition ?? concept.description ?? '',
                brief,
                style: concept.style,
            }, usedProductIds, usedVariantKeys, diversityTracker, i * 53, false, (p) => (0, catalog_brief_relevance_util_1.scoreBriefRelevance)(p, brief, brandColors) + colorScore(p), mandatoryTypes);
            if (!products.length)
                continue;
            products = (0, catalog_variant_util_1.upgradeToBrandColorVariants)(products, catalog, brandColors);
            products.forEach((p) => {
                usedProductIds.add(p.id);
                usedVariantKeys.add((0, catalog_variant_util_1.productVariantKey)(p));
            });
            concepts[i] = this.mapProductsToConcept(concept.title, concept.composition ?? concept.description, concept.style, products, true, i, concept.narrative, concept.whyItFits, brandColors);
            this.logger.log(`Refilled concept "${concept.title}" with ${products.length} products`);
        }
    }
    mapProductsToConcept(title, composition, style, products, usedFallback, index, narrativeOverride, whyItFitsOverride, brandColors = [], selectionReport, budgetPerSet = null) {
        const catalogProducts = products.map((p) => {
            const realImage = (0, selection_constraints_2.hasValidProductImage)(p);
            const resolvedImage = (0, product_image_util_1.resolveCatalogImageUrl)(p);
            return {
                id: p.id,
                name: p.name,
                category: p.category,
                productType: (0, product_role_util_1.detectProductRole)(p).legacyType,
                price: p.price,
                stockAvailable: p.stockAvailable,
                colors: (p.colors ?? [])
                    .map((c) => (typeof c === 'string' ? c : typeof c.name === 'string' ? c.name : ''))
                    .filter(Boolean),
                targetColor: (0, catalog_color_match_util_1.pickCatalogColorNameForBrand)(p, brandColors),
                catalogImageUrl: resolvedImage,
                imageUrl: resolvedImage,
                image: resolvedImage,
                hasCatalogImage: realImage,
                sourceUrl: p.sourceUrl ?? null,
            };
        });
        const previewProductImageUrls = catalogProducts
            .map((p) => p.catalogImageUrl)
            .filter(Boolean);
        const narrative = narrativeOverride ??
            [composition, style ? `Стиль: ${style}` : ''].filter(Boolean).join('\n\n');
        const validationRisks = selectionReport?.violations.map((v) => v.message) ?? [];
        const validationRepairs = selectionReport?.repairs.map((r) => `${r.action}: ${r.reason}`) ?? [];
        const qualityScore = selectionReport
            ? (0, selection_constraints_1.scoreConceptSetQuality)(selectionReport, products)
            : usedFallback
                ? 70
                : 85 - index;
        return {
            title,
            narrative,
            description: composition || title,
            items: [],
            styleTags: style ? [style] : ['Каталог'],
            colorPalette: brandColors.length ? [...brandColors] : [],
            whyItFits: whyItFitsOverride ?? composition?.slice(0, 200) ?? '',
            score: qualityScore,
            risks: validationRisks.length ? validationRisks : undefined,
            suggestedEdits: validationRepairs.length ? validationRepairs : undefined,
            previewImageUrl: previewProductImageUrls[0],
            previewProductImageUrls,
            productIds: products.map((p) => p.id),
            catalogProducts,
            composition,
            style,
            budgetPerSet,
        };
    }
};
exports.CatalogConceptService = CatalogConceptService;
exports.CatalogConceptService = CatalogConceptService = CatalogConceptService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [llm_brief_service_1.LlmBriefService,
        llm_provider_1.LlmProviderFactory,
        config_1.ConfigService,
        catalog_ideator_agent_1.CatalogIdeatorAgent,
        catalog_critic_agent_1.CatalogCriticAgent,
        openrouter_agent_client_1.OpenrouterAgentClient])
], CatalogConceptService);
//# sourceMappingURL=catalog-concept.service.js.map
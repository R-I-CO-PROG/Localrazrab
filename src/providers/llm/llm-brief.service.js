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
var LlmBriefService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.LlmBriefService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../../prisma/prisma.service");
const llm_provider_1 = require("./llm.provider");
const openrouter_llm_provider_1 = require("./openrouter-llm.provider");
const llm_prompts_1 = require("./llm-prompts");
const catalog_util_1 = require("./catalog.util");
const parse_desired_count_1 = require("./parse-desired-count");
const set_budget_util_1 = require("./set-budget.util");
const catalog_filter_util_1 = require("./catalog-filter.util");
const catalog_brief_relevance_util_1 = require("./catalog-brief-relevance.util");
const catalog_index_util_1 = require("./catalog-index.util");
const catalog_brief_search_util_1 = require("./catalog-brief-search.util");
const catalog_pipeline_cache_util_1 = require("./catalog-pipeline-cache.util");
const catalog_slot_picker_util_1 = require("./catalog-slot-picker.util");
const respect_user_products_1 = require("./respect-user-products");
const local_scene_prompt_1 = require("./local-scene-prompt");
const finalize_scene_output_1 = require("./finalize-scene-output");
const parse_brief_util_1 = require("../../requests/parse-brief.util");
let LlmBriefService = LlmBriefService_1 = class LlmBriefService {
    constructor(config, prisma, llmFactory) {
        this.config = config;
        this.prisma = prisma;
        this.llmFactory = llmFactory;
        this.logger = new common_1.Logger(LlmBriefService_1.name);
        this.catalogCache = null;
        this.catalogCacheTtlMs = 5 * 60 * 1000;
    }
    onModuleInit() {
        void this.warmCatalogCache();
    }
    async warmCatalogCache() {
        try {
            const count = await this.prisma.product.count();
            this.logger.log(`Catalog warmup: ${count} products in DB`);
        }
        catch (err) {
            this.logger.warn(`Catalog warmup failed: ${err instanceof Error ? err.message : err}`);
        }
    }
    async prepareCatalogPipeline(input, stratifiedMax = 280, timing) {
        const cacheTtl = Number(this.config.get('CATALOG_PIPELINE_CACHE_TTL_MS', '300000')) || 300_000;
        const cacheKey = (0, catalog_pipeline_cache_util_1.catalogPipelineCacheKey)(input, stratifiedMax);
        const cached = (0, catalog_pipeline_cache_util_1.getCachedCatalogPipeline)(cacheKey, cacheTtl);
        if (cached) {
            this.logger.log(`Catalog pipeline cache hit (${cached.relevance.length} relevance SKU)`);
            timing?.lap('prepareCatalogPipeline_cache_hit');
            return cached;
        }
        const totalInDb = await this.prisma.product.count();
        timing?.lap('prepareCatalogPipeline_db_count');
        const budgetPerSet = input.budgetPerSet ?? (0, set_budget_util_1.resolveBudgetPerSet)(input.budgetMin, input.budgetMax);
        const itemCount = (0, catalog_filter_util_1.resolveTargetItemCount)(input);
        const priceCap = budgetPerSet ?? input.budgetMax ?? input.budgetMin ?? null;
        const tirage = input.quantity ?? 0;
        const where = {};
        if (priceCap != null && priceCap > 0) {
            where.OR = [{ price: null }, { price: { lte: priceCap } }];
        }
        if (tirage > 0) {
            where.stockAvailable = { gte: tirage };
        }
        if (input.blacklistedProductIds?.length) {
            where.id = { notIn: input.blacklistedProductIds };
        }
        const briefSearch = (0, catalog_brief_search_util_1.buildPrismaBriefSearchFilter)(input.userPrompt);
        const sqlRelevanceLimit = Number(this.config.get('CATALOG_SQL_RELEVANCE_LIMIT', '20000')) || 20000;
        const broadLoadCap = Number(this.config.get('CATALOG_PIPELINE_LOAD_CAP', '35000')) || 35000;
        const filteredMax = Number(this.config.get('CATALOG_FILTERED_MAX', '15000')) || 15000;
        const relevanceMax = Number(this.config.get('CATALOG_RELEVANCE_MAX', '12000')) || 12000;
        const alwaysBroaden = this.config.get('CATALOG_ALWAYS_BROADEN_POOL', 'true') !== 'false';
        const loadCapTarget = briefSearch ? sqlRelevanceLimit : broadLoadCap;
        const baseWhere = briefSearch
            ? { AND: [where, briefSearch] }
            : where;
        const matchCount = await this.prisma.product.count({ where: baseWhere });
        const loadCap = Math.min(matchCount, loadCapTarget);
        const dbBatch = 5_000;
        const candidates = [];
        let cursorId;
        const productSelect = {
            id: true,
            name: true,
            category: true,
            subcategory: true,
            description: true,
            sourceId: true,
            externalId: true,
            price: true,
            currency: true,
            stockAvailable: true,
            colors: true,
            silhouetteImageUrl: true,
            catalogImageUrl: true,
            sourceUrl: true,
        };
        while (candidates.length < loadCap) {
            const take = Math.min(dbBatch, loadCap - candidates.length);
            const rows = await this.prisma.product.findMany({
                where: baseWhere,
                select: productSelect,
                orderBy: { id: 'asc' },
                take,
                ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
            });
            if (!rows.length)
                break;
            for (const p of rows) {
                candidates.push(this.mapProductRow(p));
            }
            cursorId = rows[rows.length - 1].id;
            if (rows.length < take)
                break;
        }
        timing?.lap('prepareCatalogPipeline_db_load');
        let filtered = (0, catalog_filter_util_1.filterCatalogForRequest)(candidates, input);
        const MIN_HEALTHY_POOL = 150;
        if (briefSearch && (alwaysBroaden || filtered.length < MIN_HEALTHY_POOL)) {
            const broadCap = Math.min(await this.prisma.product.count({ where }), broadLoadCap);
            const broad = [];
            let broadCursor;
            while (broad.length < broadCap) {
                const take = Math.min(dbBatch, broadCap - broad.length);
                const rows = await this.prisma.product.findMany({
                    where,
                    select: productSelect,
                    orderBy: { id: 'asc' },
                    take,
                    ...(broadCursor ? { cursor: { id: broadCursor }, skip: 1 } : {}),
                });
                if (!rows.length)
                    break;
                for (const p of rows)
                    broad.push(this.mapProductRow(p));
                broadCursor = rows[rows.length - 1].id;
                if (rows.length < take)
                    break;
            }
            const broadFiltered = (0, catalog_filter_util_1.filterCatalogForRequest)(broad, input);
            const seen = new Set(filtered.map((p) => p.id));
            const added = broadFiltered.filter((p) => !seen.has(p.id));
            filtered = [...filtered, ...added];
            this.logger.warn(`Brief pool broadened${alwaysBroaden ? ' (always)' : ' (narrow)'}: +${added.length} → ${filtered.length}`);
        }
        if (filtered.length > filteredMax) {
            filtered = await (0, catalog_filter_util_1.shortlistCatalogForLlm)(filtered, input, filteredMax);
        }
        timing?.lap('prepareCatalogPipeline_js_filter');
        let relevance = (0, catalog_brief_relevance_util_1.filterCatalogByBriefRelevance)(filtered, input.userPrompt, input.colors);
        if (relevance.length > relevanceMax) {
            relevance = await (0, catalog_filter_util_1.shortlistCatalogForLlm)(relevance, input, relevanceMax);
        }
        timing?.lap('prepareCatalogPipeline_relevance');
        const forLlm = await (0, catalog_index_util_1.stratifiedCatalogForLlm)(relevance, input, stratifiedMax);
        timing?.lap('prepareCatalogPipeline_stratified');
        const overview = (0, catalog_index_util_1.buildCatalogOverview)(relevance, totalInDb);
        const typeIndex = (0, catalog_slot_picker_util_1.indexCatalogByProductType)(relevance);
        timing?.lap('prepareCatalogPipeline_type_index');
        if (relevance.length > 0 &&
            this.config.get('CATALOG_TYPE_COVERAGE_DIAG', 'false') === 'true') {
            const { analyzeTypeCoverage } = require('./catalog-type-coverage.diagnostic');
            const coverage = analyzeTypeCoverage(relevance);
            if (coverage.otherPercent > 15) {
                this.logger.warn(`Type coverage: ${coverage.otherPercent}% товаров → "other" (${coverage.other}/${coverage.total}). ` +
                    `Top unmatched categories: ${coverage.topOtherCategories.slice(0, 5).map((c) => `${c.category}(${c.count})`).join(', ')}`);
            }
            else {
                this.logger.log(`Type coverage OK: ${coverage.otherPercent}% other (${coverage.other}/${coverage.total})`);
            }
        }
        const result = {
            totalInDb,
            filtered,
            relevance,
            forLlm,
            overview,
            typeIndex,
        };
        (0, catalog_pipeline_cache_util_1.setCachedCatalogPipeline)(cacheKey, result);
        this.logger.log(`Catalog pipeline: ${totalInDb} in DB, ${matchCount} SQL match, ` +
            `${filtered.length} filtered, ${relevance.length} relevance, ` +
            `${overview.categories.length} categories`);
        return result;
    }
    isRealLlmEnabled() {
        const provider = this.config.get('LLM_PROVIDER', 'openrouter');
        if (provider === 'stub')
            return false;
        if (provider === 'openrouter') {
            return Boolean(this.config.get('OPENROUTER_API_KEY')?.trim());
        }
        if (provider === 'gemini')
            return Boolean(this.config.get('GEMINI_API_KEY')?.trim());
        if (provider === 'deepseek')
            return Boolean(this.config.get('DEEPSEEK_API_KEY')?.trim());
        return false;
    }
    mapProductRow(p) {
        return {
            id: p.id,
            name: p.name,
            category: p.category,
            subcategory: p.subcategory,
            description: p.description,
            sourceId: p.sourceId,
            externalId: p.externalId,
            price: p.price,
            currency: p.currency,
            stockAvailable: p.stockAvailable ?? undefined,
            colors: Array.isArray(p.colors) ? p.colors : [],
            silhouetteImageUrl: p.silhouetteImageUrl,
            catalogImageUrl: p.catalogImageUrl,
            imageUrl: p.catalogImageUrl || p.silhouetteImageUrl || null,
            sourceUrl: p.sourceUrl,
        };
    }
    async loadProductsByIds(ids) {
        const unique = [...new Set(ids.filter(Boolean))];
        if (!unique.length)
            return [];
        const rows = await this.prisma.product.findMany({ where: { id: { in: unique } } });
        const byId = new Map(rows.map((p) => [p.id, this.mapProductRow(p)]));
        return unique.map((id) => byId.get(id)).filter((p) => Boolean(p));
    }
    async loadFullCatalog() {
        const now = Date.now();
        if (this.catalogCache && now - this.catalogCache.at < this.catalogCacheTtlMs) {
            return this.catalogCache.data;
        }
        const rows = await this.prisma.product.findMany({
            orderBy: { name: 'asc' },
            select: {
                id: true,
                name: true,
                category: true,
                subcategory: true,
                description: true,
                sourceId: true,
                externalId: true,
                price: true,
                currency: true,
                stockAvailable: true,
                colors: true,
                silhouetteImageUrl: true,
                catalogImageUrl: true,
                sourceUrl: true,
            },
        });
        const data = rows.map((p) => this.mapProductRow(p));
        this.catalogCache = { at: now, data };
        return data;
    }
    async loadCatalog(allowedItems, forbiddenItems) {
        const all = await this.loadFullCatalog();
        return (0, catalog_util_1.filterCatalogByConstraints)(all, allowedItems, forbiddenItems);
    }
    buildInput(params) {
        const desiredItemCount = params.desiredItemCount ?? (0, parse_desired_count_1.defaultItemCount)(params.userPrompt);
        return {
            userPrompt: params.userPrompt,
            category: params.category,
            quantity: params.quantity,
            budgetMin: params.budgetMin,
            budgetMax: params.budgetMax,
            colors: params.colors,
            allowedItems: params.allowedItems,
            forbiddenItems: params.forbiddenItems,
            productNames: params.productNames,
            catalogProducts: params.catalog,
            desiredItemCount,
            hasLogo: params.hasLogo,
            logoUrl: params.logoUrl,
            notes: params.notes,
            sceneOnly: params.sceneOnly,
            creativeMode: params.creativeMode,
            catalogConceptsMode: params.catalogConceptsMode,
            productAddMode: params.productAddMode,
            mandatoryConceptTypes: params.mandatoryConceptTypes,
        };
    }
    async parseBriefFromPrompt(userPrompt) {
        const text = userPrompt.trim();
        const local = (0, parse_brief_util_1.parseBriefLocally)(text);
        if (text.length < 8) {
            return { ...local, source: 'local' };
        }
        const chain = this.llmFactory.getBriefParseProviderChain();
        const llmInput = {
            userPrompt: text,
            category: 'Welcome Pack',
            colors: [],
            allowedItems: [],
            forbiddenItems: [],
            productNames: [],
            briefParseMode: true,
        };
        for (const { name, provider } of chain) {
            try {
                const started = Date.now();
                this.logger.log(`LLM [brief-parse] trying ${name}…`);
                const output = await provider.generate(llmInput);
                const llmPartial = this.mapLlmBriefParseOutput(output);
                const merged = (0, parse_brief_util_1.mergeParsedBrief)(text, local, llmPartial);
                this.logger.log(`LLM [brief-parse] OK: ${name} (${Date.now() - started}ms)`);
                return { ...merged, source: merged.updatedFields.length > local.updatedFields.length ? 'hybrid' : 'local' };
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                this.logger.warn(`LLM [brief-parse] ${name} failed: ${msg.slice(0, 140)}`);
            }
        }
        return { ...local, source: 'local' };
    }
    mapLlmBriefParseOutput(output) {
        try {
            const p = JSON.parse(output.composition);
            return {
                category: p.category,
                quantity: typeof p.quantity === 'number' ? p.quantity : undefined,
                setItemCount: typeof p.set_item_count === 'number' ? p.set_item_count : undefined,
                budgetMin: typeof p.budget_min === 'number' ? p.budget_min : undefined,
                budgetMax: typeof p.budget_max === 'number' ? p.budget_max : undefined,
                budgetScope: p.budget_scope === 'per_set' || p.budget_scope === 'total' ? p.budget_scope : undefined,
                colors: Array.isArray(p.colors) ? p.colors : undefined,
                allowedItems: Array.isArray(p.allowed_items)
                    ? p.allowed_items
                    : undefined,
                namedItems: Array.isArray(p.named_items)
                    ? p.named_items.filter((x) => typeof x === 'string')
                    : undefined,
                forbiddenItems: Array.isArray(p.forbidden_items)
                    ? p.forbidden_items
                    : undefined,
                alternativeTypeGroups: Array.isArray(p.alternative_type_groups)
                    ? p.alternative_type_groups.filter((g) => Array.isArray(g) && g.length >= 2)
                    : undefined,
                notes: p.notes,
            };
        }
        catch {
            return {};
        }
    }
    async interpretForSuggest(input, eligibleCatalog) {
        return this.interpret(input, eligibleCatalog, { mode: 'suggest' });
    }
    async interpretForProductAdd(input, eligibleCatalog) {
        return this.interpret({ ...input, productAddMode: true, suggestMode: false }, eligibleCatalog, { mode: 'suggest' });
    }
    async interpretForGeneration(input, eligibleCatalog) {
        return this.interpret(input, eligibleCatalog, { mode: 'generation' });
    }
    async interpret(input, eligibleCatalog, options = {}) {
        const mode = options.mode ?? 'generation';
        const desiredCount = input.desiredItemCount ?? (0, parse_desired_count_1.defaultItemCount)(input.userPrompt);
        const strictCount = (0, parse_desired_count_1.parseDesiredItemCount)(input.userPrompt) !== null;
        const respectUser = this.config.get('LLM_RESPECT_USER_PRODUCTS', 'true') === 'true' &&
            (0, respect_user_products_1.shouldRespectUserProducts)({ ...input, desiredItemCount: desiredCount });
        const isSuggest = mode === 'suggest' && !input.productAddMode;
        const isProductAdd = Boolean(input.productAddMode);
        const creativeMode = isSuggest ? false : (input.creativeMode ?? false);
        const sceneOnly = !creativeMode &&
            !isSuggest &&
            !isProductAdd &&
            mode === 'generation' &&
            respectUser &&
            input.productNames.length > 0;
        const llmInput = {
            ...input,
            sceneOnly,
            creativeMode,
            suggestMode: isSuggest,
            productAddMode: isProductAdd,
        };
        const userPayload = (0, llm_prompts_1.buildLlmUserPayload)({ ...llmInput, desiredItemCount: desiredCount }, {
            respectUserProducts: respectUser || sceneOnly,
            suggestMode: isSuggest,
            productAddMode: isProductAdd,
            currentSetProducts: input.currentSetProductNames,
            addRequest: isProductAdd ? input.addRequestHint ?? input.userPrompt : undefined,
        });
        let providerName = 'unknown';
        let output;
        let usedFallback = false;
        let error = null;
        let modelUsed = null;
        const catalogSize = llmInput.catalogProducts?.length ?? 0;
        if (mode === 'suggest' || isProductAdd) {
            const chain = this.llmFactory.getGenerationProviderChain();
            const llmErrors = [];
            let resolved = null;
            this.logger.log(`LLM [suggest]: chain=[${chain.map((c) => c.name).join(' → ') || 'none'}], catalog=${catalogSize}`);
            for (const { name, provider } of chain) {
                try {
                    const started = Date.now();
                    this.logger.log(`LLM [suggest] trying ${name}…`);
                    resolved = await provider.generate(llmInput);
                    providerName = name;
                    modelUsed = provider instanceof openrouter_llm_provider_1.OpenrouterLlmProvider ? provider.lastModelUsed : name;
                    this.logger.log(`LLM [suggest] OK: ${name} (${Date.now() - started}ms)`);
                    break;
                }
                catch (err) {
                    const msg = err instanceof Error ? err.message : String(err);
                    llmErrors.push(`${name}: ${msg.slice(0, 100)}`);
                    this.logger.warn(`LLM [suggest] ${name} failed: ${msg.slice(0, 140)}`);
                }
            }
            if (resolved) {
                output = isProductAdd
                    ? resolved
                    : sceneOnly && !creativeMode
                        ? (0, finalize_scene_output_1.finalizeCatalogSceneLlmOutput)(resolved)
                        : (0, finalize_scene_output_1.finalizeSceneLlmOutput)(resolved, llmInput.colors);
            }
            else {
                error = llmErrors.join(' | ') || 'No LLM providers configured';
                this.logger.warn(`LLM [suggest] fallback stub: ${error}`);
                output = await this.llmFactory.getStubProvider().generate(llmInput);
                usedFallback = true;
                providerName = 'stub-suggest';
                modelUsed = 'stub';
            }
        }
        else {
            const chain = this.llmFactory.getGenerationProviderChain();
            const llmErrors = [];
            let resolved = null;
            this.logger.log(`LLM [generation]: chain=[${chain.map((c) => c.name).join(' → ') || 'none'}], sceneOnly=${sceneOnly}, creative=${creativeMode}`);
            for (const { name, provider } of chain) {
                try {
                    const started = Date.now();
                    this.logger.log(`LLM [generation] trying ${name}…`);
                    resolved = await provider.generate(llmInput);
                    providerName = name;
                    modelUsed = provider instanceof openrouter_llm_provider_1.OpenrouterLlmProvider ? provider.lastModelUsed : name;
                    this.logger.log(`LLM [generation] OK: ${name} (${Date.now() - started}ms)`);
                    break;
                }
                catch (err) {
                    const msg = err instanceof Error ? err.message : String(err);
                    llmErrors.push(`${name}: ${msg.slice(0, 100)}`);
                    this.logger.warn(`LLM [generation] ${name} failed: ${msg.slice(0, 140)}`);
                }
            }
            if (resolved) {
                output =
                    sceneOnly && !creativeMode
                        ? (0, finalize_scene_output_1.finalizeCatalogSceneLlmOutput)(resolved)
                        : (0, finalize_scene_output_1.finalizeSceneLlmOutput)(resolved, llmInput.colors);
            }
            else {
                const allowLocal = this.config.get('LLM_GENERATION_FALLBACK_LOCAL', 'true') === 'true';
                error = llmErrors.join(' | ') || 'No LLM providers configured';
                if (!allowLocal) {
                    this.logger.error(`LLM generation failed: ${error}`);
                    throw new Error(error);
                }
                this.logger.warn(creativeMode
                    ? `Все LLM недоступны (${error}) — локальный промпт творчества`
                    : `Все LLM недоступны (${error}) — локальный промпт сцены (товары не меняются)`);
                output =
                    sceneOnly && !creativeMode
                        ? (0, finalize_scene_output_1.finalizeCatalogSceneLlmOutput)((0, local_scene_prompt_1.buildLocalCatalogSceneGenerationOutput)({ ...llmInput, sceneOnly: true }))
                        : (0, finalize_scene_output_1.finalizeSceneLlmOutput)(creativeMode
                            ? (0, local_scene_prompt_1.buildLocalCreativeGenerationOutput)(llmInput)
                            : (0, local_scene_prompt_1.buildLocalSceneGenerationOutput)({ ...llmInput, sceneOnly: true }), llmInput.colors);
                usedFallback = true;
                providerName = creativeMode ? 'local-creative' : 'local-scene';
                modelUsed = 'local';
            }
        }
        if (creativeMode) {
            return {
                output: { ...output, items: output.items ?? [] },
                products: [],
                provider: usedFallback
                    ? providerName
                    : modelUsed
                        ? `${providerName}/${modelUsed}`
                        : providerName,
                modelUsed,
                usedFallback,
                error,
                userPayload,
            };
        }
        const pickFrom = eligibleCatalog && eligibleCatalog.length > 0
            ? eligibleCatalog
            : (0, catalog_util_1.filterCatalogByConstraints)(input.catalogProducts ?? [], input.allowedItems, input.forbiddenItems);
        let products = (0, catalog_util_1.resolveLlmProductSelection)(output.items, pickFrom, input.productNames, respectUser, desiredCount, strictCount, isProductAdd
            ? {
                excludeVariantKeys: new Set(input.excludeVariantKeys ?? []),
                brandColors: input.colors,
            }
            : undefined);
        const shouldEnforceSet = !isProductAdd &&
            !sceneOnly &&
            !(respectUser && input.productNames.length > 0);
        if (shouldEnforceSet) {
            const budgetPerSet = (0, set_budget_util_1.resolveBudgetPerSet)(input.budgetMin, input.budgetMax);
            products = (0, set_budget_util_1.enforceSingleSetComposition)(products, pickFrom, desiredCount, budgetPerSet, isSuggest ? 11 : 29, input.userPrompt, output.composition ?? '');
        }
        output = {
            ...output,
            items: products.map((p) => p.name),
        };
        const providerLabel = usedFallback
            ? providerName
            : modelUsed
                ? `${providerName}/${modelUsed}`
                : providerName;
        return {
            output,
            products,
            provider: providerLabel,
            modelUsed,
            usedFallback,
            error,
            userPayload,
        };
    }
    getSystemPrompt(respectUserProducts, creativeMode = false) {
        if (creativeMode)
            return (0, llm_prompts_1.buildLlmSystemPromptForCreative)();
        return (0, llm_prompts_1.buildLlmSystemPrompt)(respectUserProducts);
    }
    getUserMessage(userPayload) {
        return (0, llm_prompts_1.buildLlmUserMessage)(userPayload);
    }
};
exports.LlmBriefService = LlmBriefService;
exports.LlmBriefService = LlmBriefService = LlmBriefService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        prisma_service_1.PrismaService,
        llm_provider_1.LlmProviderFactory])
], LlmBriefService);
//# sourceMappingURL=llm-brief.service.js.map
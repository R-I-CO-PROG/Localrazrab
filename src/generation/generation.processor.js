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
var GenerationProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GenerationProcessor = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const bullmq_1 = require("bullmq");
const path_1 = require("path");
const fs_1 = require("fs");
const prisma_service_1 = require("../prisma/prisma.service");
const llm_provider_1 = require("../providers/llm/llm.provider");
const image_provider_1 = require("../providers/image/image.provider");
const generation_queue_1 = require("./generation.queue");
const client_1 = require("@prisma/client");
const prompt_builder_1 = require("./prompt-builder");
const logo_reference_util_1 = require("./logo-reference.util");
const llm_brief_service_1 = require("../providers/llm/llm-brief.service");
const catalog_filter_util_1 = require("../providers/llm/catalog-filter.util");
const respect_user_products_1 = require("../providers/llm/respect-user-products");
const parse_desired_count_1 = require("../providers/llm/parse-desired-count");
const catalog_ai_image_prompt_1 = require("./catalog-ai-image-prompt");
const llm_image_prompt_1 = require("./llm-image-prompt");
const concept_prompt_service_1 = require("../agents/concept-prompt.service");
const agent_run_queue_1 = require("../agents/agent-run.queue");
const persist_result_image_util_1 = require("./persist-result-image.util");
const generation_output_path_util_1 = require("./generation-output-path.util");
const concept_result_util_1 = require("./concept-result.util");
const refine_visualization_processor_1 = require("./refine-visualization.processor");
const openrouter_image_provider_1 = require("../providers/image/openrouter-image.provider");
const product_image_util_1 = require("../products/product-image.util");
const resolve_snapshot_products_1 = require("./resolve-snapshot-products");
const catalog_product_color_rules_util_1 = require("./catalog-product-color-rules.util");
const creative_merch_visual_util_1 = require("./creative-merch-visual.util");
function getUploadsDir() {
    return process.env.UPLOADS_DIR || (0, path_1.join)(process.cwd(), '../../uploads');
}
let GenerationProcessor = GenerationProcessor_1 = class GenerationProcessor {
    constructor(config, prisma, llmFactory, llmBrief, imageFactory, conceptPrompt, openrouter) {
        this.config = config;
        this.prisma = prisma;
        this.llmFactory = llmFactory;
        this.llmBrief = llmBrief;
        this.imageFactory = imageFactory;
        this.conceptPrompt = conceptPrompt;
        this.openrouter = openrouter;
        this.logger = new common_1.Logger(GenerationProcessor_1.name);
        this.worker = null;
    }
    onModuleInit() {
        const redisUrl = this.config.get('REDIS_URL', 'redis://localhost:6379');
        const aiKeys = [
            this.config.get('OPENROUTER_API_KEY')?.trim() && 'openrouter',
            this.config.get('HUGGINGFACE_API_KEY')?.trim() && 'huggingface',
        ].filter(Boolean);
        this.logger.log(`Providers: LLM=${this.config.get('LLM_PROVIDER')}, IMAGE=${this.config.get('IMAGE_PROVIDER')}, ` +
            `AI keys=[${aiKeys.length ? aiKeys.join(',') : 'NONE — mockup only'}]`);
        this.worker = new bullmq_1.Worker(generation_queue_1.GENERATION_QUEUE, async (job) => this.process(job), {
            connection: { url: redisUrl },
            lockDuration: Number(this.config.get('GENERATION_LOCK_MS')) || 900_000,
            stalledInterval: 120_000,
            concurrency: Number(this.config.get('GENERATION_CONCURRENCY', '2')) || 2,
        });
        this.worker.on('failed', (job, err) => {
            this.logger.error(`Job ${job?.id} failed: ${err.message}`);
        });
        this.logger.log('Generation worker started');
    }
    async onModuleDestroy() {
        await this.worker?.close();
    }
    buildLlmInput(snapshot) {
        return {
            userPrompt: snapshot.userPrompt ?? '',
            category: snapshot.category ?? '',
            quantity: snapshot.quantity,
            budgetMin: snapshot.budgetMin,
            budgetMax: snapshot.budgetMax,
            colors: snapshot.colors ?? [],
            allowedItems: snapshot.allowedItems ?? [],
            forbiddenItems: snapshot.forbiddenItems ?? [],
            productNames: snapshot.productNames ?? [],
            hasLogo: Boolean(snapshot.hasLogo),
            logoUrl: snapshot.logoUrl ?? null,
            notes: snapshot.notes ?? null,
        };
    }
    async process(job) {
        if (job.data.jobType === 'refine') {
            return this.processRefine(job);
        }
        const { generationId, requestId, debug, mode: jobMode } = job.data;
        this.logger.log(`Processing generation ${generationId} (mode=${jobMode ?? 'mockup'}, debug=${debug})`);
        await this.prisma.generation.update({
            where: { id: generationId },
            data: { status: client_1.GenerationStatus.generating, startedAt: new Date() },
        });
        await job.updateProgress(5);
        let conceptPromptUsed = false;
        try {
            const generation = await this.prisma.generation.findUniqueOrThrow({
                where: { id: generationId },
            });
            const snapshot = generation.inputSnapshot;
            const baseLlmInput = this.buildLlmInput(snapshot);
            const generationModeEarly = snapshot.generationMode ?? jobMode ?? 'mockup';
            const aiStyle = snapshot.aiStyle ?? 'catalog';
            const isCreativeAi = generationModeEarly === 'ai' && aiStyle === 'creative';
            const openrouterImageModel = isCreativeAi
                ? (this.config.get('OPENROUTER_IMAGE_MODEL_FINAL') ??
                    'google/gemini-2.5-flash-image')
                : (this.config.get('OPENROUTER_IMAGE_MODEL_CATALOG') ??
                    'google/gemini-3-pro-image-preview');
            let fullCatalog = [];
            let eligibleCatalog = [];
            let respectUser = false;
            let catalogForLlm = [];
            if (!isCreativeAi) {
                const lockedProductIds = (snapshot.productIds ?? []).filter(Boolean);
                const filterInput = {
                    userPrompt: baseLlmInput.userPrompt,
                    quantity: baseLlmInput.quantity,
                    budgetMin: baseLlmInput.budgetMin,
                    budgetMax: baseLlmInput.budgetMax,
                    colors: baseLlmInput.colors,
                    allowedItems: baseLlmInput.allowedItems,
                    forbiddenItems: baseLlmInput.forbiddenItems,
                };
                if (lockedProductIds.length > 0) {
                    this.logger.log(`Catalog viz: ${lockedProductIds.length} locked SKU — skip full catalog load`);
                    fullCatalog = await this.llmBrief.loadProductsByIds(lockedProductIds);
                    eligibleCatalog = fullCatalog;
                    respectUser = true;
                    catalogForLlm = fullCatalog;
                }
                else {
                    fullCatalog = await this.llmBrief.loadFullCatalog();
                    eligibleCatalog = (0, catalog_filter_util_1.filterCatalogForRequest)(fullCatalog, filterInput);
                    const desiredCount = (0, parse_desired_count_1.defaultItemCount)(baseLlmInput.userPrompt);
                    respectUser =
                        this.config.get('LLM_RESPECT_USER_PRODUCTS', 'true') === 'true' &&
                            (0, respect_user_products_1.shouldRespectUserProducts)({
                                ...baseLlmInput,
                                catalogProducts: fullCatalog,
                                desiredItemCount: desiredCount,
                            });
                    catalogForLlm =
                        respectUser && baseLlmInput.productNames.length > 0
                            ? fullCatalog.filter((p) => baseLlmInput.productNames.includes(p.name))
                            : await (0, catalog_filter_util_1.shortlistCatalogForLlm)(eligibleCatalog, filterInput, 120);
                    if (respectUser && baseLlmInput.productNames.length > 0) {
                        this.logger.log(`LLM compact mode: ${catalogForLlm.length} user products (skip full catalog)`);
                    }
                }
            }
            else {
                this.logger.log('Creative mode: catalog skipped entirely');
            }
            let llmInput = this.llmBrief.buildInput({
                ...baseLlmInput,
                catalog: isCreativeAi ? [] : catalogForLlm,
                sceneOnly: !isCreativeAi && respectUser && baseLlmInput.productNames.length > 0,
                creativeMode: isCreativeAi,
            });
            if (isCreativeAi && (!llmInput.hasLogo || !llmInput.logoUrl)) {
                const fallbackLogo = await this.prisma.asset.findFirst({
                    where: { requestId, type: 'logo' },
                    select: { url: true },
                });
                if (fallbackLogo?.url) {
                    llmInput = { ...llmInput, hasLogo: true, logoUrl: fallbackLogo.url };
                    this.logger.warn(`Creative logo fallback applied from request assets (${fallbackLogo.url})`);
                }
                else {
                    this.logger.warn(`Creative generation without logo: no logo in snapshot and no logo asset for request ${requestId}`);
                }
            }
            const chosenIdeaTitle = snapshot.chosenIdeaTitle?.trim() || undefined;
            const useConceptPrompt = isCreativeAi && (0, agent_run_queue_1.isCreativeAgentPipelineEnabled)(this.config);
            let brief;
            let selectedConcept;
            if (useConceptPrompt) {
                if (!chosenIdeaTitle) {
                    throw new Error('Выберите концепцию перед генерацией фото');
                }
                await job.updateProgress(12);
                this.logger.log(`Creative: PromptBuilder for «${chosenIdeaTitle}» → OpenRouter ${openrouterImageModel}`);
                const { promptOutput, concept } = await this.conceptPrompt.buildPromptForGeneration(requestId, chosenIdeaTitle);
                selectedConcept = concept;
                conceptPromptUsed = true;
                const creativeProductNames = concept.items.map((i) => (0, creative_merch_visual_util_1.creativeProductDisplayName)(i));
                brief = {
                    output: {
                        image_prompt: promptOutput.imagePrompt,
                        negative_prompt: promptOutput.negativePrompt,
                        composition: concept.narrative || concept.description,
                        style: promptOutput.style,
                        items: creativeProductNames,
                    },
                    provider: 'agent-prompt-builder',
                    usedFallback: false,
                    error: null,
                    userPayload: {
                        mode: 'generation',
                        task: llmInput.userPrompt,
                        category: llmInput.category,
                        quantity: llmInput.quantity,
                        budget: { min: llmInput.budgetMin, max: llmInput.budgetMax },
                        colors: llmInput.colors,
                        brand_colors_hex: null,
                        products: [],
                        has_logo: llmInput.hasLogo,
                        logo_uploaded: llmInput.hasLogo,
                        lock_user_products: false,
                        chosenIdeaTitle,
                    },
                    modelUsed: 'openrouter/prompt-builder',
                    products: [],
                };
            }
            else {
                brief = await this.llmBrief.interpretForGeneration(llmInput, eligibleCatalog);
            }
            await job.updateProgress(35);
            const resolvedProducts = isCreativeAi
                ? []
                : (0, resolve_snapshot_products_1.resolveProductsFromSnapshot)(snapshot, fullCatalog, brief.products);
            const creativeProductNames = isCreativeAi
                ? (brief.output.items?.length
                    ? brief.output.items
                    : selectedConcept?.items.map((i) => (0, creative_merch_visual_util_1.creativeProductDisplayName)(i)) ?? [])
                : [];
            const llmOutput = {
                ...brief.output,
                items: isCreativeAi ? creativeProductNames : resolvedProducts.map((p) => p.name),
            };
            this.logger.log(`Image products (${isCreativeAi ? creativeProductNames.length : resolvedProducts.length}): ${isCreativeAi ? creativeProductNames.join(', ') : resolvedProducts.map((p) => p.name).join(', ')}`);
            const providerName = brief.provider;
            const usedFallback = brief.usedFallback;
            const llmError = brief.error;
            const userPayload = brief.userPayload;
            const usedRealLlm = conceptPromptUsed ||
                (!brief.provider.startsWith('stub') &&
                    (brief.provider === 'local-scene' ||
                        brief.provider.includes('gemini') ||
                        brief.provider.includes('openrouter') ||
                        brief.provider.includes('deepseek') ||
                        brief.provider.includes('agent-prompt') ||
                        !usedFallback));
            const productNames = isCreativeAi ? creativeProductNames : resolvedProducts.map((p) => p.name);
            const catalogImageUrls = (0, resolve_snapshot_products_1.resolveCatalogImageUrlsFromSnapshot)(snapshot, resolvedProducts);
            const silhouetteUrls = catalogImageUrls;
            const targetColorEntries = snapshot.productTargetColors ??
                [];
            const targetByProductId = Object.fromEntries(targetColorEntries.map((e) => [e.productId, e.color]));
            const catalogColorSpecs = !isCreativeAi
                ? (0, catalog_product_color_rules_util_1.buildCatalogProductColorSpecs)(resolvedProducts, targetByProductId)
                : [];
            const catalogColorRulesShort = (0, catalog_product_color_rules_util_1.formatCatalogColorRulesShort)(catalogColorSpecs);
            const genSnapshot = {
                userPrompt: llmInput.userPrompt,
                category: llmInput.category,
                quantity: llmInput.quantity,
                colors: llmInput.colors,
                productNames,
                hasLogo: llmInput.hasLogo,
                logoUrl: llmInput.logoUrl,
            };
            const finalPrompt = (0, prompt_builder_1.buildProductMockupPrompt)(llmOutput, genSnapshot);
            const compactPrompt = (0, prompt_builder_1.buildCompactImagePrompt)(llmOutput, genSnapshot);
            this.logger.log(`Image prompt: full=${finalPrompt.length} compact=${compactPrompt.length} chars`);
            const preImageLlmOutput = {
                items: llmOutput.items,
                composition: llmOutput.composition,
                style: llmOutput.style,
                image_prompt: llmOutput.image_prompt,
                negative_prompt: llmOutput.negative_prompt,
            };
            const generatedDir = (0, path_1.join)(getUploadsDir(), 'generated');
            if (!(0, fs_1.existsSync)(generatedDir))
                (0, fs_1.mkdirSync)(generatedDir, { recursive: true });
            const outputFilename = (0, generation_output_path_util_1.buildGenerationOutputFilename)(generationId, snapshot);
            const outputPath = (0, path_1.join)(generatedDir, outputFilename);
            const logoPublicUrl = snapshot.logoPublicUrl;
            const mockupProducts = resolvedProducts.map((p, i) => ({
                name: p.name,
                imageUrl: catalogImageUrls[i] ?? (0, product_image_util_1.resolveCatalogImageUrl)(p),
            }));
            const generationMode = generationModeEarly;
            const providerChain = this.imageFactory.getProviderChainForMode(generationMode, {
                aiStyle: isCreativeAi ? 'creative' : 'catalog',
            });
            const primaryProviderName = providerChain[0]?.name ?? 'mockup';
            const isMockupMode = generationMode === 'mockup';
            const isAiMode = generationMode === 'ai';
            const aiLogoHint = isAiMode && llmInput.hasLogo && llmInput.logoUrl
                ? await (0, logo_reference_util_1.describeLogoForPrompt)(llmInput.logoUrl)
                : '';
            const sceneBrief = snapshot.sceneBrief?.trim() || undefined;
            const logoPromptOptions = { deferLogoToPostComposite: false };
            const aiEnhancePrompt = isAiMode
                ? isCreativeAi
                    ? (0, llm_image_prompt_1.buildCreativeAiImagePrompt)(llmOutput, { ...genSnapshot, userPrompt: llmInput.userPrompt }, aiLogoHint || undefined, usedRealLlm, sceneBrief, { ...logoPromptOptions, conceptItems: selectedConcept?.items })
                    : (0, catalog_ai_image_prompt_1.buildCatalogAiImagePrompt)(llmOutput, { ...genSnapshot, userPrompt: llmInput.userPrompt }, aiLogoHint || undefined, usedRealLlm, catalogColorSpecs, sceneBrief, logoPromptOptions)
                : '';
            const aiEnhanceNegative = isAiMode
                ? isCreativeAi
                    ? (0, llm_image_prompt_1.buildCreativeAiNegativePrompt)(llmOutput, genSnapshot, usedRealLlm, logoPromptOptions)
                    : (0, catalog_ai_image_prompt_1.buildCatalogAiNegativePrompt)(llmOutput, genSnapshot, usedRealLlm, logoPromptOptions)
                : '';
            const openrouterConfigured = this.config.get('OPENROUTER_ENABLED', 'true') === 'true' &&
                Boolean(this.config.get('OPENROUTER_API_KEY', '').trim());
            const imageInput = {
                prompt: isAiMode ? aiEnhancePrompt : compactPrompt,
                negativePrompt: isAiMode ? aiEnhanceNegative : llmOutput.negative_prompt,
                outputPath,
                width: Number(this.config.get(isAiMode ? 'AI_ENHANCE_WIDTH' : isMockupMode ? 'MOCKUP_WIDTH' : 'IMAGE_WIDTH')) ||
                    (isAiMode ? 768 : 1024),
                height: Number(this.config.get(isAiMode ? 'AI_ENHANCE_HEIGHT' : isMockupMode ? 'MOCKUP_HEIGHT' : 'IMAGE_HEIGHT')) ||
                    (isAiMode ? 768 : 1024),
                referenceImageUrl: logoPublicUrl ?? undefined,
                productNames,
                products: mockupProducts,
                category: llmInput.category,
                quantity: llmInput.quantity,
                silhouetteUrls,
                catalogImageUrls,
                llmPickedProducts: productNames.length > 0 && baseLlmInput.productNames.length === 0,
                colors: llmInput.colors,
                logoUrl: llmInput.logoUrl,
                hasLogo: llmInput.hasLogo,
                userPrompt: llmInput.userPrompt,
                generationMode,
                aiStyle: (isCreativeAi ? 'creative' : 'catalog'),
                llmImagePrompt: isAiMode ? aiEnhancePrompt : undefined,
                llmComposition: isAiMode ? llmOutput.composition : undefined,
                llmStyle: isAiMode ? llmOutput.style : undefined,
                catalogColorRules: isAiMode && !isCreativeAi ? catalogColorRulesShort : undefined,
                onProgress: async (pct) => {
                    try {
                        await job.updateProgress(Math.min(99, Math.max(55, pct)));
                    }
                    catch {
                    }
                },
            };
            const pollinationsProvider = this.imageFactory.getPollinationsProvider();
            const aiPollinationsInput = isAiMode
                ? {
                    ...imageInput,
                    prompt: aiEnhancePrompt,
                    negativePrompt: aiEnhanceNegative,
                    imageModel: llmInput.hasLogo && logoPublicUrl ? 'flux' : 'flux',
                    referenceImageUrl: llmInput.hasLogo ? logoPublicUrl ?? undefined : undefined,
                }
                : imageInput;
            const pollinationsUrl = pollinationsProvider.buildImageUrl(isAiMode ? aiEnhancePrompt : compactPrompt, aiPollinationsInput);
            const partialDebug = debug
                ? {
                    llm: {
                        provider: providerName,
                        systemPrompt: this.llmBrief.getSystemPrompt(brief.userPayload.lock_user_products === true, isCreativeAi),
                        userPayload,
                        userMessage: this.llmBrief.getUserMessage(userPayload),
                        response: llmOutput,
                        resolvedProducts: productNames,
                        desiredItemCount: llmInput.desiredItemCount,
                        modelUsed: brief.modelUsed,
                        error: llmError,
                        usedFallback,
                        usedRealLlm,
                    },
                    image: {
                        status: 'pending',
                        provider: primaryProviderName,
                        promptFromLlm: llmOutput.image_prompt,
                        finalPrompt,
                        compactPrompt,
                        aiEnhancePrompt: isAiMode ? aiEnhancePrompt : undefined,
                        openrouterModel: isAiMode ? openrouterImageModel : undefined,
                        aiEnhanceNegative: isAiMode ? aiEnhanceNegative : undefined,
                        generationMode,
                        pollinationsUrl,
                        referenceImageUrl: logoPublicUrl ?? null,
                        providerChain: providerChain.map((c) => c.name),
                        openrouterConfigured,
                        mockupProducts,
                        logoNote: isAiMode
                            ? isCreativeAi
                                ? `OpenRouter creative: txt2img + логотип как референс → сцена с брендингом`
                                : `${openrouterImageModel}: фото каталога + логотип → единая AI-сцена с брендингом`
                            : 'Точный мокап из каталога',
                    },
                    inputSnapshot: snapshot,
                }
                : undefined;
            await this.prisma.generation.update({
                where: { id: generationId },
                data: {
                    llmOutput: partialDebug
                        ? { ...preImageLlmOutput, _debug: partialDebug }
                        : preImageLlmOutput,
                    imagePrompt: finalPrompt,
                    negativePrompt: llmOutput.negative_prompt,
                },
            });
            await job.updateProgress(55);
            let imageProviderUsed = primaryProviderName;
            let imageUsedFallback = false;
            let generatedOutput = null;
            const imageErrors = [];
            for (let i = 0; i < providerChain.length; i++) {
                const { name, provider } = providerChain[i];
                try {
                    this.logger.log(`Image provider [${i + 1}/${providerChain.length}]: ${name}`);
                    await job.updateProgress(60);
                    generatedOutput = await provider.generate(imageInput);
                    await job.updateProgress(85);
                    imageProviderUsed = name;
                    imageUsedFallback = i > 0;
                    break;
                }
                catch (err) {
                    const msg = err instanceof Error ? err.message : 'Unknown image error';
                    imageErrors.push(`${name}: ${msg}`);
                    this.logger.warn(`Image (${name}) failed: ${msg}`);
                    if (i === providerChain.length - 1) {
                        throw new Error(imageErrors.join(' | '));
                    }
                }
            }
            let logoOverlayApplied = false;
            if (!generatedOutput) {
                throw new Error('Image provider returned empty output');
            }
            let resultImageUrl;
            try {
                resultImageUrl = await (0, persist_result_image_util_1.persistGenerationResultImage)(generatedOutput, outputPath);
            }
            catch (persistErr) {
                const msg = persistErr instanceof Error ? persistErr.message : String(persistErr);
                throw new Error(`Could not save result image locally: ${msg}`);
            }
            const resultIsRemoteUrl = false;
            const logoOnMockup = (isMockupMode || imageProviderUsed === 'mockup') && llmInput.hasLogo && Boolean(llmInput.logoUrl);
            if (logoOnMockup) {
                logoOverlayApplied = true;
            }
            const llmStored = {
                items: llmOutput.items,
                composition: llmOutput.composition,
                style: llmOutput.style,
                image_prompt: llmOutput.image_prompt,
                negative_prompt: llmOutput.negative_prompt,
                _resultMeta: {
                    generationMode,
                    imageProvider: imageProviderUsed,
                    usedLocalFallback: imageProviderUsed === 'local',
                    usedAiFallback: isAiMode && imageProviderUsed === 'mockup',
                    isAiPhoto: imageProviderUsed === 'ai',
                    aiEnhanced: imageProviderUsed === 'ai',
                    isBrandedMockup: imageProviderUsed === 'mockup' || isMockupMode,
                    accurateProducts: imageProviderUsed === 'mockup' ||
                        isMockupMode ||
                        (isAiMode && imageProviderUsed === 'ai' && mockupProducts.length > 0),
                    logoAppliedPerProduct: logoOnMockup,
                    logoIntegratedByAi: isAiMode && imageProviderUsed === 'ai' && llmInput.hasLogo,
                    logoPostComposited: false,
                    resultIsRemoteUrl,
                    productCount: mockupProducts.length,
                    logoOverlayApplied,
                    imageError: imageErrors.length ? imageErrors.join(' | ') : null,
                    imageNote: imageUsedFallback && isAiMode
                        ? 'OpenRouter недоступен — показан мокап из каталога'
                        : null,
                    openrouterModel: isAiMode ? openrouterImageModel : null,
                },
            };
            if (debug) {
                llmStored._debug = {
                    llm: {
                        provider: providerName,
                        systemPrompt: this.llmBrief.getSystemPrompt(brief.userPayload.lock_user_products === true),
                        userPayload,
                        userMessage: this.llmBrief.getUserMessage(userPayload),
                        response: llmOutput,
                        resolvedProducts: productNames,
                        desiredItemCount: llmInput.desiredItemCount,
                        modelUsed: brief.modelUsed,
                        error: llmError,
                        usedFallback,
                        usedRealLlm,
                    },
                    image: {
                        provider: imageUsedFallback
                            ? `${imageProviderUsed} (fallback)`
                            : imageProviderUsed,
                        promptFromLlm: llmOutput.image_prompt,
                        finalPrompt,
                        compactPrompt,
                        aiEnhancePrompt: isAiMode ? aiEnhancePrompt : undefined,
                        openrouterModel: isAiMode ? openrouterImageModel : undefined,
                        status: 'done',
                        aiEnhanceNegative: isAiMode ? aiEnhanceNegative : undefined,
                        generationMode,
                        pollinationsUrl,
                        aiPollinationsUrl: isAiMode ? pollinationsUrl : undefined,
                        referenceImageUrl: logoPublicUrl ?? null,
                        error: imageErrors.length ? imageErrors.join(' | ') : null,
                        usedFallback: imageUsedFallback,
                        providerChain: providerChain.map((c) => c.name),
                        openrouterConfigured,
                        logoNote: isAiMode
                            ? imageProviderUsed === 'ai'
                                ? `${openrouterImageModel}: ${mockupProducts.length} фото каталога + логотип → единая сцена`
                                : `AI не сработал (${imageErrors.join(' | ') || 'ошибка'}) — показан мокап`
                            : isMockupMode
                                ? llmInput.hasLogo
                                    ? 'Ваш логотип наложен на каждый выбранный товар (точный мокап)'
                                    : 'Логотип не загружен — товары без брендинга'
                                : llmInput.hasLogo
                                    ? logoPublicUrl
                                        ? 'Логотип передан в нейросеть как reference image'
                                        : 'Логотип в промпте (reference image недоступен)'
                                    : 'Логотип не загружен',
                        mockupProducts,
                    },
                    inputSnapshot: snapshot,
                };
            }
            const chosenIdeaTitleForResult = snapshot.chosenIdeaTitle?.trim() || '';
            const conceptResults = chosenIdeaTitleForResult
                ? (0, concept_result_util_1.mergeConceptResult)(generation.conceptResults, {
                    chosenIdeaTitle: chosenIdeaTitleForResult,
                    resultImageUrl,
                    productIds: snapshot.productIds ?? [],
                    revision: Number(snapshot.revision) || 1,
                    finishedAt: new Date(),
                    variantId: `${generationId}-r${Number(snapshot.revision) || 1}`,
                })
                : undefined;
            await this.prisma.generation.update({
                where: { id: generationId },
                data: {
                    status: client_1.GenerationStatus.done,
                    llmOutput: llmStored,
                    imagePrompt: finalPrompt,
                    negativePrompt: llmOutput.negative_prompt,
                    resultImageUrl,
                    ...(conceptResults ? { conceptResults: conceptResults } : {}),
                    finishedAt: new Date(),
                },
            });
            await (0, refine_visualization_processor_1.ensureInitialVisualizationVariant)(this.prisma, generationId, resultImageUrl, finalPrompt);
            await job.updateProgress(100);
            await this.prisma.request.update({
                where: { id: requestId },
                data: { status: client_1.RequestStatus.done },
            });
            this.logger.log(`Generation ${generationId} completed`);
            return { resultImageUrl, pollinationsUrl };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error(`Generation ${generationId} failed: ${message}`);
            let failedOutput = {
                _error: message,
                _resultMeta: {
                    imageProvider: this.imageFactory.getProviderName(),
                    isAiPhoto: false,
                    usedLocalFallback: false,
                    imageError: message,
                },
            };
            try {
                const partial = await this.prisma.generation.findUnique({
                    where: { id: generationId },
                    select: { llmOutput: true },
                });
                if (partial?.llmOutput && typeof partial.llmOutput === 'object') {
                    failedOutput = {
                        ...partial.llmOutput,
                        _error: message,
                        _resultMeta: {
                            ...partial.llmOutput._resultMeta,
                            imageError: message,
                            isAiPhoto: false,
                        },
                    };
                }
            }
            catch {
            }
            await this.prisma.generation.update({
                where: { id: generationId },
                data: {
                    status: client_1.GenerationStatus.failed,
                    finishedAt: new Date(),
                    llmOutput: failedOutput,
                },
            });
            await this.prisma.request.update({
                where: { id: requestId },
                data: { status: client_1.RequestStatus.failed },
            });
            throw error;
        }
    }
    async processRefine(job) {
        const { generationId, requestId } = job.data;
        this.logger.log(`Processing refinement for generation ${generationId}`);
        try {
            const result = await (0, refine_visualization_processor_1.processRefineVisualizationJob)(job, {
                prisma: this.prisma,
                openrouter: this.openrouter,
                logger: this.logger,
            });
            return result;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error(`Refinement ${generationId} failed: ${message}`);
            const prev = await this.prisma.generation.findUnique({
                where: { id: generationId },
                select: { resultImageUrl: true, status: true },
            });
            await this.prisma.generation.update({
                where: { id: generationId },
                data: {
                    status: prev?.resultImageUrl ? client_1.GenerationStatus.done : client_1.GenerationStatus.failed,
                    finishedAt: new Date(),
                },
            });
            await this.prisma.request.update({
                where: { id: requestId },
                data: {
                    status: prev?.resultImageUrl ? client_1.RequestStatus.done : client_1.RequestStatus.failed,
                },
            });
            throw error;
        }
    }
};
exports.GenerationProcessor = GenerationProcessor;
exports.GenerationProcessor = GenerationProcessor = GenerationProcessor_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        prisma_service_1.PrismaService,
        llm_provider_1.LlmProviderFactory,
        llm_brief_service_1.LlmBriefService,
        image_provider_1.ImageProviderFactory,
        concept_prompt_service_1.ConceptPromptService,
        openrouter_image_provider_1.OpenrouterImageProvider])
], GenerationProcessor);
//# sourceMappingURL=generation.processor.js.map
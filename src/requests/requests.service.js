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
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequestsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const client_1 = require("@prisma/client");
const llm_brief_service_1 = require("../providers/llm/llm-brief.service");
const catalog_filter_util_1 = require("../providers/llm/catalog-filter.util");
const catalog_color_match_util_1 = require("../providers/llm/catalog-color-match.util");
const product_add_suggest_util_1 = require("../providers/llm/product-add-suggest.util");
const catalog_product_color_rules_util_1 = require("../generation/catalog-product-color-rules.util");
const catalog_variant_util_1 = require("../providers/llm/catalog-variant.util");
const catalog_util_1 = require("../providers/llm/catalog.util");
const concept_diversity_util_1 = require("../providers/llm/concept-diversity.util");
const set_budget_util_1 = require("../providers/llm/set-budget.util");
const analyze_brief_util_1 = require("./analyze-brief.util");
const concept_result_util_1 = require("../generation/concept-result.util");
const sanitize_request_integers_1 = require("../common/sanitize-request-integers");
const requestInclude = {
    items: { include: { product: true } },
    assets: true,
    generation: {
        include: {
            variants: { orderBy: { sortOrder: 'asc' } },
        },
    },
    agentRun: true,
};
const EDITABLE_REQUEST_STATUSES = [
    client_1.RequestStatus.draft,
    client_1.RequestStatus.done,
    client_1.RequestStatus.failed,
];
let RequestsService = class RequestsService {
    constructor(prisma, llmBrief) {
        this.prisma = prisma;
        this.llmBrief = llmBrief;
    }
    async create(dto) {
        const { productIds, ...raw } = dto;
        const data = (0, sanitize_request_integers_1.sanitizeRequestPayload)(raw);
        const request = await this.prisma.request.create({
            data: {
                title: data.title ?? 'Новая концепция',
                userPrompt: data.userPrompt ?? '',
                category: data.category ?? 'Welcome Pack',
                budgetMin: data.budgetMin,
                budgetMax: data.budgetMax,
                quantity: data.quantity,
                setItemCount: data.setItemCount,
                useProductCountLimit: data.useProductCountLimit ?? true,
                minProductsPerSet: data.minProductsPerSet,
                maxProductsPerSet: data.maxProductsPerSet,
                conceptCount: data.conceptCount ?? 5,
                visualizationCount: data.visualizationCount ?? 1,
                colors: data.colors ?? [],
                allowedItems: data.allowedItems ?? [],
                forbiddenItems: data.forbiddenItems ?? [],
                blacklistedProductIds: data.blacklistedProductIds ?? [],
                blacklistedSupplierIds: data.blacklistedSupplierIds ?? [],
                notes: data.notes,
                status: client_1.RequestStatus.draft,
                ...(productIds?.length
                    ? {
                        items: {
                            create: productIds.map((productId) => ({ productId })),
                        },
                    }
                    : {}),
            },
            include: requestInclude,
        });
        return request;
    }
    async findOne(id) {
        const request = await this.prisma.request.findUnique({
            where: { id },
            include: requestInclude,
        });
        if (!request)
            throw new common_1.NotFoundException('Request not found');
        if (!request.generation)
            return request;
        const conceptResults = (0, concept_result_util_1.backfillConceptResultsFromGeneration)(request.generation);
        return {
            ...request,
            generation: {
                ...request.generation,
                conceptResults,
            },
        };
    }
    async update(id, dto) {
        const existing = await this.findOne(id);
        if (!EDITABLE_REQUEST_STATUSES.includes(existing.status)) {
            throw new common_1.ForbiddenException('Request cannot be edited in current status');
        }
        const { productIds, ...raw } = dto;
        const data = (0, sanitize_request_integers_1.sanitizeRequestPayload)(raw);
        const updateData = {};
        if (data.title !== undefined)
            updateData.title = data.title;
        if (data.userPrompt !== undefined)
            updateData.userPrompt = data.userPrompt;
        if (data.category !== undefined)
            updateData.category = data.category;
        if (data.budgetMin !== undefined)
            updateData.budgetMin = data.budgetMin;
        if (data.budgetMax !== undefined)
            updateData.budgetMax = data.budgetMax;
        if (data.quantity !== undefined)
            updateData.quantity = data.quantity;
        if (data.setItemCount !== undefined)
            updateData.setItemCount = data.setItemCount;
        if (data.useProductCountLimit !== undefined)
            updateData.useProductCountLimit = data.useProductCountLimit;
        if (data.minProductsPerSet !== undefined)
            updateData.minProductsPerSet = data.minProductsPerSet;
        if (data.maxProductsPerSet !== undefined)
            updateData.maxProductsPerSet = data.maxProductsPerSet;
        if (data.conceptCount !== undefined)
            updateData.conceptCount = data.conceptCount;
        if (data.visualizationCount !== undefined)
            updateData.visualizationCount = data.visualizationCount;
        if (data.colors !== undefined)
            updateData.colors = data.colors;
        if (data.allowedItems !== undefined)
            updateData.allowedItems = data.allowedItems;
        if (data.forbiddenItems !== undefined)
            updateData.forbiddenItems = data.forbiddenItems;
        if (data.notes !== undefined)
            updateData.notes = data.notes;
        if (productIds !== undefined) {
            await this.prisma.requestItem.deleteMany({ where: { requestId: id } });
            if (productIds.length > 0) {
                await this.prisma.requestItem.createMany({
                    data: productIds.map((productId) => ({ requestId: id, productId })),
                });
            }
        }
        return this.prisma.request.update({
            where: { id },
            data: updateData,
            include: requestInclude,
        });
    }
    async submit(id) {
        const request = await this.findOne(id);
        if (request.status !== client_1.RequestStatus.draft) {
            throw new common_1.ForbiddenException('Only draft requests can be submitted');
        }
        if (!request.userPrompt?.trim()) {
            throw new common_1.BadRequestException('userPrompt is required');
        }
        return this.prisma.request.update({
            where: { id },
            data: { status: client_1.RequestStatus.ready },
            include: requestInclude,
        });
    }
    async parseBrief(userPrompt) {
        const parsed = await this.llmBrief.parseBriefFromPrompt(userPrompt);
        return parsed;
    }
    async extractParameters(id) {
        const request = await this.findOne(id);
        const parsed = await this.llmBrief.parseBriefFromPrompt(request.userPrompt);
        const parameters = (0, analyze_brief_util_1.analyzeBrief)(request.userPrompt, {
            uiAllowedItems: request.allowedItems ?? [],
            uiForbiddenItems: request.forbiddenItems ?? [],
            llmPartial: parsed,
        });
        const updateData = {};
        if (parameters.category?.value)
            updateData.category = parameters.category.value;
        if (parameters.quantity?.value)
            updateData.quantity = parameters.quantity.value;
        if (parameters.setItemCount?.value)
            updateData.setItemCount = parameters.setItemCount.value;
        if (parameters.budgetMin?.value != null)
            updateData.budgetMin = parameters.budgetMin.value;
        if (parameters.budgetMax?.value != null)
            updateData.budgetMax = parameters.budgetMax.value;
        if (parameters.colors?.value?.length)
            updateData.colors = parameters.colors.value;
        if (parameters.allowedItems?.value?.length) {
            updateData.allowedItems = [
                ...(parameters.allowedItems.value ?? []),
                ...(parameters.namedItems?.value ?? []),
            ];
        }
        else if (parameters.namedItems?.value?.length) {
            updateData.allowedItems = parameters.namedItems.value;
        }
        if (parameters.forbiddenItems?.value?.length) {
            updateData.forbiddenItems = parameters.forbiddenItems.value;
        }
        if (parameters.notes?.value)
            updateData.notes = parameters.notes.value;
        if (Object.keys(updateData).length > 0) {
            await this.prisma.request.update({
                where: { id },
                data: updateData,
            });
        }
        const updated = await this.findOne(id);
        return { request: updated, parameters, parsed };
    }
    async suggestProducts(id) {
        const request = await this.findOne(id);
        if (request.status !== client_1.RequestStatus.draft) {
            throw new common_1.ForbiddenException('Only draft requests can use AI suggestions');
        }
        if (!request.userPrompt?.trim()) {
            throw new common_1.BadRequestException('userPrompt is required');
        }
        const logoAsset = request.assets.find((a) => a.type === 'logo');
        const allowedItems = request.allowedItems ?? [];
        const forbiddenItems = request.forbiddenItems ?? [];
        const colors = request.colors ?? [];
        const setItemCount = request.setItemCount ?? 4;
        const budgetPerSet = (0, set_budget_util_1.resolveBudgetPerSet)(request.budgetMin, request.budgetMax);
        const filterInput = {
            userPrompt: request.userPrompt,
            projectCategory: request.category,
            quantity: request.quantity,
            budgetMin: request.budgetMin,
            budgetMax: request.budgetMax,
            budgetPerSet,
            setItemCount,
            useProductCountLimit: request.useProductCountLimit ?? true,
            minProductsPerSet: request.minProductsPerSet,
            maxProductsPerSet: request.maxProductsPerSet,
            colors,
            allowedItems,
            forbiddenItems,
            blacklistedProductIds: request.blacklistedProductIds ?? [],
            blacklistedSupplierIds: request.blacklistedSupplierIds ?? [],
        };
        const pipeline = await this.llmBrief.prepareCatalogPipeline(filterInput, 480);
        const relevanceCatalog = pipeline.relevance;
        const catalogForLlm = pipeline.forLlm;
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
            hasLogo: Boolean(logoAsset),
            logoUrl: logoAsset?.url ?? null,
            notes: request.notes,
            desiredItemCount: setItemCount,
        });
        const brief = await this.llmBrief.interpretForSuggest(llmInput, relevanceCatalog);
        const productIds = brief.products.map((p) => p.id);
        await this.prisma.requestItem.deleteMany({ where: { requestId: id } });
        if (productIds.length > 0) {
            await this.prisma.requestItem.createMany({
                data: productIds.map((productId) => ({ requestId: id, productId })),
            });
        }
        const updated = await this.findOne(id);
        const pickedProducts = brief.products;
        return {
            request: updated,
            suggestion: {
                productIds,
                productNames: brief.products.map((p) => p.name),
                products: pickedProducts.map((p) => ({
                    id: p.id,
                    name: p.name,
                    category: p.category,
                    price: p.price,
                    stockAvailable: p.stockAvailable,
                    colors: p.colors?.map((c) => c.name) ?? [],
                })),
                setPriceRub: (0, catalog_filter_util_1.estimateSetTotalPrice)(pickedProducts),
                composition: brief.output.composition,
                style: brief.output.style,
                image_prompt: brief.output.image_prompt,
                llmProvider: brief.provider,
                modelUsed: brief.modelUsed,
                desiredItemCount: llmInput.desiredItemCount,
                usedFallback: brief.usedFallback,
                catalogStats: {
                    totalInDb: pipeline.totalInDb,
                    afterFilters: pipeline.filtered.length,
                    sentToLlm: catalogForLlm.length,
                },
            },
        };
    }
    async suggestProductAdd(id, body) {
        const hint = body.hint?.trim();
        if (!hint) {
            throw new common_1.BadRequestException('Опишите, какой товар добавить');
        }
        const request = await this.findOne(id);
        const currentIds = new Set(body.currentProductIds ?? []);
        const currentProducts = await this.llmBrief.loadProductsByIds([...currentIds]);
        const currentNames = currentProducts.map((p) => p.name);
        const currentVariantKeys = new Set(currentProducts.map((p) => (0, catalog_variant_util_1.productVariantKey)(p)));
        const projectColors = Array.isArray(request.colors)
            ? request.colors.map((c) => typeof c === 'string' ? c : String(c.hex ?? '')).filter(Boolean)
            : [];
        const blacklistedProductIds = request.blacklistedProductIds ?? [];
        const blacklistedSupplierIds = request.blacklistedSupplierIds ?? [];
        const filterInput = {
            userPrompt: hint,
            quantity: request.quantity,
            budgetMin: null,
            budgetMax: null,
            colors: projectColors,
            allowedItems: [],
            forbiddenItems: [],
            blacklistedProductIds,
            blacklistedSupplierIds,
        };
        const pipeline = await this.llmBrief.prepareCatalogPipeline(filterInput, 100);
        const filteredCatalog = (0, product_add_suggest_util_1.filterCatalogForProductAdd)(pipeline.relevance, request.quantity)
            .filter((p) => !currentIds.has(p.id) && !currentVariantKeys.has((0, catalog_variant_util_1.productVariantKey)(p)));
        const blacklistFiltered = (0, catalog_util_1.filterCatalogByBlacklist)(filteredCatalog, blacklistedProductIds, blacklistedSupplierIds);
        const catalogForLlm = await (0, product_add_suggest_util_1.buildCatalogCandidatesForProductAdd)(blacklistFiltered, hint, filterInput, 100);
        const llmInput = this.llmBrief.buildInput({
            userPrompt: hint,
            category: '',
            quantity: request.quantity,
            budgetMin: null,
            budgetMax: null,
            colors: projectColors,
            allowedItems: [],
            forbiddenItems: [],
            productNames: currentNames,
            catalog: catalogForLlm,
            hasLogo: false,
            logoUrl: null,
            desiredItemCount: 5,
            productAddMode: true,
        });
        llmInput.productAddMode = true;
        llmInput.currentSetProductNames = currentNames;
        llmInput.addRequestHint = hint;
        llmInput.excludeVariantKeys = [...currentVariantKeys];
        const brief = await this.llmBrief.interpretForProductAdd(llmInput, catalogForLlm);
        const currentTypes = new Set(currentProducts.map((p) => (0, concept_diversity_util_1.detectConceptProductType)(p)));
        const explicitType = (0, product_add_suggest_util_1.hasExplicitProductTypeHint)(hint);
        const llmReasons = (0, product_add_suggest_util_1.parseProductAddReasons)(brief.output.composition);
        const localCandidates = (0, product_add_suggest_util_1.localSuggestProductsForAdd)(blacklistFiltered, hint, filterInput, 5, currentVariantKeys);
        let products = [];
        let reasons = [];
        const existingIds = new Set();
        const tryAdd = (candidate, llmReason) => {
            if (products.length >= 5)
                return;
            if (!(0, product_add_suggest_util_1.productMatchesAddHint)(candidate, hint))
                return;
            if (currentTypes.has((0, concept_diversity_util_1.detectConceptProductType)(candidate)))
                return;
            if (existingIds.has(candidate.id))
                return;
            products.push(candidate);
            reasons.push((0, product_add_suggest_util_1.buildProductAddReason)(candidate, hint, llmReason));
            existingIds.add(candidate.id);
        };
        if (explicitType) {
            for (const p of localCandidates)
                tryAdd(p);
        }
        if (!explicitType || products.length < 5) {
            for (let i = 0; i < brief.products.length && products.length < 5; i++) {
                tryAdd(brief.products[i], llmReasons[i]);
            }
        }
        if (products.length < 5) {
            for (const p of localCandidates)
                tryAdd(p);
        }
        products = products.slice(0, 5);
        reasons = reasons.slice(0, products.length);
        if (products.length === 0) {
            throw new common_1.BadRequestException('Не удалось подобрать товары — попробуйте уточнить запрос (тип, цвет, назначение)');
        }
        const mapProduct = (product) => ({
            id: product.id,
            name: product.name,
            category: product.category,
            price: product.price,
            stockAvailable: product.stockAvailable,
            colors: product.colors?.map((c) => c.name) ?? [],
            catalogImageUrl: product.catalogImageUrl,
            silhouetteImageUrl: product.silhouetteImageUrl,
            sourceUrl: product.sourceUrl ?? null,
        });
        return {
            suggestions: products.map((product, i) => {
                const catalogColors = (0, catalog_product_color_rules_util_1.catalogColorNames)(product);
                const targetColor = (0, catalog_color_match_util_1.pickCatalogColorNameForBrand)(product, projectColors) ??
                    inferTargetColorForProductHint(hint, catalogColors);
                return {
                    product: mapProduct(product),
                    reason: (0, product_add_suggest_util_1.buildProductAddReason)(product, hint, reasons[i]),
                    targetColor,
                };
            }),
            usedFallback: brief.usedFallback,
        };
    }
};
exports.RequestsService = RequestsService;
exports.RequestsService = RequestsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        llm_brief_service_1.LlmBriefService])
], RequestsService);
function inferTargetColorForProductHint(hint, catalogColors) {
    const h = hint.toLowerCase().replace(/ё/g, 'е');
    for (const color of catalogColors) {
        const c = color.toLowerCase().replace(/ё/g, 'е');
        if (h.includes(c))
            return color;
        if (c.length >= 3 && h.includes(c.slice(0, 3)))
            return color;
    }
    const hintLabels = (0, product_add_suggest_util_1.extractColorHintsFromText)(hint);
    for (const label of hintLabels) {
        const match = catalogColors.find((c) => c.toLowerCase().replace(/ё/g, 'e').includes(label));
        if (match)
            return match;
    }
    return undefined;
}
//# sourceMappingURL=requests.service.js.map
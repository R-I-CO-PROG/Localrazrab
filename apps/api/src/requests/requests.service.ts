import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRequestDto } from './dto/create-request.dto';
import { UpdateRequestDto } from './dto/update-request.dto';
import { RequestStatus } from '@prisma/client';
import { LlmBriefService } from '../providers/llm/llm-brief.service';
import { parseExplicitTirage } from './parse-brief.util';
import { filterCatalogForRequest, estimateSetTotalPrice } from '../providers/llm/catalog-filter.util';
import { pickCatalogColorNameForBrand } from '../providers/llm/catalog-color-match.util';
import { stratifiedCatalogForLlm } from '../providers/llm/catalog-index.util';
import { filterCatalogByBriefRelevance } from '../providers/llm/catalog-brief-relevance.util';
import {
  buildCatalogCandidatesForProductAdd,
  filterCatalogForProductAdd,
  localSuggestProductsForAdd,
  resolveEffectiveAddColors,
  parseProductAddReasons,
  hasExplicitProductTypeHint,
  productMatchesAddHint,
  buildProductAddReason,
  extractColorHintsFromText,
  buildAddSuggestionMismatches,
  stripAttributeAndColorWords,
} from '../providers/llm/product-add-suggest.util';
import {
  catalogColorNames,
} from '../generation/catalog-product-color-rules.util';
import { productVariantKey } from '../providers/llm/catalog-variant.util';
import { filterCatalogByBlacklist } from '../providers/llm/catalog.util';
import { resolveBudgetPerSet } from '../providers/llm/set-budget.util';
import { analyzeBrief } from './analyze-brief.util';
import { parseConceptResults, backfillConceptResultsFromGeneration } from '../generation/concept-result.util';
import { sanitizeRequestPayload } from '../common/sanitize-request-integers';

const requestInclude = {
  items: { include: { product: true } },
  assets: true,
  generation: {
    include: {
      variants: { orderBy: { sortOrder: 'asc' as const } },
    },
  },
  agentRun: true,
};

const EDITABLE_REQUEST_STATUSES: RequestStatus[] = [
  RequestStatus.draft,
  RequestStatus.done,
  RequestStatus.failed,
];

@Injectable()
export class RequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly llmBrief: LlmBriefService,
  ) {}

  async create(dto: CreateRequestDto, callerUserId?: string | null) {
    const { productIds, ...raw } = dto;
    const data = sanitizeRequestPayload(raw);
    const request = await this.prisma.request.create({
      data: {
        userId: callerUserId ?? undefined,
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
        status: RequestStatus.draft,
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

  async findOne(id: string, callerUserId?: string | null) {
    const request = await this.prisma.request.findUnique({
      where: { id },
      include: requestInclude,
    });
    if (!request) throw new NotFoundException('Request not found');
    // callerUserId === undefined -> проверка не запрошена (внутренний вызов).
    // Иначе: запрос без владельца доступен всем (гостевой режим/старые записи до
    // введения userId); запрос с владельцем — только ему. 404, а не 403, чтобы
    // не подтверждать существование чужой заявки.
    if (callerUserId != null && request.userId && request.userId !== callerUserId) {
      throw new NotFoundException('Request not found');
    }
    if (!request.generation) return request;
    const conceptResults = backfillConceptResultsFromGeneration(request.generation);
    return {
      ...request,
      generation: {
        ...request.generation,
        conceptResults,
      },
    };
  }

  async update(id: string, dto: UpdateRequestDto, callerUserId?: string | null) {
    const existing = await this.findOne(id, callerUserId);
    if (!EDITABLE_REQUEST_STATUSES.includes(existing.status)) {
      throw new ForbiddenException('Request cannot be edited in current status');
    }

    const { productIds, ...raw } = dto;
    const data = sanitizeRequestPayload(raw);
    const updateData: Record<string, unknown> = {};
    if (data.title !== undefined) updateData.title = data.title;
    if (data.userPrompt !== undefined) updateData.userPrompt = data.userPrompt;
    if (data.category !== undefined) updateData.category = data.category;
    if (data.budgetMin !== undefined) updateData.budgetMin = data.budgetMin;
    if (data.budgetMax !== undefined) updateData.budgetMax = data.budgetMax;
    if (data.quantity !== undefined) updateData.quantity = data.quantity;
    if (data.setItemCount !== undefined) updateData.setItemCount = data.setItemCount;
    if (data.useProductCountLimit !== undefined) updateData.useProductCountLimit = data.useProductCountLimit;
    if (data.minProductsPerSet !== undefined) updateData.minProductsPerSet = data.minProductsPerSet;
    if (data.maxProductsPerSet !== undefined) updateData.maxProductsPerSet = data.maxProductsPerSet;
    if (data.conceptCount !== undefined) updateData.conceptCount = data.conceptCount;
    if (data.visualizationCount !== undefined) updateData.visualizationCount = data.visualizationCount;
    if (data.colors !== undefined) updateData.colors = data.colors;
    if (data.allowedItems !== undefined) updateData.allowedItems = data.allowedItems;
    if (data.forbiddenItems !== undefined) updateData.forbiddenItems = data.forbiddenItems;
    if (data.notes !== undefined) updateData.notes = data.notes;

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

  async submit(id: string, callerUserId?: string | null) {
    const request = await this.findOne(id, callerUserId);
    if (request.status !== RequestStatus.draft) {
      throw new ForbiddenException('Only draft requests can be submitted');
    }
    if (!request.userPrompt?.trim()) {
      throw new BadRequestException('userPrompt is required');
    }
    // Товары можно не выбирать — LLM/stub подберёт на этапе генерации
    return this.prisma.request.update({
      where: { id },
      data: { status: RequestStatus.ready },
      include: requestInclude,
    });
  }

  async parseBrief(userPrompt: string) {
    const parsed = await this.llmBrief.parseBriefFromPrompt(userPrompt);
    return parsed;
  }

  async extractParameters(id: string, callerUserId?: string | null) {
    const request = await this.findOne(id, callerUserId);
    const parsed = await this.llmBrief.parseBriefFromPrompt(request.userPrompt);
    const parameters = analyzeBrief(request.userPrompt, {
      uiAllowedItems: (request.allowedItems as string[]) ?? [],
      uiForbiddenItems: (request.forbiddenItems as string[]) ?? [],
      llmPartial: parsed,
    });

    const updateData: Record<string, unknown> = {};
    if (parameters.category?.value) updateData.category = parameters.category.value;
    // ТИРАЖ: приоритет — явный тираж в брифе («тираж 30», «30 наборов») > уже введённый
    // пользователем в UI > слабый инференс по числу аудитории («100 сотрудников»). Раньше «подобрать
    // параметры» безусловно затирал введённые пользователем 30 инференсом 100.
    {
      const explicitTirage = parseExplicitTirage(request.userPrompt);
      const existingQty =
        typeof request.quantity === 'number' && request.quantity > 0 ? request.quantity : null;
      if (explicitTirage != null) {
        updateData.quantity = explicitTirage;
      } else if (existingQty == null && parameters.quantity?.value) {
        updateData.quantity = parameters.quantity.value;
      }
      // иначе (юзер уже ввёл тираж, а в брифе явного нет) — НЕ трогаем, сохраняем введённое.
    }
    if (parameters.setItemCount?.value) updateData.setItemCount = parameters.setItemCount.value;
    if (parameters.budgetMin?.value != null) updateData.budgetMin = parameters.budgetMin.value;
    if (parameters.budgetMax?.value != null) updateData.budgetMax = parameters.budgetMax.value;
    if (parameters.colors?.value?.length) updateData.colors = parameters.colors.value;
    if (parameters.allowedItems?.value?.length) {
      updateData.allowedItems = [
        ...(parameters.allowedItems.value ?? []),
        ...(parameters.namedItems?.value ?? []),
      ];
    } else if (parameters.namedItems?.value?.length) {
      updateData.allowedItems = parameters.namedItems.value;
    }
    if (parameters.forbiddenItems?.value?.length) {
      updateData.forbiddenItems = parameters.forbiddenItems.value;
    }
    if (parameters.notes?.value) updateData.notes = parameters.notes.value;

    if (Object.keys(updateData).length > 0) {
      await this.prisma.request.update({
        where: { id },
        data: updateData,
      });
    }

    const updated = await this.findOne(id);
    return { request: updated, parameters, parsed };
  }

  async suggestProducts(id: string, callerUserId?: string | null) {
    const request = await this.findOne(id, callerUserId);
    if (request.status !== RequestStatus.draft) {
      throw new ForbiddenException('Only draft requests can use AI suggestions');
    }
    if (!request.userPrompt?.trim()) {
      throw new BadRequestException('userPrompt is required');
    }

    const logoAsset = request.assets.find((a) => a.type === 'logo');
    const allowedItems = (request.allowedItems as string[]) ?? [];
    const forbiddenItems = (request.forbiddenItems as string[]) ?? [];
    const colors = (request.colors as string[]) ?? [];
    const setItemCount = request.setItemCount ?? 4;
    const budgetPerSet = resolveBudgetPerSet(request.budgetMin, request.budgetMax);

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
      blacklistedProductIds: (request.blacklistedProductIds as string[]) ?? [],
      blacklistedSupplierIds: (request.blacklistedSupplierIds as string[]) ?? [],
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
        setPriceRub: estimateSetTotalPrice(pickedProducts),
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

  /** Подбор 5 вариантов дополнительного товара к набору */
  async suggestProductAdd(
    id: string,
    body: { currentProductIds: string[]; hint?: string },
    callerUserId?: string | null,
  ) {
    const hint = body.hint?.trim();
    if (!hint) {
      throw new BadRequestException('Опишите, какой товар добавить');
    }

    const request = await this.findOne(id, callerUserId);
    const currentIds = new Set(body.currentProductIds ?? []);
    const currentProducts = await this.llmBrief.loadProductsByIds([...currentIds]);
    const currentNames = currentProducts.map((p) => p.name);
    const currentVariantKeys = new Set(currentProducts.map((p) => productVariantKey(p)));

    const projectColors = Array.isArray(request.colors)
      ? (request.colors as Array<string | { hex?: string }>).map((c) =>
          typeof c === 'string' ? c : String(c.hex ?? ''),
        ).filter(Boolean)
      : [];

    const blacklistedProductIds = (request.blacklistedProductIds as string[]) ?? [];
    const blacklistedSupplierIds = (request.blacklistedSupplierIds as string[]) ?? [];

    // Бюджет НА НАБОР (для catalog приходит как budgetMin=budgetMax=perSet) и тираж —
    // до-подбор обязан их уважать: цена ≤ бюджет набора, остаток ≥ тираж.
    const perSetBudget =
      typeof request.budgetMax === 'number' && request.budgetMax > 0
        ? request.budgetMax
        : typeof request.budgetMin === 'number' && request.budgetMin > 0
          ? request.budgetMin
          : null;
    const tirage = typeof request.quantity === 'number' ? request.quantity : 0;
    // Остаток бюджета = бюджет набора − товары, уже лежащие в наборе. При замене менеджер
    // сначала удаляет предмет, поэтому его цена автоматически возвращается в остаток.
    const currentSetTotal = estimateSetTotalPrice(currentProducts);
    const remainingBudget =
      perSetBudget != null ? Math.max(0, perSetBudget - currentSetTotal) : null;
    const addCtx = { tirage, remainingBudget };

    const filterInput = {
      userPrompt: hint,
      quantity: request.quantity,
      budgetMin: null as number | null,
      budgetMax: perSetBudget,
      colors: projectColors,
      allowedItems: [] as string[],
      forbiddenItems: [] as string[],
      blacklistedProductIds,
      blacklistedSupplierIds,
    };

    // Прямой полнотекстовый поиск по всему каталогу (а не случайный стратифицированный
    // срез со stock-гейтом) — гарантирует, что «футболка» находит все 5000+ SKU.
    // Цвета/единицы/числа в SQL не участвуют — иначе «синий» замусоривает срез из 800.
    const searched = await this.llmBrief.searchCatalogByText(
      stripAttributeAndColorWords(hint),
      800,
    );
    let baseCatalog = searched;
    if (baseCatalog.length < 12) {
      // Расплывчатая подсказка без прямых совпадений — добираем обычным пайплайном.
      const pipeline = await this.llmBrief.prepareCatalogPipeline(filterInput, 100);
      const seen = new Set(baseCatalog.map((p) => p.id));
      baseCatalog = [...baseCatalog, ...pipeline.relevance.filter((p) => !seen.has(p.id))];
    }
    // Жёстко режем по бюджету набора (не предлагать дороже лимита), мягко — по остатку≥тираж.
    if (perSetBudget != null) {
      baseCatalog = baseCatalog.filter((p) => (p.price ?? 0) <= perSetBudget);
    }
    if (tirage > 0) {
      const inStock = baseCatalog.filter((p) => (p.stockAvailable ?? 0) >= tirage);
      if (inStock.length >= 3) baseCatalog = inStock; // мягко: не опустошаем при тонком остатке
    }
    const filteredCatalog = filterCatalogForProductAdd(baseCatalog, request.quantity)
      .filter((p) => !currentIds.has(p.id) && !currentVariantKeys.has(productVariantKey(p)));
    const blacklistFiltered = filterCatalogByBlacklist(
      filteredCatalog,
      blacklistedProductIds,
      blacklistedSupplierIds,
    );

    const catalogForLlm = await buildCatalogCandidatesForProductAdd(
      blacklistFiltered,
      hint,
      filterInput,
      100,
    );

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

    const explicitType = hasExplicitProductTypeHint(hint);
    const llmReasons = parseProductAddReasons(brief.output.composition);

    const localCandidates = localSuggestProductsForAdd(
      blacklistFiltered,
      hint,
      filterInput,
      5,
      currentVariantKeys,
      addCtx,
    );

    let products: (typeof localCandidates)[0][] = [];
    let reasons: string[] = [];
    const existingIds = new Set<string>();

    // ВНИМАНИЕ: НЕ отбрасываем кандидата, если его тип уже есть в наборе — при ручном
    // до-подборе пользователь осознанно добавляет вторую футболку/кружку. Раньше эта
    // проверка делала выдачу пустой (→ 400) для явного типа, уже присутствующего в наборе.
    const tryAdd = (candidate: (typeof localCandidates)[0], llmReason?: string) => {
      if (products.length >= 5) return;
      if (!productMatchesAddHint(candidate, hint)) return;
      if (existingIds.has(candidate.id)) return;
      products.push(candidate);
      reasons.push(buildProductAddReason(candidate, hint, llmReason));
      existingIds.add(candidate.id);
    };

    if (explicitType) {
      for (const p of localCandidates) tryAdd(p);
    }

    if (!explicitType || products.length < 5) {
      for (let i = 0; i < brief.products.length && products.length < 5; i++) {
        tryAdd(brief.products[i], llmReasons[i]);
      }
    }

    if (products.length < 5) {
      for (const p of localCandidates) tryAdd(p);
    }

    products = products.slice(0, 5);
    reasons = reasons.slice(0, products.length);

    // Пусто → возвращаем пустой список (НЕ 400), чтобы UI показал мягкое «ничего не найдено»,
    // а не красную ошибку. Кнопка «Добавить» больше не падает на «футболка».
    if (products.length === 0) {
      return { suggestions: [], usedFallback: false };
    }

    const mapProduct = (product: (typeof products)[0]) => ({
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
        const catalogColors = catalogColorNames(product);
        const targetColor =
          pickCatalogColorNameForBrand(product, projectColors) ??
          inferTargetColorForProductHint(hint, catalogColors);

        return {
          product: mapProduct(product),
          reason: buildProductAddReason(product, hint, reasons[i]),
          targetColor,
          mismatches: buildAddSuggestionMismatches(product, hint, addCtx),
        };
      }),
      usedFallback: brief.usedFallback,
    };
  }
}

function inferTargetColorForProductHint(hint: string, catalogColors: string[]): string | undefined {
  const h = hint.toLowerCase().replace(/ё/g, 'е');
  for (const color of catalogColors) {
    const c = color.toLowerCase().replace(/ё/g, 'е');
    if (h.includes(c)) return color;
    if (c.length >= 3 && h.includes(c.slice(0, 3))) return color;
  }
  const hintLabels = extractColorHintsFromText(hint);
  for (const label of hintLabels) {
    const match = catalogColors.find((c) => c.toLowerCase().replace(/ё/g, 'e').includes(label));
    if (match) return match;
  }
  return undefined;
}

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

import { LlmProviderFactory } from './llm.provider';

import { OpenrouterLlmProvider } from './openrouter-llm.provider';

import { LlmGenerationInput, LlmGenerationOutput, LlmInterpretMode } from './llm.interface';

import {
  buildLlmSystemPrompt,
  buildLlmSystemPromptForCreative,
  buildLlmUserMessage,
  buildLlmUserPayload,
} from './llm-prompts';

import {

  CatalogProduct,

  filterCatalogByConstraints,

  resolveLlmProductSelection,

} from './catalog.util';

import { defaultItemCount, parseDesiredItemCount } from './parse-desired-count';
import { enforceSingleSetComposition, resolveBudgetPerSet, maxUnitPriceForSet } from './set-budget.util';
import {
  type CatalogFilterInput,
  filterCatalogForRequest,
  shortlistCatalogForLlm,
  resolveTargetItemCount,
} from './catalog-filter.util';
import { filterOutForbidden } from './catalog-forbidden-match.util';
import { filterCatalogByBriefRelevance } from './catalog-brief-relevance.util';
import {
  stratifiedCatalogForLlm,
  buildCatalogOverview,
  type CatalogOverview,
  type CatalogPipelineResult,
} from './catalog-index.util';
import {
  makeRng,
  seedFromString,
  seededShuffle,
  seededOffset,
} from './catalog-retrieval-seed.util';
import {
  missingMandatoryTypes,
  mandatoryTypeSearchTerm,
  mergeMandatoryTypeCandidates,
} from './mandatory-type-load.util';
import {
  catalogPipelineCacheKey,
  getCachedCatalogPipeline,
  setCachedCatalogPipeline,
  rawCandidatesCacheKey,
  getCachedRawCandidates,
  setCachedRawCandidates,
} from './catalog-pipeline-cache.util';
import type { CatalogPipelineTiming } from './catalog-pipeline-timing.util';
import { indexCatalogByProductType } from './catalog-slot-picker.util';
import {
  briefToCategoryGroup,
  getCategoryBuckets,
  bucketWhere,
  type CategoryBucket,
} from './catalog-category-sampler.util';

import { yieldEventLoop } from '../../common/yield-event-loop';
import { shouldRespectUserProducts } from './respect-user-products';

import {
  buildLocalCreativeGenerationOutput,
  buildLocalCatalogSceneGenerationOutput,
  buildLocalSceneGenerationOutput,
} from './local-scene-prompt';
import { finalizeSceneLlmOutput, finalizeCatalogSceneLlmOutput } from './finalize-scene-output';
import { LlmBriefParseJson } from './parse-llm-json';
import { openRouterFetch } from './openrouter-proxy.util';
import { safeJsonParse } from './safe-json-parse.util';
import {
  SINGLE_PRODUCT_PROBE_SYSTEM_PROMPT,
  parseSingleProductLlmResponse,
  type BriefIntentProbe,
} from './catalog-single-product-llm.util';
import {
  mergeParsedBrief,
  parseBriefLocally,
  type ParsedBriefResult,
} from '../../requests/parse-brief.util';
import type { BriefAllowedCategory, BriefCategory, BriefForbiddenOption } from '../../requests/brief-options';



export interface BriefInterpretResult {

  output: LlmGenerationOutput;

  products: CatalogProduct[];

  provider: string;

  modelUsed: string | null;

  usedFallback: boolean;

  error: string | null;

  userPayload: ReturnType<typeof buildLlmUserPayload>;

}


@Injectable()

export class LlmBriefService implements OnModuleInit {

  private readonly logger = new Logger(LlmBriefService.name);
  private catalogCache: { at: number; data: CatalogProduct[] } | null = null;
  private readonly catalogCacheTtlMs = 5 * 60 * 1000;
  /** Кэш LLM-классификации намерения брифа по нормализованному тексту (регенерация/повтор не бьют по сети). */
  private readonly singleProductProbeCache = new Map<string, BriefIntentProbe>();

  constructor(

    private readonly config: ConfigService,

    private readonly prisma: PrismaService,

    private readonly llmFactory: LlmProviderFactory,

  ) {}

  onModuleInit() {
    void this.warmCatalogCache();
  }

  private async warmCatalogCache(): Promise<void> {
    try {
      const count = await this.prisma.product.count();
      this.logger.log(`Catalog warmup: ${count} products in DB`);
    } catch (err) {
      this.logger.warn(`Catalog warmup failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  /**
   * Подготовка каталога для Ideator / suggest — без загрузки всех 50k+ SKU в память.
   * Сначала отбор в PostgreSQL (цена, остаток, blacklist), затем JS-фильтры на сокращённом наборе.
   */
  async prepareCatalogPipeline(
    input: CatalogFilterInput,
    stratifiedMax = 280,
    timing?: CatalogPipelineTiming,
  ): Promise<CatalogPipelineResult> {
    const cacheTtl =
      Number(this.config.get('CATALOG_PIPELINE_CACHE_TTL_MS', '300000')) || 300_000;
    const cacheKey = catalogPipelineCacheKey(input, stratifiedMax);
    const cached = getCachedCatalogPipeline(cacheKey, cacheTtl);
    if (cached) {
      this.logger.log(`Catalog pipeline cache hit (${cached.relevance.length} relevance SKU)`);
      timing?.lap('prepareCatalogPipeline_cache_hit');
      return cached;
    }

    const budgetPerSet = input.budgetPerSet ?? resolveBudgetPerSet(input.budgetMin, input.budgetMax);
    // ЗАГРУЗОЧНЫЙ price-cap = полный бюджет набора, а не цена-на-слот. Иначе пул
    // ограничен дешёвой мелочёвкой (мало типов, бюджет недобирается). Тонкий
    // per-slot бюджет применяется ниже в подборе.
    const priceCap = budgetPerSet ?? input.budgetMax ?? input.budgetMin ?? null;
    const tirage = input.quantity ?? 0;

    const where: Prisma.ProductWhereInput = {};
    if (priceCap != null && priceCap > 0) {
      where.OR = [{ price: null }, { price: { lte: priceCap } }];
    }
    if (tirage > 0) {
      // Колонка stockAvailable — NOT NULL (@default(0)): неизвестный остаток хранится как 0, а не
      // NULL. `gte` корректно исключает 0-сток (и DB, и JS-гейт делают это согласованно) — «null=
      // доступен» из JS-контракта здесь неактуально, т.к. NULL-строк в БД нет.
      where.stockAvailable = { gte: tirage };
    }
    if (input.blacklistedProductIds?.length) {
      where.id = { notIn: input.blacklistedProductIds };
    }

    const filteredMax =
      Number(this.config.get('CATALOG_FILTERED_MAX', '4000')) || 4000;
    const relevanceMax =
      Number(this.config.get('CATALOG_RELEVANCE_MAX', '3000')) || 3000;

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
      widthCm: true,
      heightCm: true,
      depthCm: true,
      weightG: true,
      material: true,
      characteristics: true,
    } as const;

    // Стратифицированная загрузка по категориям.
    // Тема брифа → бакеты категорий с квотами → параллельные запросы с random offset.
    // Пул кэшируется 5 мин (timeBucket в ключе), per-request делается shuffle для разнообразия.
    // При заданном retrievalSeed offset и shuffle детерминированы → тот же бриф даёт тот же пул.
    const categoryGroup = briefToCategoryGroup(input.userPrompt);
    const categoryBuckets = getCategoryBuckets(categoryGroup);
    const rawKey = rawCandidatesCacheKey(input, categoryGroup);
    const rawCached = getCachedRawCandidates(rawKey, cacheTtl);
    let candidates: CatalogProduct[];
    let totalInDb: number;

    const seed = input.retrievalSeed ?? null;
    const shuffleRng = seed != null ? makeRng(seed ^ seedFromString(categoryGroup)) : null;
    // Fisher–Yates (несмещённый) в ОБОИХ ветках: `sort(() => Math.random() - 0.5)` даёт
    // НЕравномерную перестановку (порядок зависит от алгоритма сортировки движка) — часть
    // каталога систематически чаще оказывалась в голове пула. seededShuffle принимает любой rng.
    const shuffle = (rows: CatalogProduct[]): CatalogProduct[] =>
      seededShuffle(rows, shuffleRng ?? Math.random);

    if (rawCached) {
      this.logger.log(`Raw catalog cache hit (${rawCached.candidates.length} candidates, group=${categoryGroup}, key=${rawKey.slice(4, 12)})`);
      // Shuffle per request — разные пользователи видят разные товары из одного пула (либо
      // детерминированно при seed).
      candidates = shuffle(rawCached.candidates);
      totalInDb = rawCached.totalInDb;
      timing?.lap('prepareCatalogPipeline_db_count');
      timing?.lap('prepareCatalogPipeline_db_load');
    } else {
      totalInDb = await this.prisma.product.count();
      timing?.lap('prepareCatalogPipeline_db_count');

      // Шаг 1: считаем кол-во товаров в каждом бакете (параллельно, по индексу category)
      const counts = await Promise.all(
        categoryBuckets.map((b) =>
          this.prisma.product.count({ where: bucketWhere(where, b.categories, b.notIn) }),
        ),
      );

      // Шаг 2: загружаем каждый бакет с offset (случайным либо seeded)
      const bucketRows = await Promise.all(
        categoryBuckets.map((b: CategoryBucket, i: number) => {
          const count = counts[i] ?? 0;
          const skip =
            seed != null
              ? seededOffset(count, b.quota, makeRng(seed ^ seedFromString(b.categories[0] ?? String(i))))
              : count > b.quota
                ? Math.floor(Math.random() * (count - b.quota))
                : 0;
          return this.prisma.product.findMany({
            where: bucketWhere(where, b.categories, b.notIn),
            select: productSelect,
            orderBy: { id: 'asc' },
            skip,
            take: b.quota,
          });
        }),
      );

      candidates = bucketRows.flat().map((p) => this.mapProductRow(p));
      timing?.lap('prepareCatalogPipeline_db_load');
      setCachedRawCandidates(rawKey, candidates, totalInDb);
      this.logger.log(
        `Raw catalog loaded stratified: ${candidates.length}/${totalInDb} products, group=${categoryGroup}, ` +
          `buckets=[${categoryBuckets.map((b: CategoryBucket, i: number) => `${b.notIn ? 'catch-all' : b.categories[0]}:${counts[i]}`).join(', ')}]`,
      );
      // Shuffle для первого запроса тоже (детерминированный при seed)
      candidates = shuffle(candidates);
    }

    // Обязательные типы брифа, не попавшие в срез (SQL-гейты price/stock + случайный
    // offset бакетов могли отсечь ВСЕ SKU типа — «проектор» за 3254 ₽ при бюджете 2000),
    // дозагружаем из БД точечно, без price/stock-гейтов. Ниже по пайплайну у mandatory
    // уже есть льготы в фильтрах/пуле/сборщике — но им нужно, чтобы SKU был в памяти.
    candidates = await this.ensureMandatoryTypesLoaded(candidates, input);

    let filtered = filterCatalogForRequest(candidates, input);

    if (filtered.length > filteredMax) {
      filtered = await shortlistCatalogForLlm(filtered, input, filteredMax);
    }
    timing?.lap('prepareCatalogPipeline_js_filter');

    let relevance = filterCatalogByBriefRelevance(filtered, input.userPrompt, input.colors);
    if (relevance.length > relevanceMax) {
      relevance = await shortlistCatalogForLlm(relevance, input, relevanceMax);
    }
    timing?.lap('prepareCatalogPipeline_relevance');

    const forLlm = await stratifiedCatalogForLlm(relevance, input, stratifiedMax);
    timing?.lap('prepareCatalogPipeline_stratified');
    const overview = buildCatalogOverview(relevance, totalInDb);
    const typeIndex = indexCatalogByProductType(relevance);
    timing?.lap('prepareCatalogPipeline_type_index');

    if (
      relevance.length > 0 &&
      this.config.get<string>('CATALOG_TYPE_COVERAGE_DIAG', 'false') === 'true'
    ) {
      const { analyzeTypeCoverage } = require('./catalog-type-coverage.diagnostic');
      const coverage = analyzeTypeCoverage(relevance);
      if (coverage.otherPercent > 15) {
        this.logger.warn(
          `Type coverage: ${coverage.otherPercent}% товаров → "other" (${coverage.other}/${coverage.total}). ` +
            `Top unmatched categories: ${coverage.topOtherCategories.slice(0, 5).map((c: { category: string; count: number }) => `${c.category}(${c.count})`).join(', ')}`,
        );
      } else {
        this.logger.log(
          `Type coverage OK: ${coverage.otherPercent}% other (${coverage.other}/${coverage.total})`,
        );
      }
    }

    const result: CatalogPipelineResult = {
      totalInDb,
      filtered,
      relevance,
      forLlm,
      // Широкий пул всех категорий (candidates до relevance/eco-сужения) — для
      // диверсификации нишевых брифов. Капим для перфа; категории стратифицированы.
      // ЗАПРЕТЫ применяем и здесь: broad уходит в fullCatalog нейро-добора (archetype-core,
      // Pass-2 диверсификация) в обход filterCatalogForRequest — иначе запрещённые товары
      // возвращались через диверсификацию (прогон 22:04). Ширину по категориям сохраняем.
      broad: filterOutForbidden(candidates, input.forbiddenItems ?? []).slice(0, 2500),
      overview,
      typeIndex,
    };

    setCachedCatalogPipeline(cacheKey, result);
    this.logger.log(
      `Catalog pipeline: ${totalInDb} in DB, ${candidates.length} loaded, ` +
        `${filtered.length} filtered, ${relevance.length} relevance, ` +
        `${overview.categories.length} categories`,
    );

    return result;
  }



  isRealLlmEnabled(): boolean {

    const provider = this.config.get<string>('LLM_PROVIDER', 'openrouter');

    if (provider === 'stub') return false;

    if (provider === 'openrouter') {

      return Boolean(this.config.get<string>('OPENROUTER_API_KEY')?.trim());

    }

    if (provider === 'gemini') return Boolean(this.config.get<string>('GEMINI_API_KEY')?.trim());

    if (provider === 'deepseek') return Boolean(this.config.get<string>('DEEPSEEK_API_KEY')?.trim());

    return false;

  }



  private mapProductRow(p: {
    id: string;
    name: string;
    category: string;
    subcategory: string | null;
    description: string | null;
    sourceId: string | null;
    externalId: string | null;
    price: number | null;
    currency: string | null;
    stockAvailable: number | null;
    colors: unknown;
    silhouetteImageUrl: string;
    catalogImageUrl: string | null;
    sourceUrl: string | null;
    widthCm?: number | null;
    heightCm?: number | null;
    depthCm?: number | null;
    weightG?: number | null;
    material?: string | null;
    characteristics?: string[];
  }): CatalogProduct {
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
      colors: Array.isArray(p.colors) ? (p.colors as unknown as CatalogProduct['colors']) : [],
      silhouetteImageUrl: p.silhouetteImageUrl,
      catalogImageUrl: p.catalogImageUrl,
      imageUrl: p.catalogImageUrl || p.silhouetteImageUrl || null,
      sourceUrl: p.sourceUrl,
      widthCm: p.widthCm ?? null,
      heightCm: p.heightCm ?? null,
      depthCm: p.depthCm ?? null,
      weightG: p.weightG ?? null,
      material: p.material ?? null,
      characteristics: Array.isArray(p.characteristics) ? p.characteristics : [],
    };
  }

  async loadProductsByIds(ids: string[]): Promise<CatalogProduct[]> {
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length) return [];
    const rows = await this.prisma.product.findMany({ where: { id: { in: unique } } });
    const byId = new Map(rows.map((p) => [p.id, this.mapProductRow(p)]));
    return unique.map((id) => byId.get(id)).filter((p): p is CatalogProduct => Boolean(p));
  }

  async loadFullCatalog(): Promise<CatalogProduct[]> {
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
        widthCm: true,
        heightCm: true,
        depthCm: true,
        weightG: true,
        material: true,
        characteristics: true,
      },
    });
    const data = rows.map((p) => this.mapProductRow(p));
    this.catalogCache = { at: now, data };
    return data;
  }



  async loadCatalog(allowedItems: string[], forbiddenItems: string[]): Promise<CatalogProduct[]> {

    const all = await this.loadFullCatalog();

    return filterCatalogByConstraints(all, allowedItems, forbiddenItems);

  }



  buildInput(params: {

    userPrompt: string;

    category: string;

    quantity?: number | null;

    budgetMin?: number | null;

    budgetMax?: number | null;

    colors: string[];

    allowedItems: string[];

    forbiddenItems: string[];

    productNames: string[];

    catalog: CatalogProduct[];

    hasLogo?: boolean;

    logoUrl?: string | null;

    notes?: string | null;

    sceneOnly?: boolean;

    creativeMode?: boolean;

    catalogConceptsMode?: boolean;

    productAddMode?: boolean;

    desiredItemCount?: number;

    mandatoryConceptTypes?: string[];

  }): LlmGenerationInput {

    const desiredItemCount = params.desiredItemCount ?? defaultItemCount(params.userPrompt);

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



  /**
   * Прямой полнотекстовый поиск товаров по подсказке (для ручного до-подбора внутри
   * концепции). НЕ использует стратифицированный случайный срез и НЕ режет по остатку≥тираж —
   * иначе «футболка» на большом тираже давала пустой срез и кнопка «Добавить» падала.
   */
  /**
   * Точечная дозагрузка обязательных типов брифа, отсутствующих в стратифицированном
   * срезе: SQL-гейты (price ≤ бюджет, stock ≥ тираж) и случайный offset бакетов могут
   * отсечь все SKU типа — тогда «проектор» никогда не дойдёт до подбора. Грузим без
   * гейтов: решение о цене/остатке принимают льготы ниже + человек, а не молчаливый SQL.
   */
  private async ensureMandatoryTypesLoaded(
    candidates: CatalogProduct[],
    input: CatalogFilterInput,
  ): Promise<CatalogProduct[]> {
    try {
      const missing = missingMandatoryTypes(candidates, input.userPrompt);
      if (!missing.length) return candidates;
      let out = candidates;
      for (const slug of missing) {
        const rows = await this.searchCatalogByText(mandatoryTypeSearchTerm(slug), 200);
        const before = out.length;
        out = mergeMandatoryTypeCandidates(out, rows, slug, input.blacklistedProductIds ?? []);
        this.logger.log(
          `Mandatory type "${slug}" не попал в срез — дозагружено ${out.length - before} SKU из БД`,
        );
      }
      return out;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`ensureMandatoryTypesLoaded failed: ${msg.slice(0, 140)}`);
      return candidates;
    }
  }

  async searchCatalogByText(hint: string, limit = 800): Promise<CatalogProduct[]> {
    const term = hint.trim();
    if (!term) return [];
    const contains = (s: string) => ({ contains: s, mode: 'insensitive' as const });
    const words = term
      .split(/[\s,]+/)
      .map((w) => w.trim())
      .filter((w) => w.length >= 3)
      .slice(0, 5);
    // Матчим по НАЗВАНИЮ/подкатегории/категории, НЕ по description — иначе «зарядка»
    // ловит электробритву (у неё «зарядка» в описании), т.е. нерелевантно.
    const OR: Prisma.ProductWhereInput[] = [
      { name: contains(term) },
      { subcategory: contains(term) },
      { category: contains(term) },
      ...words.flatMap((w) => [
        { name: contains(w) } as Prisma.ProductWhereInput,
        { subcategory: contains(w) } as Prisma.ProductWhereInput,
      ]),
    ];
    try {
      const rows = await this.prisma.product.findMany({
        where: { OR },
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
          widthCm: true,
          heightCm: true,
          depthCm: true,
          weightG: true,
          material: true,
          characteristics: true,
        },
        take: limit,
      });
      return rows.map((p) => this.mapProductRow(p));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`searchCatalogByText failed: ${msg.slice(0, 140)}`);
      return [];
    }
  }

  /** Параметры брифа из текста задачи (локально + LLM) */
  async parseBriefFromPrompt(userPrompt: string): Promise<ParsedBriefResult & { source: string }> {
    const text = userPrompt.trim();
    // Локальный парсер НЕ должен ронять эндпоинт (иначе кнопка «Подобрать из брифа» = 500).
    let local: ParsedBriefResult;
    try {
      local = parseBriefLocally(text);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`parseBriefLocally failed: ${msg.slice(0, 160)}`);
      local = { updatedFields: [] };
    }
    if (text.length < 8) {
      return { ...local, source: 'local' };
    }

    const chain = this.llmFactory.getBriefParseProviderChain();
    const llmInput: LlmGenerationInput = {
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
        const merged = mergeParsedBrief(text, local, llmPartial);
        this.logger.log(`LLM [brief-parse] OK: ${name} (${Date.now() - started}ms)`);
        return { ...merged, source: merged.updatedFields.length > local.updatedFields.length ? 'hybrid' : 'local' };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`LLM [brief-parse] ${name} failed: ${msg.slice(0, 140)}`);
      }
    }

    return { ...local, source: 'local' };
  }

  private mapLlmBriefParseOutput(output: LlmGenerationOutput): Partial<ParsedBriefResult> {
    try {
      const p = JSON.parse(output.composition) as LlmBriefParseJson;
      return {
        category: p.category as BriefCategory | undefined,
        quantity: typeof p.quantity === 'number' ? p.quantity : undefined,
        setItemCount: typeof p.set_item_count === 'number' ? p.set_item_count : undefined,
        budgetMin: typeof p.budget_min === 'number' ? p.budget_min : undefined,
        budgetMax: typeof p.budget_max === 'number' ? p.budget_max : undefined,
        budgetScope:
          p.budget_scope === 'per_set' || p.budget_scope === 'total' ? p.budget_scope : undefined,
        colors: Array.isArray(p.colors) ? p.colors : undefined,
        allowedItems: Array.isArray(p.allowed_items)
          ? (p.allowed_items as BriefAllowedCategory[])
          : undefined,
        namedItems: Array.isArray(p.named_items)
          ? p.named_items.filter((x): x is string => typeof x === 'string')
          : undefined,
        forbiddenItems: Array.isArray(p.forbidden_items)
          ? (p.forbidden_items as BriefForbiddenOption[])
          : undefined,
        forbiddenNamed: Array.isArray(p.forbidden_named)
          ? p.forbidden_named.filter((x): x is string => typeof x === 'string')
          : undefined,
        alternativeTypeGroups: Array.isArray(p.alternative_type_groups)
          ? p.alternative_type_groups.filter((g) => Array.isArray(g) && g.length >= 2)
          : undefined,
        notes: p.notes,
      };
    } catch {
      return {};
    }
  }

  /**
   * LLM-КЛАССИФИКАЦИЯ НАМЕРЕНИЯ БРИФА: точная позиция (материал/цвет/характеристика) vs идея
   * (occasion/purpose) — см. catalog-single-product-llm.util.ts. Best-effort — любая ошибка/таймаут/
   * недоступность LLM → нейтральный фолбэк {mode:"idea", всё null} (пайплайн идёт как раньше, в
   * обычный идеатор без occasion/purpose контекста). Кэшируется по нормализованному тексту брифа.
   */
  async classifyBriefIntent(userPrompt: string): Promise<BriefIntentProbe> {
    const key = (userPrompt || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
    const cached = this.singleProductProbeCache.get(key);
    if (cached) return cached;

    const fallback: BriefIntentProbe = {
      mode: 'idea',
      term: null,
      material: null,
      color: null,
      characteristic: null,
      occasion: null,
      purpose: null,
    };
    const apiKey = this.config.get<string>('OPENROUTER_API_KEY');
    if (!apiKey?.trim()) return fallback;

    const model = this.config.get<string>('BRIEF_PARSE_MODEL', 'google/gemini-2.5-flash');
    const apiUrl = this.config.get<string>(
      'OPENROUTER_API_URL',
      'https://openrouter.ai/api/v1/chat/completions',
    );
    const timeoutMs = Number(this.config.get('SINGLE_PRODUCT_PROBE_TIMEOUT_MS')) || 20_000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const started = Date.now();
      const response = await openRouterFetch(apiUrl, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': this.config.get<string>('OPENROUTER_SITE_URL', 'http://localhost:3000'),
          'X-Title': this.config.get<string>('OPENROUTER_APP_NAME', 'Suvenir AI'),
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: SINGLE_PRODUCT_PROBE_SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
          response_format: { type: 'json_object' },
          temperature: 0,
          max_tokens: 500,
        }),
      });
      const text = await response.text();
      if (!response.ok) {
        this.logger.warn(`brief-intent probe: HTTP ${response.status} ${text.slice(0, 120)}`);
        return fallback;
      }
      const data = safeJsonParse(text, 'brief-intent probe') as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content ?? '';
      const probe = parseSingleProductLlmResponse(content);
      this.singleProductProbeCache.set(key, probe);
      this.logger.log(
        `LLM brief-intent probe (${model}, ${Date.now() - started}ms, contentLen=${content.length}): mode=${probe.mode} ` +
          `term=${probe.term ?? '—'} occasion=${probe.occasion ?? '—'} purpose=${probe.purpose ?? '—'}`,
      );
      return probe;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`brief-intent probe failed: ${msg.slice(0, 120)}`);
      return fallback;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Подбор набора — LLM из каталога с учётом брифа и ограничений */

  async interpretForSuggest(

    input: LlmGenerationInput,

    eligibleCatalog?: CatalogProduct[],

  ): Promise<BriefInterpretResult> {

    return this.interpret(input, eligibleCatalog, { mode: 'suggest' });

  }

  /** Добавить один товар к набору */
  async interpretForProductAdd(
    input: LlmGenerationInput,
    eligibleCatalog?: CatalogProduct[],
  ): Promise<BriefInterpretResult> {
    return this.interpret(
      { ...input, productAddMode: true, suggestMode: false },
      eligibleCatalog,
      { mode: 'suggest' },
    );
  }



  /** Генерация — OpenRouter для composition/style/image_prompt */

  async interpretForGeneration(

    input: LlmGenerationInput,

    eligibleCatalog?: CatalogProduct[],

  ): Promise<BriefInterpretResult> {

    return this.interpret(input, eligibleCatalog, { mode: 'generation' });

  }



  async interpret(

    input: LlmGenerationInput,

    eligibleCatalog?: CatalogProduct[],

    options: { mode?: LlmInterpretMode } = {},

  ): Promise<BriefInterpretResult> {

    const mode = options.mode ?? 'generation';

    const desiredCount = input.desiredItemCount ?? defaultItemCount(input.userPrompt);

    const strictCount = parseDesiredItemCount(input.userPrompt) !== null;

    const respectUser =

      this.config.get<string>('LLM_RESPECT_USER_PRODUCTS', 'true') === 'true' &&

      shouldRespectUserProducts({ ...input, desiredItemCount: desiredCount });



    const isSuggest = mode === 'suggest' && !input.productAddMode;
    const isProductAdd = Boolean(input.productAddMode);

    const creativeMode = isSuggest ? false : (input.creativeMode ?? false);

    const sceneOnly =

      !creativeMode &&

      !isSuggest &&

      !isProductAdd &&

      mode === 'generation' &&

      respectUser &&

      input.productNames.length > 0;

    const llmInput: LlmGenerationInput = {
      ...input,
      sceneOnly,
      creativeMode,
      suggestMode: isSuggest,
      productAddMode: isProductAdd,
    };



    const userPayload = buildLlmUserPayload(

      { ...llmInput, desiredItemCount: desiredCount },

      {
        respectUserProducts: respectUser || sceneOnly,
        suggestMode: isSuggest,
        productAddMode: isProductAdd,
        currentSetProducts: input.currentSetProductNames,
        addRequest: isProductAdd ? input.addRequestHint ?? input.userPrompt : undefined,
      },

    );



    let providerName = 'unknown';

    let output: LlmGenerationOutput;

    let usedFallback = false;

    let error: string | null = null;

    let modelUsed: string | null = null;

    const catalogSize = llmInput.catalogProducts?.length ?? 0;

    if (mode === 'suggest' || isProductAdd) {
      const chain = this.llmFactory.getGenerationProviderChain();
      const llmErrors: string[] = [];
      let resolved: LlmGenerationOutput | null = null;

      this.logger.log(
        `LLM [suggest]: chain=[${chain.map((c) => c.name).join(' → ') || 'none'}], catalog=${catalogSize}`,
      );

      for (const { name, provider } of chain) {
        try {
          const started = Date.now();
          this.logger.log(`LLM [suggest] trying ${name}…`);
          resolved = await provider.generate(llmInput);
          providerName = name;
          modelUsed = provider instanceof OpenrouterLlmProvider ? provider.lastModelUsed : name;
          this.logger.log(`LLM [suggest] OK: ${name} (${Date.now() - started}ms)`);
          break;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          llmErrors.push(`${name}: ${msg.slice(0, 100)}`);
          this.logger.warn(`LLM [suggest] ${name} failed: ${msg.slice(0, 140)}`);
        }
      }

      if (resolved) {
        output = isProductAdd
          ? resolved
          : sceneOnly && !creativeMode
            ? finalizeCatalogSceneLlmOutput(resolved)
            : finalizeSceneLlmOutput(resolved, llmInput.colors);
      } else {
        error = llmErrors.join(' | ') || 'No LLM providers configured';
        this.logger.warn(`LLM [suggest] fallback stub: ${error}`);
        output = await this.llmFactory.getStubProvider().generate(llmInput);
        usedFallback = true;
        providerName = 'stub-suggest';
        modelUsed = 'stub';
      }
    } else {
      const chain = this.llmFactory.getGenerationProviderChain();
      const llmErrors: string[] = [];
      let resolved: LlmGenerationOutput | null = null;

      this.logger.log(
        `LLM [generation]: chain=[${chain.map((c) => c.name).join(' → ') || 'none'}], sceneOnly=${sceneOnly}, creative=${creativeMode}`,
      );

      for (const { name, provider } of chain) {
        try {
          const started = Date.now();
          this.logger.log(`LLM [generation] trying ${name}…`);
          resolved = await provider.generate(llmInput);
          providerName = name;
          modelUsed = provider instanceof OpenrouterLlmProvider ? provider.lastModelUsed : name;
          this.logger.log(`LLM [generation] OK: ${name} (${Date.now() - started}ms)`);
          break;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          llmErrors.push(`${name}: ${msg.slice(0, 100)}`);
          this.logger.warn(`LLM [generation] ${name} failed: ${msg.slice(0, 140)}`);
        }
      }

      if (resolved) {
        output =
          sceneOnly && !creativeMode
            ? finalizeCatalogSceneLlmOutput(resolved)
            : finalizeSceneLlmOutput(resolved, llmInput.colors);
      } else {
        const allowLocal =
          this.config.get<string>('LLM_GENERATION_FALLBACK_LOCAL', 'true') === 'true';
        error = llmErrors.join(' | ') || 'No LLM providers configured';
        if (!allowLocal) {
          this.logger.error(`LLM generation failed: ${error}`);
          throw new Error(error);
        }
        this.logger.warn(
          creativeMode
            ? `Все LLM недоступны (${error}) — локальный промпт творчества`
            : `Все LLM недоступны (${error}) — локальный промпт сцены (товары не меняются)`,
        );
        output =
          sceneOnly && !creativeMode
            ? finalizeCatalogSceneLlmOutput(
                buildLocalCatalogSceneGenerationOutput({ ...llmInput, sceneOnly: true }),
              )
            : finalizeSceneLlmOutput(
                creativeMode
                  ? buildLocalCreativeGenerationOutput(llmInput)
                  : buildLocalSceneGenerationOutput({ ...llmInput, sceneOnly: true }),
                llmInput.colors,
              );
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



    const pickFrom =

      eligibleCatalog && eligibleCatalog.length > 0

        ? eligibleCatalog

        : filterCatalogByConstraints(

            input.catalogProducts ?? [],

            input.allowedItems,

            input.forbiddenItems,

          );



    let products = resolveLlmProductSelection(

      output.items,

      pickFrom,

      input.productNames,

      respectUser,

      desiredCount,

      strictCount,

      isProductAdd
        ? {
            excludeVariantKeys: new Set(input.excludeVariantKeys ?? []),
            brandColors: input.colors,
          }
        : undefined,

    );

    const shouldEnforceSet =
      !isProductAdd &&
      !sceneOnly &&
      !(respectUser && input.productNames.length > 0);

    if (shouldEnforceSet) {
      const budgetPerSet = resolveBudgetPerSet(input.budgetMin, input.budgetMax);
      products = enforceSingleSetComposition(
        products,
        pickFrom,
        desiredCount,
        budgetPerSet,
        isSuggest ? 11 : 29,
        input.userPrompt,
        output.composition ?? '',
      );
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



  getSystemPrompt(respectUserProducts: boolean, creativeMode = false): string {

    if (creativeMode) return buildLlmSystemPromptForCreative();

    return buildLlmSystemPrompt(respectUserProducts);

  }



  getUserMessage(userPayload: ReturnType<typeof buildLlmUserPayload>): string {

    return buildLlmUserMessage(userPayload);

  }

}



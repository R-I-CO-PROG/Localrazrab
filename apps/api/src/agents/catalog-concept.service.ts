import { Injectable, Logger } from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import { LlmBriefService } from '../providers/llm/llm-brief.service';

import { LlmProviderFactory } from '../providers/llm/llm.provider';

import { OpenrouterLlmProvider } from '../providers/llm/openrouter-llm.provider';

import {

  filterCatalogForRequest,

  type CatalogFilterInput,

} from '../providers/llm/catalog-filter.util';

import {

  buildCatalogOverview,

  stratifiedCatalogForLlm,

} from '../providers/llm/catalog-index.util';

import { resolveBudgetPerSet, assertBudgetPerSetInRange, estimateSetTotalPrice, resolveSetBudgetRange } from '../providers/llm/set-budget.util';
import { summarizeSetFulfillment, productStockShortfall } from '../providers/llm/catalog-fulfillment.util';

import { filterCatalogByBriefRelevance } from '../providers/llm/catalog-brief-relevance.util';

import {
  resolveConceptFromSlots,
  buildCompositionFromProducts,
  type ProductSlot,
  indexCatalogByProductType,
} from '../providers/llm/catalog-slot-picker.util';

import {
  ensureConceptProducts,
  resolveConceptProductSelection,
  upgradeSetToTargetBudget,
} from '../providers/llm/concept-product-picker.util';

import type { CatalogProduct } from '../providers/llm/catalog.util';

import {
  isVariantBlocked,
  isCrossConceptLineBlocked,
  crossConceptLineKeys,
  registerCrossConceptBlock,
  registerCrossConceptLineKeys,
  upgradeToBrandColorVariants,
} from '../providers/llm/catalog-variant.util';

import { buildBrandColorScoreFn, pickCatalogColorNameForBrand } from '../providers/llm/catalog-color-match.util';

import { parseCatalogConceptsJson, type LlmCatalogConceptJson } from '../providers/llm/parse-llm-json';

import { defaultItemCount } from '../providers/llm/parse-desired-count';
import {
  averageItemCount,
  pickConceptItemCount,
  resolveProductCountBounds,
  type ProductCountBounds,
} from '../providers/llm/product-count-bounds.util';

import { resolveCatalogImageUrl } from '../products/product-image.util';

import { reconcileBriefConstraints } from '../requests/brief-constraints.util';
import {
  extractBriefColorsFromText,
  inferDefaultBudgetForBrief,
  parseBriefLocally,
} from '../requests/parse-brief.util';
import { normalizeRequestColors, expandAbstractColorsFromText } from '../requests/request-colors.util';
import { resolveMandatoryTypesForBrief } from '../requests/mandatory-types.util';
import {
  isDirectedBriefMode,
  isExclusiveBriefMode,
  resolveNamedItemsForBrief,
  splitAllowedItemsMixed,
} from '../requests/named-positions.util';
import { generateLocalCatalogIdeas } from '../providers/llm/catalog-local-ideator.util';

import {

  ConceptDiversityTracker,

  detectMandatoryConceptTypesFromBrief,
  detectAlternativeTypeGroupsFromBrief,

  detectConceptProductType,
  clearConceptProductTypeCache,
  typeConflictsInSet,

  enforceConceptSetDiversity,

} from '../providers/llm/concept-diversity.util';

import { scoreBriefRelevance, buildBriefRelevanceContext, scoreBriefRelevanceWithContext } from '../providers/llm/catalog-brief-relevance.util';

import type { Concept, CatalogIdeatorOutput, CriticOutput } from './contracts';

import type { AgentBriefContext } from './brief-context.util';

import { CatalogIdeatorAgent } from './catalog-ideator.agent';

import { CatalogCriticAgent } from './catalog-critic.agent';

import type { AgentDebugTraceFn } from './agent-debug.types';

import { pickTopCatalogIdeasLocally } from '../providers/llm/catalog-fast-select.util';
import {
  CatalogPipelineTiming,
  timedStage,
  timedStageSync,
} from '../providers/llm/catalog-pipeline-timing.util';
import type { GenerationHistory } from './previous-generation.util';
import {
  refillConceptsAvoidingPrevious,
  replacePreviousGenerationProducts,
} from '../providers/llm/regeneration-novelty.util';
import {
  enforceGlobalConceptUniqueness,
  seedVariantKeysFromProductIds,
} from '../providers/llm/cross-concept-uniqueness.util';
import {
  extractProductKeywordsFromBrief,
  findProductsByBriefKeywords,
} from '../providers/llm/brief-keyword-search.util';
import {
  finalizeConceptSelection,
  scoreConceptSetQuality,
  selectionConstraintsFromFilterInput,
  buildSetWithRelaxation,
  hasValidProductImage,
  hasValidProductPrice,
  isLowRelevanceJunk,
  productPassesQualityGate,
  type SelectionValidationReport,
} from '../concept/selection-constraints';
import { detectProductRole, isCorporateSetFiller } from '../concept/product-role.util';
import { familyForType } from '../concept/product-taxonomy';
import { CRITIC_TOP_N } from './agent.constants';
import { OpenrouterAgentClient } from './openrouter-agent.client';
import { CatalogNeuralSelectorService } from './catalog-neural-selector.service';
import { CatalogEmbeddingService } from './catalog-embedding.service';
import { SelectionLedger } from '../providers/llm/catalog-selection-ledger';
import type { ConceptBoldness } from '../providers/llm/catalog-neural-selector.types';
import { critiqueConceptSetsWithLlm } from '../providers/llm/catalog-llm-set-critic.util';
import { rebuildConceptSetsWithLlm, type SetBuilderConcept } from '../providers/llm/llm-set-builder.util';



const TARGET_CONCEPTS_DEFAULT = 8;

type RawCatalogConcept = LlmCatalogConceptJson & {
  productSlots?: ProductSlot[];
  boldness?: number;
  whyItFits?: string;
  themeAxis?: string;
};



export interface CatalogDiscoverResult {

  concepts: Concept[];

  ideatorOutput?: CatalogIdeatorOutput;

  criticOutput?: CriticOutput;

  pipeline: 'ideator_critic' | 'legacy_llm' | 'fallback';

  timingMs?: number;

  timingStages?: Record<string, number>;

}



@Injectable()

export class CatalogConceptService {

  private readonly logger = new Logger(CatalogConceptService.name);



  constructor(

    private readonly llmBrief: LlmBriefService,

    private readonly llmFactory: LlmProviderFactory,

    private readonly config: ConfigService,

    private readonly catalogIdeator: CatalogIdeatorAgent,

    private readonly catalogCritic: CatalogCriticAgent,

    private readonly openrouter: OpenrouterAgentClient,

    private readonly neuralSelector: CatalogNeuralSelectorService,

    private readonly embeddingService: CatalogEmbeddingService,

  ) {}

  private neuralSelectorEnabled(): boolean {
    return this.config.get<string>('CATALOG_NEURAL_SELECTOR', 'true') !== 'false';
  }

  private targetConceptCount(): number {
    const n = Number(this.config.get('CATALOG_TARGET_CONCEPTS', String(TARGET_CONCEPTS_DEFAULT)));
    return Number.isFinite(n) && n > 0 ? Math.min(12, Math.round(n)) : TARGET_CONCEPTS_DEFAULT;
  }



  /**
   * Публичная точка входа: гарантирует, что наружу НЕ выйдет ни одно исключение
   * (иначе прогон помечается failed) — катастрофический сбой деградирует в пустой,
   * но завершённый результат. Основной контракт непустых наборов держит
   * discoverConceptsInner (нейро-сборка + обёрнутая пост-обработка).
   */
  async discoverConcepts(
    ...args: Parameters<CatalogConceptService['discoverConceptsInner']>
  ): Promise<CatalogDiscoverResult> {
    try {
      return await this.discoverConceptsInner(...args);
    } catch (err) {
      this.logger.error(
        `discoverConcepts crashed — empty graceful result: ${err instanceof Error ? err.stack : String(err)}`,
      );
      return { concepts: [], pipeline: 'fallback' };
    }
  }

  private async discoverConceptsInner(

    briefInput: AgentBriefContext,

    request: {

      userPrompt: string;

      category: string;

      budgetMin: number | null;

      budgetMax: number | null;

      quantity: number | null;

      setItemCount?: number | null;

      useProductCountLimit?: boolean | null;

      minProductsPerSet?: number | null;

      maxProductsPerSet?: number | null;

      colors: unknown;

      allowedItems: unknown;

      forbiddenItems: unknown;

      blacklistedProductIds?: unknown;

      blacklistedSupplierIds?: unknown;

      assets: Array<{ type: string; url?: string }>;

    },

    options?: { trace?: AgentDebugTraceFn; generationHistory?: GenerationHistory | null },
  ): Promise<CatalogDiscoverResult> {
    const timing = new CatalogPipelineTiming();
    clearConceptProductTypeCache();
    timing.lap('discover_setup');
    briefInput.userQuery = briefInput.userQuery ?? '';
    let normalizedPrompt = String(request.userPrompt ?? briefInput.userQuery ?? '').trim();
    if (['undefined', 'null', ''].includes(normalizedPrompt)) normalizedPrompt = '';
    briefInput.userQuery = String(briefInput.userQuery ?? '').trim();
    if (['undefined', 'null', ''].includes(briefInput.userQuery)) {
      briefInput.userQuery = '';
    }
    if (!normalizedPrompt && briefInput.userQuery) normalizedPrompt = briefInput.userQuery;
    request.userPrompt = normalizedPrompt;
    if (!request.userPrompt) {
      const categoryFallback = String(request.category ?? '').trim();
      request.userPrompt = categoryFallback || 'корпоративные подарочные наборы';
      this.logger.warn(
        `discoverConcepts: empty userPrompt — using fallback "${request.userPrompt.slice(0, 80)}"`,
      );
    }
    briefInput.userQuery = request.userPrompt;

    const parsedBrief = parseBriefLocally(request.userPrompt);

    // Бюджет из текста брифа или эвристики по типу брифа (ночные прогоны с undefined-undefined₽).
    let budgetMin = request.budgetMin;
    let budgetMax = request.budgetMax;

    if (typeof budgetMin === 'string') {
      budgetMin = budgetMin === 'undefined' || budgetMin === 'null' ? null : parseFloat(budgetMin);
    }
    if (typeof budgetMax === 'string') {
      budgetMax = budgetMax === 'undefined' || budgetMax === 'null' ? null : parseFloat(budgetMax);
    }

    if (budgetMin === undefined || budgetMin === null || isNaN(budgetMin) || budgetMax === undefined || budgetMax === null || isNaN(budgetMax)) {
      if ((budgetMin === undefined || budgetMin === null || isNaN(budgetMin)) && parsedBrief.budgetMin != null) {
        budgetMin = parsedBrief.budgetMin;
      }
      if ((budgetMax === undefined || budgetMax === null || isNaN(budgetMax)) && parsedBrief.budgetMax != null) {
        budgetMax = parsedBrief.budgetMax;
      }
      const inferred = inferDefaultBudgetForBrief(request.userPrompt);
      if (budgetMin == null || isNaN(budgetMin)) {
        budgetMin = inferred.budgetMin;
      }
      if (budgetMax == null || isNaN(budgetMax)) {
        budgetMax = inferred.budgetMax;
      }
      if (budgetMin == null || isNaN(budgetMin)) {
        budgetMin = 1000; // Default minimum budget
      }
      if (budgetMax == null || isNaN(budgetMax)) {
        budgetMax = 3000; // Default maximum budget
      }

      if (parsedBrief.budgetMin != null || parsedBrief.budgetMax != null) {
        this.logger.log(
          `discoverConcepts: budget from brief text → ${budgetMin ?? '?'}-${budgetMax ?? '?'}₽`,
        );
      } else {
        this.logger.log(
          `discoverConcepts: inferred budget → ${budgetMin}-${budgetMax}₽`,
        );
      }
    }
    request.budgetMin = budgetMin;
    request.budgetMax = budgetMax;

    const colorsFromBrief = extractBriefColorsFromText(request.userPrompt ?? '');
    const colors = [
      ...new Set([
        ...normalizeRequestColors(request.colors),
        ...colorsFromBrief,
        ...expandAbstractColorsFromText(request.userPrompt),
      ]),
    ];

    const rawAllowed = [
      ...((request.allowedItems as string[]) ?? []),
      ...(parsedBrief.allowedItems ?? []),
    ];

    const rawForbidden = [
      ...((request.forbiddenItems as string[]) ?? []),
      ...(parsedBrief.forbiddenItems ?? []),
    ];

    const splitAllowed = splitAllowedItemsMixed(rawAllowed);
    const namedResolved = resolveNamedItemsForBrief(request.userPrompt, rawAllowed);
    const directedMode = isDirectedBriefMode(namedResolved.namedTypes);

    const { allowedItems, forbiddenItems } = reconcileBriefConstraints(

      request.userPrompt,

      [...splitAllowed.categories, ...namedResolved.categoryBuckets],

      rawForbidden,

      request.budgetMax,

    );

    const logoAsset = request.assets.find((a) => a.type === 'logo');

    const budgetPerSet = resolveBudgetPerSet(request.budgetMin, request.budgetMax);
    const countBounds = resolveProductCountBounds({ ...request, budgetPerSet });
    const desiredCount = averageItemCount(countBounds);

    const mandatoryConceptTypes = resolveMandatoryTypesForBrief(
      request.userPrompt,
      rawAllowed,
    );
    const alternativeTypeGroups = detectAlternativeTypeGroupsFromBrief(request.userPrompt);

    if (directedMode) {
      this.logger.log(
        `Directed brief mode: mandatory named types [${namedResolved.namedTypes.join(', ')}] from [${namedResolved.namedItems.join(', ')}]`,
      );
    }

    const diversityTracker = new ConceptDiversityTracker(new Set(mandatoryConceptTypes));

    assertBudgetPerSetInRange(
      budgetPerSet,
      request.budgetMin,
      request.budgetMax,
      (msg) => this.logger.warn(msg),
    );
    if (budgetPerSet != null) {
      this.logger.log(
        `budgetPerSet=${budgetPerSet} (budgetMin=${request.budgetMin}, budgetMax=${request.budgetMax}, quantity=${request.quantity})`,
      );
    }

    const generationHistory = options?.generationHistory ?? null;
    const previousProductIds = new Set(generationHistory?.productIds ?? []);
    // Случайный «старт» подбора: при одинаковом запросе наборы будут разными.
    // Seed влияет на ротацию выбора внутри топ-кандидатов — качество сохраняется,
    // но конкретные SKU варьируются от прогона к прогону. CATALOG_RUN_SEED фиксирует
    // seed (детерминизм в тестах); в проде не задан → случайный каждый прогон.
    const seedOverride = this.config.get<string>('CATALOG_RUN_SEED', '');
    const runSeed =
      seedOverride !== '' && Number.isFinite(Number(seedOverride))
        ? Number(seedOverride)
        : Math.floor(Math.random() * 1_000_000);
    const regenerationSeed = (generationHistory?.generationCount ?? 0) * 997 + runSeed;

    const blacklistedProductIds = [
      ...new Set([
        ...((request.blacklistedProductIds as string[]) ?? []),
        ...(generationHistory?.productIds ?? []),
      ]),
    ];
    const blacklistedSupplierIds = (request.blacklistedSupplierIds as string[]) ?? [];

    const filterInput: CatalogFilterInput = {

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
    const catalogPipeline = await this.llmBrief.prepareCatalogPipeline(
      filterInput,
      stratifiedMax,
      timing,
    );
    const fullCatalog = catalogPipeline.relevance;
    const filteredCatalog = catalogPipeline.filtered;
    const relevanceCatalog = catalogPipeline.relevance;
    // Широкий пул всех категорий (до eco/relevance-сужения) — для диверсификации и
    // добора нишевых брифов, где relevance схлопывается до десятков SKU (эко=18 сумок).
    const broadCatalog = catalogPipeline.broad?.length ? catalogPipeline.broad : filteredCatalog;
    const catalogForLlm = catalogPipeline.forLlm;
    const catalogOverview = catalogPipeline.overview;
    const catalogTypeIndex = catalogPipeline.typeIndex;
    const fastPipeline = this.config.get<string>('CATALOG_FAST_PIPELINE', 'true') !== 'false';

    // СЕМАНТИЧЕСКОЕ ОБОГАЩЕНИЕ (флаг CATALOG_SEMANTIC_FIT, дефолт on): проставляем каждому
    // кандидату semanticFit к интенту подарка аудитории через pgvector. Различает «органайзер для
    // документов»(+) и «органайзер для багажника»(−), что keyword-правила не могут. Fallback:
    // при недоступности эмбеддингов/интента карта пустая, semanticFit=null, поведение прежнее.
    if (this.config.get<string>('CATALOG_SEMANTIC_FIT', 'true') !== 'false') {
      try {
        const candidates = [...new Set([...relevanceCatalog, ...broadCatalog].map((p) => p.id))];
        const fitMap = await this.embeddingService.semanticFit(request.userPrompt, candidates);
        if (fitMap.size) {
          for (const p of relevanceCatalog) { const f = fitMap.get(p.id); if (f != null) p.semanticFit = f; }
          for (const p of broadCatalog) { const f = fitMap.get(p.id); if (f != null) p.semanticFit = f; }
        }
      } catch (e) {
        this.logger.warn(`Semantic enrichment skipped: ${(e as Error).message}`);
      }
    }

    this.logger.log(
      `Catalog pipeline: ${catalogPipeline.totalInDb} total, ${filteredCatalog.length} filtered, ` +
        `${relevanceCatalog.length} relevance-scored, ${catalogOverview.categories.length} categories`,
    );



    const agentBrief: AgentBriefContext = {

      ...briefInput,

      allowedItems,

      forbiddenItems,

    };



    let rawConcepts: RawCatalogConcept[] = [];

    let usedFallback = false;

    let pipeline: CatalogDiscoverResult['pipeline'] = 'ideator_critic';

    let ideatorOutput: CatalogIdeatorOutput | undefined;

    let criticOutput: CriticOutput | undefined;



    try {

      const ideatorResult = await timedStage(timing, 'ideator_llm', () =>
        this.catalogIdeator.generateIdeas({
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
        }),
      );

      ideatorOutput = { ideas: ideatorResult.ideas };

      usedFallback = ideatorResult.usedFallback;

      if (fastPipeline) {
        criticOutput = timedStageSync(timing, 'critic_local', () =>
          pickTopCatalogIdeasLocally(
            ideatorResult.ideas,
            agentBrief,
            CRITIC_TOP_N,
            generationHistory,
            this.targetConceptCount(),
          ),
        );
        this.logger.log(
          `Catalog fast select: ${ideatorResult.ideas.length} ideas → ${criticOutput.topIdeas.length} sets (no LLM Critic)`,
        );
      } else {
        criticOutput = await timedStage(timing, 'critic_llm', () =>
          this.catalogCritic.pickTop5(
            ideatorResult.ideas,
            {
              ...agentBrief,
              desiredItemCount: countBounds.max,
              budgetPerSet,
              mandatoryTypes: mandatoryConceptTypes,
            },
            options?.trace,
          ),
        );
      }



      rawConcepts = criticOutput.topIdeas.map((top) => {

        const full = ideatorResult.ideas.find((i) => i.title === top.title);

        return {

          title: top.title,

          composition: top.conceptSummary ?? full?.composition ?? '',

          style: full?.style ?? 'корпоративный',

          items: full?.items ?? [],

          productSlots: full?.productSlots ?? [],

          boldness: full?.boldness,

          whyItFits: full?.whyItFits,

          themeAxis: full?.themeAxis,

        };

      });



      this.logger.log(

        `Catalog Ideator→Critic: ${ideatorResult.ideas.length} ideas → ${rawConcepts.length} sets`,

      );

    } catch (agentErr) {

      const msg = agentErr instanceof Error ? agentErr.message : String(agentErr);

      this.logger.warn(`Catalog Ideator→Critic failed: ${msg} — trying legacy LLM`);

      pipeline = 'legacy_llm';



      try {

        rawConcepts = await this.callLegacyCatalogConceptsLlm(

          request,

          catalogForLlm,

          colors,

          allowedItems,

          forbiddenItems,

          desiredCount,

          mandatoryConceptTypes,

          Boolean(logoAsset),

          logoAsset?.url ?? null,

        );

      } catch (legacyErr) {

        const legacyMsg = legacyErr instanceof Error ? legacyErr.message : String(legacyErr);

        this.logger.warn(`Legacy catalog LLM failed: ${legacyMsg} — using algorithmic fallback`);

        pipeline = 'fallback';

        usedFallback = true;

        rawConcepts = this.buildFallbackConcepts(

          catalogForLlm,

          desiredCount,

          request.userPrompt,

          diversityTracker,

        );

      }

    }



    if (rawConcepts.length === 0) {
      this.logger.warn('No catalog ideas after pipeline — generating local fallback concepts');
      pipeline = 'fallback';
      usedFallback = true;
      const localIdeas = generateLocalCatalogIdeas({
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

    // Гарантия 5 концепций: если идеатор/критик дали меньше — добираем локальными идеями
    // (иначе нейро-сборка построит < target, и контракт вернёт меньше наборов).
    if (this.neuralSelectorEnabled() && rawConcepts.length < this.targetConceptCount()) {
      const extraLocal = generateLocalCatalogIdeas({
        userPrompt: request.userPrompt,
        category: request.category,
        desiredItemCount: countBounds.max,
        mandatoryTypes: mandatoryConceptTypes,
        namedTypes: namedResolved.namedTypes,
        namedItems: namedResolved.namedItems,
        directedMode,
        alternativeTypeGroups,
        count: this.targetConceptCount() + 2,
      });
      const haveTitles = new Set(rawConcepts.map((c) => c.title));
      for (const idea of extraLocal) {
        if (rawConcepts.length >= this.targetConceptCount()) break;
        if (haveTitles.has(idea.title)) continue;
        haveTitles.add(idea.title);
        rawConcepts.push({
          title: idea.title,
          composition: idea.composition,
          style: idea.style ?? 'корпоративный',
          items: idea.items ?? [],
          productSlots: idea.productSlots ?? [],
          boldness: idea.boldness,
        });
      }
    }

    // Гарантия boldness-якорей (≥1 стандартный=0 и ≥1 смелый=2) среди целевых концепций.
    if (this.neuralSelectorEnabled()) {
      const head = rawConcepts.slice(0, this.targetConceptCount());
      const bvals = head.map((c) => Math.min(2, Math.max(0, Math.round(c.boldness ?? 1))));
      if (head.length >= 1 && !bvals.includes(0)) head[0].boldness = 0;
      if (head.length >= 3 && !bvals.includes(2)) head[head.length - 1].boldness = 2;
    }

    const usedProductIds = new Set<string>(generationHistory?.productIds ?? []);
    const catalogById = new Map(relevanceCatalog.map((p) => [p.id, p]));
    const usedVariantKeys = new Set<string>(generationHistory?.productVariantKeys ?? []);
    const usedLineKeys = new Set<string>();
    for (const vk of seedVariantKeysFromProductIds(usedProductIds, catalogById)) {
      usedVariantKeys.add(vk);
    }
    for (const id of usedProductIds) {
      const row = catalogById.get(id);
      if (row) registerCrossConceptLineKeys(row, usedLineKeys, request.userPrompt);
    }
    if (usedProductIds.size > 0 || usedVariantKeys.size > 0) {
      this.logger.log(
        `Cross-concept seed: ${usedProductIds.size} blocked ids, ${usedVariantKeys.size} blocked variant keys from history`,
      );
    }

    const concepts: Concept[] = [];
    // Сколько наборов прогона уже содержали данное семейство — для мягкого
    // межконцептового анти-однообразия (плед/сумка/зонт не во всех 5 наборах).
    const familyUsage = new Map<string, number>();

    const targetConcepts = this.targetConceptCount();

    const conceptBuildCount = Math.min(rawConcepts.length, targetConcepts);
    // Последовательная сборка — БЫСТРЕЕ и КОРРЕКТНЕЕ: концепции делят состояние
    // (usedProductIds / diversity-трекер), поэтому каждая следующая работает с уже
    // суженным пулом. «Параллельная» давала каждой копию состояния → они не видели
    // выборы друг друга → дубли + полный пул каждой → 76с вместо ~3с (и JS однопоточный,
    // настоящего параллелизма нет). Оставлено за явным флагом для экспериментов.
    // Всегда последовательно: общий usedProductIds/line-key и diversity-трекер между наборами.
    const parallelToConcept = false;
    const diversityMandatory = new Set(mandatoryConceptTypes);

    const runToConcept = (
      raw: RawCatalogConcept,
      index: number,
      blockedIds: Set<string>,
      blockedVariants: Set<string>,
      blockedLineKeys: Set<string>,
      tracker: ConceptDiversityTracker,
    ): Concept =>
      this.toConcept(
        raw,
        catalogForLlm,
        relevanceCatalog,
        pickConceptItemCount(countBounds, index),
        index,
        usedFallback,
        blockedIds,
        blockedVariants,
        blockedLineKeys,
        colors,
        tracker,
        budgetPerSet,
        request.userPrompt,
        filterInput,
        catalogTypeIndex,
        options?.trace,
        regenerationSeed,
      );

    const absorbConceptIntoRunState = (concept: Concept): void => {
      concepts.push(concept);
      const types: string[] = [];
      for (const cp of concept.catalogProducts ?? []) {
        usedProductIds.add(cp.id);
        const row = catalogById.get(cp.id);
        // ТИП фиксируем ВСЕГДА (для familyUsage/variety-cap): row из узкого среза может не
        // содержать нейро-товар из широкого каталога — тогда берём тип из самой позиции cp.
        // Без этого familyUsage недосчитывался и межконцептовый лимит НЕ срабатывал.
        const typeSource: CatalogProduct = row ?? ({
          id: cp.id,
          name: cp.name,
          category: cp.category ?? '',
          description: '',
        } as CatalogProduct);
        types.push(detectConceptProductType(typeSource));
        if (row) {
          registerCrossConceptBlock(row, usedProductIds, usedVariantKeys);
          registerCrossConceptLineKeys(row, usedLineKeys, request.userPrompt);
        } else if (cp.name?.trim()) {
          // Блокируем линейку по имени, если строки каталога нет — иначе Madras/PB030/Neat повторяются.
          for (const lk of crossConceptLineKeys(typeSource, request.userPrompt)) {
            usedVariantKeys.add(lk);
            usedLineKeys.add(lk);
          }
        }
      }
      if (types.length > 0) {
        diversityTracker.recordConceptTypes(types);
        // +1 за КАЖДОЕ уникальное семейство этого набора (счётчик «в скольких наборах было»).
        for (const fam of new Set(types.map((t) => familyForType(t)))) {
          familyUsage.set(fam, (familyUsage.get(fam) ?? 0) + 1);
        }
      }
    };

    if (this.neuralSelectorEnabled()) {
      // Нейро-подбор: retrieval → LLM-байер → детерминированная сборка с общим реестром.
      const sharedLedger = new SelectionLedger(
        usedProductIds,
        usedVariantKeys,
        usedLineKeys,
        request.userPrompt,
      );
      // Обязательные типы нужны в КАЖДОМ наборе — без льготы бренд-line-key ('rombica')
      // блокировал бы все проекторы каталога после первого же набора.
      sharedLedger.setMandatoryTypes([
        ...new Set([...mandatoryConceptTypes, ...namedResolved.namedTypes]),
      ]);
      const minItems = filterInput.minProductsPerSet ?? countBounds.min;
      const maxItems = filterInput.maxProductsPerSet ?? countBounds.max;
      // Семантический кросс-концептовый дедуп: накапливаем id использованных товаров и перед
      // каждым следующим набором исключаем смыслово-близкие кандидаты («ручка/папка/рюкзак везде»).
      const semanticDedup = this.config.get<string>('CATALOG_SEMANTIC_DEDUP', 'true') !== 'false';
      const semUsedIds: string[] = [];
      const dedupCandidateIds = [...new Set([...relevanceCatalog, ...broadCatalog].map((p) => p.id))];
      for (let index = 0; index < conceptBuildCount; index++) {
        const raw = rawConcepts[index]!;
        const boldness = Math.min(
          2,
          Math.max(0, Math.round(raw.boldness ?? 1)),
        ) as ConceptBoldness;
        let excludedProductIds: Set<string> | undefined;
        if (semanticDedup && index > 0 && semUsedIds.length) {
          excludedProductIds = await this.embeddingService
            .similarToUsed(semUsedIds, dedupCandidateIds)
            .catch(() => new Set<string>());
        }
        const concept = await timedStage(timing, `neural_select_${index + 1}`, async () => {
          const products = await this.neuralSelector.selectConceptProducts({
            raw,
            boldness,
            // Широкий релевантный пул для шортлистов — у типовых слотов (бутылка/блокнот)
            // должны быть кандидаты своего типа, а не флуд доминирующей категории.
            catalog: (relevanceCatalog.length ? relevanceCatalog : catalogForLlm).slice(0, 1500),
            // Диверсификация/добор — по ШИРОКОМУ каталогу всех категорий: на нишевых
            // брифах (эко=18 сумок) on-brief пул монокатегорийный, и только широкий пул
            // даёт байеру разнообразие (кружки/бутылки/блокноты/техника) для связного набора.
            fullCatalog: broadCatalog.length ? broadCatalog : relevanceCatalog.length ? relevanceCatalog : catalogForLlm,
            ledger: sharedLedger,
            minItems,
            maxItems,
            budgetPerSet,
            brief: request.userPrompt,
            brandColors: colors,
            excludedItems: forbiddenItems,
            familyUsage,
            // Названные пользователем позиции («повербанк»…) + обязательные типы брифа —
            // гарантируем их в пуле кандидатов и в собранном наборе (точный подбор).
            mandatoryTypes: [
              ...new Set([...mandatoryConceptTypes, ...namedResolved.namedTypes]),
            ],
            tirage: filterInput.quantity ?? request.quantity ?? null,
            conceptIndex: index,
            excludedProductIds,
            trace: options?.trace,
          });
          semUsedIds.push(...products.map((p) => p.id));
          return this.mapProductsToConcept(
            raw.title?.trim() || `Набор ${index + 1}`,
            buildCompositionFromProducts(products, raw.style, raw.composition),
            raw.style,
            products,
            usedFallback,
            index,
            undefined,
            undefined,
            colors,
            undefined,
            budgetPerSet,
            filterInput.quantity ?? request.quantity ?? null,
          );
        });
        absorbConceptIntoRunState(concept);
      }
    } else if (parallelToConcept && conceptBuildCount > 1) {
      const built = await timedStage(timing, 'toConcept_parallel', () =>
        Promise.all(
          Array.from({ length: conceptBuildCount }, (_, index) =>
            runToConcept(
              rawConcepts[index]!,
              index,
              new Set(usedProductIds),
              new Set(usedVariantKeys),
              new Set(usedLineKeys),
              new ConceptDiversityTracker(diversityMandatory),
            ),
          ),
        ),
      );
      for (const concept of built) {
        absorbConceptIntoRunState(concept);
      }
    } else {
      for (let index = 0; index < conceptBuildCount; index++) {
        absorbConceptIntoRunState(
          timedStageSync(timing, `toConcept_${index + 1}`, () =>
            runToConcept(
              rawConcepts[index]!,
              index,
              usedProductIds,
              usedVariantKeys,
              usedLineKeys,
              diversityTracker,
            ),
          ),
        );
      }
    }

    // Пост-обработка обёрнута: любая ошибка здесь НЕ теряет уже собранные наборы
    // (нейро-сборка гарантирует непустые наборы) и не роняет прогон.
    // При нейро-режиме реестр уже гарантирует уникальность/контракт, поэтому
    // старые проходы (refill/global-uniqueness/set-builder/repair) выключены —
    // они переписывали/обедняли нейро-подбор и плодили пустые наборы.
    const neuralOn = this.neuralSelectorEnabled();
    let finalConcepts: Concept[] = concepts.slice(0, targetConcepts);
    try {

    while (concepts.length < targetConcepts && catalogForLlm.length > 0) {

      const extra = this.buildFallbackConcepts(

        catalogForLlm,

        countBounds.max,

        request.userPrompt,

        diversityTracker,

        concepts.length,

        usedProductIds,

        usedVariantKeys,

      );

      for (const raw of extra) {

        if (concepts.length >= targetConcepts) break;

        const conceptItemCount = pickConceptItemCount(countBounds, concepts.length);

        concepts.push(

          this.toConcept(

            raw,

            catalogForLlm,

            relevanceCatalog,

            conceptItemCount,

            concepts.length,

            true,

            usedProductIds,

            usedVariantKeys,

            usedLineKeys,

            colors,

            diversityTracker,

            budgetPerSet,

            request.userPrompt,

            filterInput,

            catalogTypeIndex,

            options?.trace,

            regenerationSeed,

          ),

        );

      }

      break;

    }



    const emptyCount = concepts.filter((c) => !c.catalogProducts?.length).length;

    if (!neuralOn && emptyCount > 0) {

      this.logger.warn(

        `Catalog concepts: ${emptyCount}/${concepts.length} sets empty — attempting refill`,

      );

      this.refillEmptyConceptProducts(

        concepts,

        (relevanceCatalog.length ? relevanceCatalog : catalogForLlm).slice(0, 2000),

        desiredCount,

        usedProductIds,

        usedVariantKeys,

        usedLineKeys,

        diversityTracker,

        budgetPerSet,

        request.userPrompt,

        colors,

        filterInput,

        catalogTypeIndex,

      );

    }



    concepts.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

    finalConcepts = concepts.slice(0, targetConcepts);

    // Ограничиваем пул для set-builder/критика; финальный dedup — полный relevance-пул (до 2000),
    // иначе после блокировок line-key не хватает SKU для добора minProductsPerSet.
    const postProcessCatalog = (
      relevanceCatalog.length ? relevanceCatalog : catalogForLlm
    ).slice(0, 1600);
    const finalUniquenessCatalog = (
      relevanceCatalog.length ? relevanceCatalog : catalogForLlm
    ).slice(0, 2000);
    if (!neuralOn) {
      finalConcepts = enforceGlobalConceptUniqueness(
        finalConcepts,
        finalUniquenessCatalog,
        request.userPrompt,
        colors,
        filterInput.minProductsPerSet ?? desiredCount,
        (msg) => this.logger.warn(msg),
        budgetPerSet,
        directedMode,
      );
    }

    // НЕЙРО-ПОДБОР товаров: нейросеть пересобирает каждый набор из шортлиста
    // (категория→подкатегория→товар), учитывая идею, уже выбранные товары, бюджет;
    // + строгие ограничения (нет повтора категории/роли в наборе, нет повтора товара
    // даже др. цвета во всей концепции, приоритет польз. категорий, исключение запрещённых).
    // Заменяет прежний rule-based LLM-критик. Флаг CATALOG_LLM_SET_BUILDER=false вернёт старое.
    // Нейро-селектор уже собрал наборы из шортлистов с общим реестром — старый
    // LLM set-builder + фазы ремонта (reFinalize/repairThin) НЕ запускаем: они бы
    // пересобрали/исказили нейро-подбор и являются вероятным источником пустых/падений.
    const useSetBuilder =
      !neuralOn && this.config.get<string>('CATALOG_LLM_SET_BUILDER', 'true') !== 'false';
    if (useSetBuilder) {
      await timedStage(timing, 'set_builder', () =>
        rebuildConceptSetsWithLlm({
          concepts: finalConcepts as unknown as SetBuilderConcept[],
          pool: postProcessCatalog,
          fullCatalog: relevanceCatalog.length ? relevanceCatalog : catalogForLlm,
          brief: request.userPrompt,
          brandColors: colors,
          allowedItems: (filterInput.allowedItems ?? []) as string[],
          forbiddenItems: (filterInput.forbiddenItems ?? []) as string[],
          budgetPerSet,
          budgetMin: filterInput.budgetMin ?? null,
          minItems: filterInput.minProductsPerSet ?? desiredCount,
          maxItems: filterInput.maxProductsPerSet ?? countBounds.max,
          filterInput,
          config: this.config,
          logger: (msg) => this.logger.log(msg),
        }),
      );
      finalConcepts = this.reFinalizeConceptsAfterSetBuilder(
        finalConcepts,
        postProcessCatalog,
        filterInput,
        countBounds,
        budgetPerSet,
        colors,
        catalogById,
        catalogTypeIndex,
        regenerationSeed,
        relevanceCatalog.length ? relevanceCatalog : catalogForLlm,
      );
    } else if (!neuralOn) {
      finalConcepts = await critiqueConceptSetsWithLlm(
        finalConcepts,
        request.userPrompt,
        postProcessCatalog,
        colors,
        this.openrouter,
        this.config,
        (msg) => this.logger.warn(msg),
        filterInput,
        filterInput.minProductsPerSet ?? desiredCount,
        filterInput.maxProductsPerSet ?? countBounds.max,
      );
    }

    if (previousProductIds.size > 0) {
      finalConcepts = replacePreviousGenerationProducts(
        finalConcepts,
        previousProductIds,
        relevanceCatalog.length ? relevanceCatalog : catalogForLlm,
        request.userPrompt,
        colors,
        regenerationSeed,
      );
      finalConcepts = refillConceptsAvoidingPrevious(
        finalConcepts,
        previousProductIds,
        relevanceCatalog.length ? relevanceCatalog : catalogForLlm,
        desiredCount,
        request.userPrompt,
        colors,
        regenerationSeed,
      );
      this.logger.log(
        `Regeneration novelty: blocked ${previousProductIds.size} previous SKUs, run #${generationHistory?.generationCount ?? 0}`,
      );
    }

    // ФИНАЛЬНАЯ дедупликация — для старого пути. В нейро-режиме уникальность SKU
    // между наборами уже гарантирована общим реестром (SelectionLedger).
    if (!neuralOn) {
      finalConcepts = enforceGlobalConceptUniqueness(
        finalConcepts,
        finalUniquenessCatalog,
        request.userPrompt,
        colors,
        filterInput.minProductsPerSet ?? desiredCount,
        (msg) => this.logger.warn(msg),
        budgetPerSet,
        directedMode,
      );
    }

    if (!neuralOn) {
      finalConcepts = this.repairThinFinalConcepts(
        finalConcepts,
        finalUniquenessCatalog,
        filterInput,
        countBounds,
        budgetPerSet,
        colors,
        catalogById,
        regenerationSeed,
      );
    }

    } catch (postErr) {
      this.logger.error(
        `Catalog post-processing failed — returning built concepts: ${postErr instanceof Error ? postErr.stack : String(postErr)}`,
      );
      if (!finalConcepts.length) finalConcepts = concepts.slice(0, targetConcepts);
    }

    // Контракт вывода: убираем пустые наборы; не отдаём больше целевого числа.
    finalConcepts = finalConcepts
      .filter((c) => (c.catalogProducts?.length ?? 0) > 0)
      .slice(0, targetConcepts);

    timing.lap('post_process');
    const timingRecord = timing.toRecord();
    this.logger.log(
      `discoverConcepts timing ${timing.totalMs()}ms:\n${timing.toTable()}`,
    );
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



  private resolveSetItemCount(request: {
    userPrompt: string;
    setItemCount?: number | null;
    useProductCountLimit?: boolean | null;
    minProductsPerSet?: number | null;
    maxProductsPerSet?: number | null;
  }): number {
    return averageItemCount(resolveProductCountBounds(request));
  }



  private normalizeHexColors(colors: unknown): string[] {

    if (!Array.isArray(colors)) return [];

    return colors

      .map((c) => {

        if (typeof c === 'string') return c.trim();

        if (c && typeof c === 'object' && 'hex' in c) {

          return String((c as { hex?: unknown }).hex ?? '').trim();

        }

        return '';

      })

      .filter(Boolean);

  }



  private async callLegacyCatalogConceptsLlm(

    request: {

      userPrompt: string;

      category: string;

      budgetMin: number | null;

      budgetMax: number | null;

      quantity: number | null;

    },

    catalogForLlm: CatalogProduct[],

    colors: string[],

    allowedItems: string[],

    forbiddenItems: string[],

    desiredCount: number,

    mandatoryConceptTypes: string[],

    hasLogo: boolean,

    logoUrl: string | null,

  ): Promise<LlmCatalogConceptJson[]> {

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

    const errors: string[] = [];



    for (const { name, provider } of chain) {

      try {

        const output = await provider.generate({ ...llmInput, catalogConceptsMode: true });

        const parsed = parseCatalogConceptsJson(output.composition);

        if (parsed.concepts.length < 3) {

          throw new Error(`Only ${parsed.concepts.length} concepts returned`);

        }

        this.logger.log(

          `Legacy catalog LLM OK (${name}${

            provider instanceof OpenrouterLlmProvider ? `/${provider.lastModelUsed}` : ''

          }): ${parsed.concepts.length} sets`,

        );

        return parsed.concepts;

      } catch (err) {

        const msg = err instanceof Error ? err.message : String(err);

        errors.push(`${name}: ${msg.slice(0, 100)}`);

        this.logger.warn(`Legacy catalog ${name} failed: ${msg.slice(0, 140)}`);

      }

    }



    throw new Error(errors.join(' | ') || 'No LLM providers for catalog concepts');

  }



  private buildFallbackConcepts(

    catalog: CatalogProduct[],

    desiredCount: number,

    userPrompt: string,

    diversityTracker: ConceptDiversityTracker,

    offset = 0,

    usedProductIds = new Set<string>(),

    usedVariantKeys = new Set<string>(),

  ): LlmCatalogConceptJson[] {

    const themes = [

      'Премиальный welcome pack',

      'Tech-набор для IT',

      'Эко-набор',

      'Офисный daily use',

      'Подарок для клиентов',

    ];

    const concepts: LlmCatalogConceptJson[] = [];

    const pool = catalog.filter(
      (p) => !isVariantBlocked(p, usedProductIds, usedVariantKeys),
    );

    const source =
      pool.length >= desiredCount
        ? pool
        : catalog.filter(
            (p) => !isVariantBlocked(p, usedProductIds, usedVariantKeys),
          );

    const targetConcepts = this.targetConceptCount();

    for (let i = 0; i < targetConcepts; i++) {

      const blockedIds = new Set(usedProductIds);

      const blockedVariants = new Set(usedVariantKeys);

      const slice = enforceConceptSetDiversity(

        [],

        source.length ? source : pool,

        desiredCount,

        diversityTracker,

        blockedIds,

        blockedVariants,

        offset * targetConcepts + i,

      );

      if (!slice.length) break;

      concepts.push({

        title: themes[i] ?? `Набор ${offset + i + 1}`,

        composition: `Подбор товаров под задачу: ${userPrompt.slice(0, 120)}`,

        style: themes[i]?.split(' ')[0] ?? 'корпоративный',

        items: slice.map((p) => p.name),

      });

    }

    return concepts;

  }



  /**
   * Собирает один набор: сильные кандидаты → единый гейт ограничений → бюджет.
   *
   * Раньше здесь было ~10 перекрывающихся проходов (ensure/enforce/dedup/upgrade).
   * Теперь вся валидация, дедуп по ролям, обязательные типы/категории, добор и
   * тримминг делегированы finalizeConceptSelection (единственный источник правил),
   * а здесь остаётся только сбор кандидатов и освоение бюджета.
   */
  private toConcept(
    raw: RawCatalogConcept,
    catalog: CatalogProduct[],
    fullCatalog: CatalogProduct[],
    desiredCount: number,
    index: number,
    usedFallback: boolean,
    usedProductIds: Set<string>,
    usedVariantKeys: Set<string>,
    usedLineKeys: Set<string>,
    brandColors: string[],
    diversityTracker: ConceptDiversityTracker,
    budgetPerSet: number | null,
    brief: string,
    filterInput: CatalogFilterInput,
    catalogTypeIndex?: Map<string, CatalogProduct[]>,
    trace?: AgentDebugTraceFn,
    regenerationSeed = 0,
  ): Concept {
    const conceptTitle = raw.title?.trim() || `Набор ${index + 1}`;
    const conceptComposition = raw.composition?.trim() ?? '';
    const conceptStyle = raw.style?.trim();

    const namedResolved = resolveNamedItemsForBrief(brief, filterInput.allowedItems ?? []);
    const directedMode = isDirectedBriefMode(namedResolved.namedTypes);
    // Эксклюзив = набор ТОЛЬКО из названных позиций (явное «только/строго/ровно»).
    // «можно: …» — это разрешённые категории: названные типы обязаны быть, но набор шире.
    const exclusiveMode = isExclusiveBriefMode(brief, namedResolved.namedTypes);
    const mandatoryTypes = resolveMandatoryTypesForBrief(brief, filterInput.allowedItems ?? []);

    const minItems = filterInput.minProductsPerSet ?? desiredCount;
    const maxItems = filterInput.maxProductsPerSet ?? desiredCount;
    const namedCount = namedResolved.namedTypes.length;
    const fillTarget = exclusiveMode
      ? Math.min(maxItems, Math.max(1, namedCount))
      : Math.min(maxItems, Math.max(minItems, desiredCount, namedCount));

    // Пул для подбора: стратифицированный type-diverse forLlm (~280) — он и
    // разнообразный (после broadening в prepareCatalogPipeline), и КОМПАКТНЫЙ, чтобы
    // релаксация/finalize не пересканировали тысячи товаров (это давало 76с+ на набор).
    // Если forLlm почему-то мал — берём fullCatalog, но ограничиваем размер.
    const POOL_CAP = 600;
    const searchCatalog = (
      catalog.length >= Math.max(desiredCount * 4, 80) ? catalog : fullCatalog
    ).slice(0, POOL_CAP);
    const qualityGateInput = selectionConstraintsFromFilterInput(filterInput, {
      min: minItems,
      max: maxItems,
    });
    const passesConceptPoolGate = (p: CatalogProduct) =>
      !isVariantBlocked(p, usedProductIds, usedVariantKeys) &&
      !isCrossConceptLineBlocked(p, usedLineKeys, brief) &&
      !isCorporateSetFiller(p, brief) &&
      !isLowRelevanceJunk(p, brief) &&
      hasValidProductImage(p) &&
      productPassesQualityGate(p, qualityGateInput);

    const pickPool = searchCatalog.filter(passesConceptPoolGate);
    let pool =
      pickPool.length >= fillTarget * 2
        ? pickPool
        : (fullCatalog.length ? fullCatalog : searchCatalog)
            .slice(0, 2000)
            .filter(passesConceptPoolGate);

    // Пул истощается к 4–5-й концепции (line-key + diversity) — ослабляем гейт, но без филлеров.
    if (pool.length < fillTarget * 3) {
      const relevanceCtx = buildBriefRelevanceContext(brief, brandColors);
      const relaxedGate = (p: CatalogProduct) =>
        !isVariantBlocked(p, usedProductIds, usedVariantKeys) &&
        !isCrossConceptLineBlocked(p, usedLineKeys, brief) &&
        !isCorporateSetFiller(p, brief) &&
        hasValidProductImage(p) &&
        hasValidProductPrice(p) &&
        scoreBriefRelevanceWithContext(p, relevanceCtx) >
          (relevanceCtx.flags.tech ? 20 : relevanceCtx.flags.eco ? 10 : -20);
      const broadPool = (fullCatalog.length ? fullCatalog : searchCatalog)
        .slice(0, 2000)
        .filter(relaxedGate);
      if (broadPool.length > pool.length) {
        pool = broadPool;
      }
    }

    // Межконцептовое разнообразие ТИПОВ: тип, исчерпавший лимит концепций
    // (опциональный — максимум в 1 из 5), исключаем из основного пула, чтобы не было
    // «полотенце во всех 5 наборах». Обязательные/именованные типы остаются (лимит = 5).
    const diversePool = pool.filter((p) =>
      diversityTracker.canUseType(detectConceptProductType(p)),
    );
    const selectionPool =
      diversePool.length >= Math.max(fillTarget * 3, 24) ? diversePool : pool;
    const finalizeCatalog =
      selectionPool.length >= fillTarget * 6
        ? selectionPool
        : (fullCatalog.length ? fullCatalog : searchCatalog).slice(0, 2000).filter(passesConceptPoolGate);

    this.logger.log(
      `Concept #${index + 1} "${conceptTitle}": pool=${pool.length}, diverse=${selectionPool.length}, ` +
        `fillTarget=${fillTarget}, usedIds=${usedProductIds.size}, usedVariants=${usedVariantKeys.size}`,
    );

    // 1) Сильные кандидаты: точные позиции из брифа + слоты идеи / LLM-позиции.
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

    // 2) Единый авторитетный гейт: дедуп ролей, бюджет-cap, обязательные типы и
    //    категории, добор до нужного числа и тримминг до максимума.
    const selectionInput = selectionConstraintsFromFilterInput(filterInput, {
      min: fillTarget,
      max: maxItems,
    });
    const { products: finalized, report: selectionReport } = finalizeConceptSelection(initial, selectionInput, {
      catalog: finalizeCatalog.length ? finalizeCatalog : selectionPool,
      filterInput,
      conceptTitle,
      conceptComposition,
      typeIndex: catalogTypeIndex,
      seed: index * 19 + regenerationSeed,
      crossConceptBlockedIds: usedProductIds,
      crossConceptBlockedVariants: usedVariantKeys,
      crossConceptBlockedLineKeys: usedLineKeys,
      onWarn: (msg) => this.logger.warn(`Selection "${conceptTitle}": ${msg}`),
    });
    let products = finalized;
    let report = selectionReport;

    // 3) Освоить бюджет: cap держит finalize; здесь подтягиваем сумму к бюджету —
    //    сначала апгрейд позиций, затем добор предметов до максимума, если сильно недобрали.
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
        blockedIds: usedProductIds,
        blockedVariants: usedVariantKeys,
      };
      products = upgradeSetToTargetBudget(products, selectionPool, budgetPerSet, upgradeCtx, catalogTypeIndex);

      const { floor: budgetFloor } = resolveSetBudgetRange(filterInput.budgetMin, budgetPerSet);
      if (estimateSetTotalPrice(products) < budgetFloor && products.length < maxItems) {
        const colorScore = buildBrandColorScoreFn(brandColors);
        const perSlot = budgetPerSet / Math.max(maxItems, 1);
        const affordable = selectionPool.filter((p) => (p.price ?? 0) <= budgetPerSet);
        // Скоринг при доборе: релевантность + цвет бренда + близость к слот-цене (осваиваем бюджет)
        const budgetScore = (p: CatalogProduct) => {
          const price = p.price ?? 0;
          const fit = price > 0 ? Math.min(price, perSlot) / perSlot : 0;
          return scoreBriefRelevance(p, brief, brandColors) + colorScore(p) + fit * 25;
        };
        products = ensureConceptProducts(
          products,
          affordable.length >= maxItems ? affordable : selectionPool,
          maxItems,
          { title: conceptTitle, composition: conceptComposition, brief, style: conceptStyle },
          usedProductIds,
          usedVariantKeys,
          diversityTracker,
          index * 23 + regenerationSeed,
          false,
          budgetScore,
          mandatoryTypes,
        );
        products = upgradeSetToTargetBudget(products, selectionPool, budgetPerSet, upgradeCtx, catalogTypeIndex);
      }
    }

    // 4) Вариант товара в фирменных цветах, 5) лёгкая правка «выпадающего» товара.
    products = upgradeToBrandColorVariants(products, searchCatalog, brandColors);
    products = this.fixSetCohesion(
      products,
      pool,
      usedProductIds,
      usedVariantKeys,
      brandColors,
      brief,
      conceptTitle,
    );

    // 5b) Апгрейд/ensure после finalize могут вернуть дубли ролей и урезать набор — повторный гейт.
    const postFinal = finalizeConceptSelection(products, selectionInput, {
      catalog: finalizeCatalog.length ? finalizeCatalog : selectionPool,
      filterInput,
      conceptTitle,
      conceptComposition,
      typeIndex: catalogTypeIndex,
      seed: index * 37 + regenerationSeed + 1,
      crossConceptBlockedIds: usedProductIds,
      crossConceptBlockedVariants: usedVariantKeys,
      crossConceptBlockedLineKeys: usedLineKeys,
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
      const globalPool = (fullCatalog.length ? fullCatalog : searchCatalog).slice(0, 2000);
      const relaxed = buildSetWithRelaxation(
        {
          constraints: selectionInput,
          options: {
            catalog: globalPool,
            filterInput,
            conceptTitle,
            conceptComposition,
            typeIndex: catalogTypeIndex,
            seed: index * 41 + regenerationSeed,
            crossConceptBlockedIds: usedProductIds,
            crossConceptBlockedVariants: usedVariantKeys,
            crossConceptBlockedLineKeys: usedLineKeys,
            onWarn: (msg) => this.logger.warn(`Relaxation "${conceptTitle}": ${msg}`),
          },
          initial: products.length ? products : initial,
          targetCount: fillTarget,
          onLog: (msg) => this.logger.warn(`Relaxation "${conceptTitle}": ${msg}`),
        },
        globalPool,
      );
      if (relaxed.products.length >= fillTarget || relaxed.products.length > products.length) {
        this.logger.warn(
          `Concept "${conceptTitle}": buildSetWithRelaxation L${relaxed.level} → ${relaxed.products.length} items [${relaxed.relaxed.join(', ')}]`,
        );
        const reFinal = finalizeConceptSelection(relaxed.products, selectionInput, {
          catalog: selectionPool.length ? selectionPool : globalPool,
          filterInput,
          conceptTitle,
          conceptComposition,
          typeIndex: catalogTypeIndex,
          seed: index * 43 + regenerationSeed,
          crossConceptBlockedIds: usedProductIds,
          crossConceptBlockedVariants: usedVariantKeys,
      crossConceptBlockedLineKeys: usedLineKeys,
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

    // 6) Зафиксировать использование типов и SKU между концепциями.
    if (products.length < fillTarget) {
      const lastResortPool = (fullCatalog.length ? fullCatalog : searchCatalog).slice(0, 2000);
      const lastResort = buildSetWithRelaxation(
        {
          constraints: selectionInput,
          options: {
            catalog: lastResortPool,
            filterInput,
            conceptTitle,
            conceptComposition,
            typeIndex: catalogTypeIndex,
            seed: index * 61 + regenerationSeed,
            crossConceptBlockedIds: usedProductIds,
            crossConceptBlockedVariants: usedVariantKeys,
            crossConceptBlockedLineKeys: usedLineKeys,
            onWarn: (msg) => this.logger.warn(`toConcept force-min "${conceptTitle}": ${msg}`),
          },
          initial: products,
          targetCount: fillTarget,
          onLog: (msg) => this.logger.warn(`toConcept force-min "${conceptTitle}": ${msg}`),
        },
        lastResortPool,
      );
      if (lastResort.products.length >= fillTarget) {
        products = lastResort.products.filter((p) => !isCorporateSetFiller(p, brief));
      }
    }

    // Филлеры не считаются содержимым набора — вырезаем и добираем до min.
    products = products.filter((p) => !isCorporateSetFiller(p, brief));
    if (products.length < fillTarget) {
      const fillerFreePool = (fullCatalog.length ? fullCatalog : searchCatalog)
        .slice(0, 2000)
        .filter(
          (p) =>
            !isCorporateSetFiller(p, brief) &&
            !isVariantBlocked(p, usedProductIds, usedVariantKeys) &&
            hasValidProductImage(p),
        );
      const fillerRescue = buildSetWithRelaxation(
        {
          constraints: selectionInput,
          options: {
            catalog: fillerFreePool.length ? fillerFreePool : finalizeCatalog,
            filterInput,
            conceptTitle,
            conceptComposition,
            typeIndex: catalogTypeIndex,
            seed: index * 71 + regenerationSeed,
            crossConceptBlockedIds: usedProductIds,
            crossConceptBlockedVariants: usedVariantKeys,
            crossConceptBlockedLineKeys: usedLineKeys,
            onWarn: (msg) => this.logger.warn(`toConcept filler-rescue "${conceptTitle}": ${msg}`),
          },
          initial: products,
          targetCount: fillTarget,
          onLog: (msg) => this.logger.warn(`toConcept filler-rescue "${conceptTitle}": ${msg}`),
        },
        fillerFreePool.length ? fillerFreePool : finalizeCatalog,
      );
      if (fillerRescue.products.length >= fillTarget) {
        products = fillerRescue.products.filter((p) => !isCorporateSetFiller(p, brief));
      } else if (fillerRescue.products.length > products.length) {
        products = fillerRescue.products.filter((p) => !isCorporateSetFiller(p, brief));
      }
    }

    if (products.length > 0) {
      diversityTracker.recordConceptTypes(products.map(detectConceptProductType));
    }
    for (const p of products) {
      registerCrossConceptBlock(p, usedProductIds, usedVariantKeys);
      registerCrossConceptLineKeys(p, usedLineKeys, brief);
    }

    if (report.repairs.length > 0 || report.violations.length > 0) {
      this.logger.log(
        `Selection "${conceptTitle}": ${report.finalCount} items, ` +
          `${report.violations.length} violations, ${report.repairs.length} repairs`,
      );
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

    const syncedComposition = buildCompositionFromProducts(products, conceptStyle, conceptComposition);
    return this.mapProductsToConcept(
      conceptTitle,
      syncedComposition,
      raw.style,
      products,
      usedFallback,
      index,
      undefined,
      undefined,
      brandColors,
      report,
      budgetPerSet,
      filterInput.quantity ?? null,
    );
  }

  /** Сильные стартовые кандидаты набора (точные позиции брифа + слоты/LLM-позиции). */
  private gatherConceptCandidates(args: {
    raw: RawCatalogConcept;
    pool: CatalogProduct[];
    brief: string;
    conceptTitle: string;
    conceptComposition: string;
    conceptStyle?: string;
    brandColors: string[];
    filterInput: CatalogFilterInput;
    directedMode: boolean;
    exclusiveMode: boolean;
    namedResolved: { namedTypes: string[]; namedItems: string[] };
    mandatoryTypes: string[];
    usedProductIds: Set<string>;
    usedVariantKeys: Set<string>;
    budgetPerSet: number | null;
    fillTarget: number;
    catalogTypeIndex?: Map<string, CatalogProduct[]>;
    index: number;
    regenerationSeed: number;
  }): CatalogProduct[] {
    const {
      raw,
      pool,
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
    } = args;

    const briefKeywords = extractProductKeywordsFromBrief(brief);
    const keywordProducts =
      briefKeywords.length > 0
        ? findProductsByBriefKeywords(briefKeywords, pool, usedProductIds, usedVariantKeys)
        : [];
    if (keywordProducts.length > 0) {
      this.logger.log(
        `Brief keywords [${briefKeywords.join(', ')}] → ${keywordProducts.length} direct matches for "${conceptTitle}"`,
      );
    }

    const keywordTypes = new Set(keywordProducts.map((p) => detectConceptProductType(p)));
    const blockedIds = new Set([...usedProductIds, ...keywordProducts.map((p) => p.id)]);
    const blockedVariants = new Set([
      ...usedVariantKeys,
      ...keywordProducts.flatMap((p) => crossConceptLineKeys(p)),
    ]);

    let slotProducts: CatalogProduct[] = [];

    if (directedMode || raw.productSlots?.length) {
      const slotsForPicker = (directedMode
        ? namedResolved.namedTypes.map((type, i) => ({
            type,
            priority: 'must' as const,
            notes: namedResolved.namedItems[i] ?? type,
            positionLabel: namedResolved.namedItems[i] ?? type,
          }))
        : raw.productSlots ?? []
      ).filter((s) => !typeConflictsInSet(keywordTypes, s.type));

      if (slotsForPicker.length > 0) {
        slotProducts = resolveConceptFromSlots(
          slotsForPicker,
          pool,
          fillTarget,
          {
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
          },
          catalogTypeIndex,
        );
      }
    } else {
      slotProducts = resolveConceptProductSelection({
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

    // Слить точные позиции и слот-подбор без конфликтов типов, до fillTarget.
    const merged: CatalogProduct[] = [];
    const mergedTypes = new Set<string>();
    for (const p of [...keywordProducts, ...slotProducts]) {
      if (isCorporateSetFiller(p, brief)) continue;
      const type = detectConceptProductType(p);
      if (merged.some((m) => m.id === p.id)) continue;
      if (typeConflictsInSet(mergedTypes, type)) continue;
      merged.push(p);
      mergedTypes.add(type);
      if (merged.length >= fillTarget) break;
    }
    return merged;
  }

  /** Заменяет один «выпадающий» по сцепке товар, если набор разнородный. */
  private fixSetCohesion(
    products: CatalogProduct[],
    pool: CatalogProduct[],
    usedProductIds: Set<string>,
    usedVariantKeys: Set<string>,
    brandColors: string[],
    brief: string,
    conceptTitle: string,
  ): CatalogProduct[] {
    if (products.length === 0) return products;
    const { scoreSetCohesion, tryFixSetOutlier } = require('../providers/llm/set-cohesion.util');
    const cohesion = scoreSetCohesion(products, { brief, brandColors });
    if (cohesion.outlierIndex !== null && cohesion.score < 55) {
      const fixed = tryFixSetOutlier(
        products,
        cohesion.outlierIndex,
        pool,
        usedProductIds,
        usedVariantKeys,
        brandColors,
        brief,
      );
      if (fixed) {
        this.logger.log(
          `Set cohesion fix "${conceptTitle}": replaced ${products[cohesion.outlierIndex]?.name} (${cohesion.reason})`,
        );
        return fixed;
      }
    }
    return products;
  }

  private refillEmptyConceptProducts(

    concepts: Concept[],

    catalog: CatalogProduct[],

    desiredCount: number,

    usedProductIds: Set<string>,

    usedVariantKeys: Set<string>,

    usedLineKeys: Set<string>,

    diversityTracker: ConceptDiversityTracker,

    budgetPerSet: number | null,

    brief: string,

    brandColors: string[] = [],

    filterInput?: CatalogFilterInput,

    catalogTypeIndex?: Map<string, CatalogProduct[]>,

  ): void {

    const mandatoryTypes = resolveMandatoryTypesForBrief(brief);
    const minTarget = filterInput?.minProductsPerSet ?? desiredCount;
    const maxItems = filterInput?.maxProductsPerSet ?? desiredCount;

    for (let i = 0; i < concepts.length; i++) {

      const existingCount = concepts[i].catalogProducts?.length ?? 0;
      if (existingCount >= minTarget) continue;



      const concept = concepts[i];

      let pool = catalog.filter(
        (p) =>
          !isVariantBlocked(p, usedProductIds, usedVariantKeys) &&
          !isCrossConceptLineBlocked(p, usedLineKeys, brief) &&
          !isCorporateSetFiller(p, brief),
      );

      if (pool.length < minTarget * 4) {
        const broad = catalog
          .slice(0, 2000)
          .filter(
            (p) =>
              !isCorporateSetFiller(p, brief) &&
              !isVariantBlocked(p, usedProductIds, usedVariantKeys) &&
              !isCrossConceptLineBlocked(p, usedLineKeys, brief) &&
              hasValidProductImage(p),
          );
        if (broad.length > pool.length) pool = broad;
      }

      if (!pool.length) continue;



      if (budgetPerSet != null && budgetPerSet > 0) {

        const affordable = pool.filter((p) => (p.price ?? 0) <= budgetPerSet);

        if (affordable.length >= minTarget) pool = affordable;

      }



      const colorScore = buildBrandColorScoreFn(brandColors);

      let products = ensureConceptProducts(

        [],

        pool,

        minTarget,

        {

          title: concept.title,

          composition: concept.composition ?? concept.description ?? '',

          brief,

          style: concept.style,

        },

        usedProductIds,

        usedVariantKeys,

        diversityTracker,

        i * 53,

        false,

        (p) => scoreBriefRelevance(p, brief, brandColors) + colorScore(p),

        mandatoryTypes,

      );

      if (products.length < minTarget && filterInput) {
        const selectionInput = selectionConstraintsFromFilterInput(filterInput, {
          min: minTarget,
          max: maxItems,
        });
        const relaxed = buildSetWithRelaxation(
          {
            constraints: selectionInput,
            options: {
              catalog,
              filterInput,
              conceptTitle: concept.title,
              conceptComposition: concept.composition ?? concept.description ?? '',
              typeIndex: catalogTypeIndex,
              seed: i * 55,
              crossConceptBlockedIds: usedProductIds,
              crossConceptBlockedVariants: usedVariantKeys,
              crossConceptBlockedLineKeys: usedLineKeys,
              onWarn: (msg) => this.logger.warn(`Refill relax "${concept.title}": ${msg}`),
            },
            initial: products,
            targetCount: minTarget,
            onLog: (msg) => this.logger.warn(`Refill relax "${concept.title}": ${msg}`),
          },
          catalog,
        );
        if (relaxed.products.length >= minTarget || relaxed.products.length > products.length) {
          products = relaxed.products;
        }
      }



      if (!products.length) continue;

      products = upgradeToBrandColorVariants(products, catalog, brandColors);



      products.forEach((p) => {
        registerCrossConceptBlock(p, usedProductIds, usedVariantKeys);
      });



      concepts[i] = this.mapProductsToConcept(

        concept.title,

        concept.composition ?? concept.description,

        concept.style,

        products,

        true,

        i,

        concept.narrative,

        concept.whyItFits,

        brandColors,

        undefined,

        budgetPerSet,

        filterInput?.quantity ?? null,

      );



      this.logger.log(`Refilled concept "${concept.title}" with ${products.length} products`);

    }

  }



  /** Последний добор: пустые/тонкие наборы после финальной дедупликации. */
  private repairThinFinalConcepts(
    concepts: Concept[],
    catalog: CatalogProduct[],
    filterInput: CatalogFilterInput,
    countBounds: ProductCountBounds,
    budgetPerSet: number | null,
    brandColors: string[],
    catalogById: Map<string, CatalogProduct>,
    regenerationSeed = 0,
  ): Concept[] {
    const minRequired = filterInput.minProductsPerSet ?? countBounds.min;
    const brief = filterInput.userPrompt;
    const crossIds = new Set<string>();
    const crossVariants = new Set<string>();
    const crossLineKeys = new Set<string>();
    const tracker = new ConceptDiversityTracker(
      new Set(resolveMandatoryTypesForBrief(brief, filterInput.allowedItems ?? [])),
    );
    const { floor: budgetFloor } = resolveSetBudgetRange(filterInput.budgetMin, budgetPerSet);
    const result: Concept[] = [];

    for (let index = 0; index < concepts.length; index++) {
      const concept = concepts[index]!;
      let products = (concept.catalogProducts ?? [])
        .map((cp) => catalogById.get(cp.id))
        .filter((p): p is CatalogProduct => Boolean(p))
        .filter((p) => !isCorporateSetFiller(p, brief));

      const needsRefill =
        products.length < minRequired ||
        (budgetFloor > 0 && estimateSetTotalPrice(products) < budgetFloor * 0.9);

      if (needsRefill) {
        const blockedIds = new Set([...crossIds, ...products.map((p) => p.id)]);
        const blockedVariants = new Set(crossVariants);
        for (const p of products) {
          registerCrossConceptBlock(p, blockedIds, blockedVariants);
          registerCrossConceptLineKeys(p, crossLineKeys, filterInput.userPrompt);
        }
        const refillPool = catalog.filter(
          (p) =>
            !isVariantBlocked(p, blockedIds, blockedVariants) &&
            !isCrossConceptLineBlocked(p, crossLineKeys, brief) &&
            !isCorporateSetFiller(p, brief),
        );
        products = ensureConceptProducts(
          products,
          refillPool,
          minRequired,
          {
            title: concept.title,
            composition: concept.composition ?? concept.description ?? '',
            brief,
            style: concept.style,
          },
          blockedIds,
          blockedVariants,
          tracker,
          index * 61 + regenerationSeed,
          false,
          (p) => scoreBriefRelevance(p, brief, brandColors),
          resolveMandatoryTypesForBrief(brief, filterInput.allowedItems ?? []),
        );
        if (products.length < minRequired) {
          const selectionInput = selectionConstraintsFromFilterInput(filterInput, {
            min: minRequired,
            max: filterInput.maxProductsPerSet ?? countBounds.max,
          });
          const relaxed = buildSetWithRelaxation(
            {
              constraints: selectionInput,
              options: {
                catalog: refillPool.length >= minRequired * 6 ? refillPool : catalog.slice(0, 2000),
                filterInput,
                conceptTitle: concept.title,
                conceptComposition: concept.composition ?? concept.description ?? '',
                seed: index * 63 + regenerationSeed,
                crossConceptBlockedIds: crossIds,
                crossConceptBlockedVariants: crossVariants,
                crossConceptBlockedLineKeys: crossLineKeys,
                onWarn: (msg) => this.logger.warn(`repairThin "${concept.title}": ${msg}`),
              },
              initial: products,
              targetCount: minRequired,
              onLog: (msg) => this.logger.warn(`repairThin "${concept.title}": ${msg}`),
            },
            refillPool.length >= minRequired * 6 ? refillPool : catalog.slice(0, 2000),
          );
          if (relaxed.products.length >= minRequired) {
            products = relaxed.products;
          } else if (relaxed.products.length > products.length) {
            products = relaxed.products;
          }
        }
        if (budgetPerSet != null && budgetPerSet > 0 && products.length > 0) {
          products = upgradeSetToTargetBudget(
            products,
            catalog,
            budgetPerSet,
            {
              title: concept.title,
              composition: concept.composition ?? concept.description ?? '',
              brief,
              style: concept.style,
              brandColors,
              filterInput,
              budgetMin: filterInput.budgetMin,
              budgetMax: budgetPerSet,
              maxProductsPerSet: filterInput.maxProductsPerSet ?? countBounds.max,
              blockedIds: crossIds,
              blockedVariants: crossVariants,
            },
          );
        }
      }

      if (products.length < minRequired) {
        const blockedIds = new Set([...crossIds, ...products.map((p) => p.id)]);
        const blockedVariants = new Set(crossVariants);
        for (const p of products) {
          registerCrossConceptBlock(p, blockedIds, blockedVariants);
          registerCrossConceptLineKeys(p, crossLineKeys, filterInput.userPrompt);
        }
        const desperate = ensureConceptProducts(
          products,
          catalog.slice(0, 2000).filter((p) => !isCorporateSetFiller(p, brief)),
          minRequired,
          {
            title: concept.title,
            composition: concept.composition ?? concept.description ?? '',
            brief,
            style: concept.style,
            budgetMin: filterInput.budgetMin,
            budgetMax: budgetPerSet,
            budgetPerSet,
            minProductsPerSet: minRequired,
          },
          blockedIds,
          blockedVariants,
          tracker,
          index * 73 + regenerationSeed,
          false,
          (p) => scoreBriefRelevance(p, brief, brandColors),
          resolveMandatoryTypesForBrief(brief, filterInput.allowedItems ?? []),
        );
        if (desperate.length > products.length) {
          products = desperate.filter((p) => !isCorporateSetFiller(p, brief));
        }
      }

      for (const p of products) {
        registerCrossConceptBlock(p, crossIds, crossVariants);
        registerCrossConceptLineKeys(p, crossLineKeys, filterInput.userPrompt);
      }

      if (products.length >= minRequired) {
        result.push(
          this.mapProductsToConcept(
            concept.title,
            buildCompositionFromProducts(products, concept.style, concept.composition ?? concept.description),
            concept.style,
            products,
            false,
            index,
            concept.narrative,
            concept.whyItFits,
            brandColors,
            undefined,
            budgetPerSet,
            filterInput.quantity ?? null,
          ),
        );
      } else if (products.length > 0) {
        const selectionInput = selectionConstraintsFromFilterInput(filterInput, {
          min: minRequired,
          max: filterInput.maxProductsPerSet ?? countBounds.max,
        });
        const lastChance = buildSetWithRelaxation(
          {
            constraints: selectionInput,
            options: {
              catalog: catalog.slice(0, 2000),
              filterInput,
              conceptTitle: concept.title,
              conceptComposition: concept.composition ?? concept.description ?? '',
              seed: index * 79 + regenerationSeed,
              crossConceptBlockedIds: crossIds,
              crossConceptBlockedVariants: crossVariants,
              crossConceptBlockedLineKeys: crossLineKeys,
              onWarn: (msg) => this.logger.warn(`repairThin lastChance "${concept.title}": ${msg}`),
            },
            initial: products,
            targetCount: minRequired,
            onLog: (msg) => this.logger.warn(`repairThin lastChance "${concept.title}": ${msg}`),
          },
          catalog.slice(0, 2000),
        );
        if (lastChance.products.length >= minRequired) {
          products = lastChance.products;
          for (const p of products) registerCrossConceptBlock(p, crossIds, crossVariants);
          result.push(
            this.mapProductsToConcept(
              concept.title,
              buildCompositionFromProducts(products, concept.style, concept.composition ?? concept.description),
              concept.style,
              products,
              false,
              index,
              concept.narrative,
              concept.whyItFits,
              brandColors,
              undefined,
              budgetPerSet,
              filterInput.quantity ?? null,
            ),
          );
        } else {
        this.logger.warn(
          `repairThin "${concept.title}": thin set (${products.length}/${minRequired}) — keeping best effort`,
        );
        result.push(
          this.mapProductsToConcept(
            concept.title,
            buildCompositionFromProducts(products, concept.style, concept.composition ?? concept.description),
            concept.style,
            products,
            false,
            index,
            concept.narrative,
            concept.whyItFits,
            brandColors,
            undefined,
            budgetPerSet,
            filterInput.quantity ?? null,
          ),
        );
        }
      } else {
        this.logger.warn(`repairThin "${concept.title}": empty after refill — keeping concept shell`);
        result.push(concept);
      }
    }

    return result;
  }

  /** Пост-обработка после нейро-set-builder: единый гейт + добор пустых/тонких наборов. */
  private reFinalizeConceptsAfterSetBuilder(
    concepts: Concept[],
    catalog: CatalogProduct[],
    filterInput: CatalogFilterInput,
    countBounds: ProductCountBounds,
    budgetPerSet: number | null,
    brandColors: string[],
    catalogById: Map<string, CatalogProduct>,
    catalogTypeIndex?: Map<string, CatalogProduct[]>,
    regenerationSeed = 0,
    fullCatalog?: CatalogProduct[],
  ): Concept[] {
    const workingCatalog = (fullCatalog?.length ? fullCatalog : catalog).slice(0, 2000);
    const typeIndex = catalogTypeIndex ?? indexCatalogByProductType(workingCatalog);
    const emergencyCatalog = workingCatalog.slice(0, 1200);
    const crossIds = new Set<string>();
    const crossVariants = new Set<string>();
    const crossLineKeys = new Set<string>();
    const result: Concept[] = [];

    for (let index = 0; index < concepts.length; index++) {
      const concept = concepts[index];
      const minTarget = pickConceptItemCount(countBounds, index);
      const maxItems = filterInput.maxProductsPerSet ?? countBounds.max;
      const selectionInput = selectionConstraintsFromFilterInput(filterInput, {
        min: Math.max(filterInput.minProductsPerSet ?? countBounds.min, minTarget),
        max: maxItems,
      });

      let products = (concept.catalogProducts ?? [])
        .map((cp) => catalogById.get(cp.id))
        .filter((p): p is CatalogProduct => Boolean(p))
        .filter(
          (p) =>
            !isCorporateSetFiller(p, filterInput.userPrompt) &&
            !isLowRelevanceJunk(p, filterInput.userPrompt),
        );

      const { products: finalized, report } = finalizeConceptSelection(products, selectionInput, {
        catalog: workingCatalog,
        filterInput,
        conceptTitle: concept.title,
        conceptComposition: concept.composition ?? concept.description ?? '',
        typeIndex,
        seed: index * 47 + regenerationSeed,
        crossConceptBlockedIds: crossIds,
        crossConceptBlockedVariants: crossVariants,
        crossConceptBlockedLineKeys: crossLineKeys,
        onWarn: (msg) => this.logger.warn(`Post-set-builder "${concept.title}": ${msg}`),
      });
      products = finalized;

      if (products.length < selectionInput.minProductsPerSet) {
        const relaxed = buildSetWithRelaxation(
          {
            constraints: selectionInput,
            options: {
              catalog:
                emergencyCatalog.length >= selectionInput.minProductsPerSet * 8
                  ? workingCatalog
                  : emergencyCatalog,
              filterInput,
              conceptTitle: concept.title,
              conceptComposition: concept.composition ?? concept.description ?? '',
              typeIndex,
              seed: index * 49 + regenerationSeed,
              crossConceptBlockedIds: crossIds,
              crossConceptBlockedVariants: crossVariants,
        crossConceptBlockedLineKeys: crossLineKeys,
              onWarn: (msg) => this.logger.warn(`Post-set-builder relax "${concept.title}": ${msg}`),
            },
            initial: products,
            targetCount: selectionInput.minProductsPerSet,
            onLog: (msg) => this.logger.warn(`Post-set-builder relax "${concept.title}": ${msg}`),
          },
          emergencyCatalog,
        );
        if (relaxed.products.length >= selectionInput.minProductsPerSet) {
          products = relaxed.products;
        } else if (relaxed.products.length > products.length) {
          products = relaxed.products;
        }
      }

      if (products.length === 0) {
        const emergency = buildSetWithRelaxation(
          {
            constraints: selectionInput,
            options: {
              catalog: emergencyCatalog,
              filterInput,
              conceptTitle: concept.title,
              conceptComposition: concept.composition ?? concept.description ?? '',
              typeIndex,
              seed: index * 51 + regenerationSeed,
              crossConceptBlockedIds: crossIds,
              crossConceptBlockedVariants: crossVariants,
        crossConceptBlockedLineKeys: crossLineKeys,
              onWarn: (msg) => this.logger.warn(`Post-set-builder emergency "${concept.title}": ${msg}`),
            },
            initial: [],
            targetCount: selectionInput.minProductsPerSet,
            onLog: (msg) => this.logger.warn(`Post-set-builder emergency "${concept.title}": ${msg}`),
          },
          emergencyCatalog,
        );
        if (emergency.products.length >= selectionInput.minProductsPerSet) {
          products = emergency.products;
        }

        // Последняя попытка: полный каталог (до 2000 SKU), cross-concept line-key блокировка сохраняется.
        if (products.length < selectionInput.minProductsPerSet && fullCatalog && fullCatalog.length > emergencyCatalog.length) {
          const lastResort = buildSetWithRelaxation(
            {
              constraints: selectionInput,
              options: {
                catalog: fullCatalog.slice(0, 2000),
                filterInput,
                conceptTitle: concept.title,
                conceptComposition: concept.composition ?? concept.description ?? '',
                typeIndex: indexCatalogByProductType(fullCatalog),
                seed: index * 53 + regenerationSeed,
                crossConceptBlockedIds: crossIds,
                crossConceptBlockedVariants: crossVariants,
        crossConceptBlockedLineKeys: crossLineKeys,
                onWarn: (msg) => this.logger.warn(`Post-set-builder last-resort "${concept.title}": ${msg}`),
              },
              initial: products,
              targetCount: selectionInput.minProductsPerSet,
              onLog: (msg) => this.logger.warn(`Post-set-builder last-resort "${concept.title}": ${msg}`),
            },
            fullCatalog.slice(0, 2000),
          );
          if (lastResort.products.length >= selectionInput.minProductsPerSet) {
            products = lastResort.products;
          } else if (lastResort.products.length > products.length) {
            products = lastResort.products;
          }
        }
      }

      if (products.length > 0 && products.length < selectionInput.minProductsPerSet) {
        const topUp = buildSetWithRelaxation(
          {
            constraints: selectionInput,
            options: {
              catalog: emergencyCatalog,
              filterInput,
              conceptTitle: concept.title,
              conceptComposition: concept.composition ?? concept.description ?? '',
              typeIndex,
              seed: index * 52 + regenerationSeed,
              crossConceptBlockedIds: crossIds,
              crossConceptBlockedVariants: crossVariants,
        crossConceptBlockedLineKeys: crossLineKeys,
              onWarn: (msg) => this.logger.warn(`Post-set-builder top-up "${concept.title}": ${msg}`),
            },
            initial: products,
            targetCount: selectionInput.minProductsPerSet,
            onLog: (msg) => this.logger.warn(`Post-set-builder top-up "${concept.title}": ${msg}`),
          },
          emergencyCatalog,
        );
        if (topUp.products.length >= selectionInput.minProductsPerSet) {
          products = topUp.products;
        } else if (topUp.products.length > products.length) {
          products = topUp.products;
        }
      }

      if (products.length < selectionInput.minProductsPerSet) {
        const lastChanceCatalog = (fullCatalog?.length ? fullCatalog : emergencyCatalog).slice(0, 2000);
        const lastChance = buildSetWithRelaxation(
          {
            constraints: selectionInput,
            options: {
              catalog: lastChanceCatalog,
              filterInput,
              conceptTitle: concept.title,
              conceptComposition: concept.composition ?? concept.description ?? '',
              typeIndex: indexCatalogByProductType(lastChanceCatalog),
              seed: index * 54 + regenerationSeed,
              crossConceptBlockedIds: crossIds,
              crossConceptBlockedVariants: crossVariants,
              crossConceptBlockedLineKeys: crossLineKeys,
              onWarn: (msg) => this.logger.warn(`Post-set-builder last-chance "${concept.title}": ${msg}`),
            },
            initial: products,
            targetCount: selectionInput.minProductsPerSet,
            onLog: (msg) => this.logger.warn(`Post-set-builder last-chance "${concept.title}": ${msg}`),
          },
          lastChanceCatalog,
        );
        if (lastChance.products.length >= selectionInput.minProductsPerSet) {
          products = lastChance.products;
        } else if (lastChance.products.length > products.length) {
          products = lastChance.products;
        }
      }

      if (budgetPerSet != null && budgetPerSet > 0 && products.length > 0) {
        const upgradeCtx = {
          title: concept.title,
          composition: concept.composition ?? concept.description ?? '',
          brief: filterInput.userPrompt,
          style: concept.style,
          brandColors,
          filterInput,
          budgetMin: filterInput.budgetMin,
          budgetMax: budgetPerSet,
          maxProductsPerSet: maxItems,
          blockedIds: crossIds,
          blockedVariants: crossVariants,
        };
        products = upgradeSetToTargetBudget(products, workingCatalog, budgetPerSet, upgradeCtx, typeIndex);
      }

      if (products.length < selectionInput.minProductsPerSet) {
        const lastChanceCatalog = (fullCatalog?.length ? fullCatalog : workingCatalog).slice(0, 2000);
        const forced = buildSetWithRelaxation(
          {
            constraints: selectionInput,
            options: {
              catalog: lastChanceCatalog,
              filterInput,
              conceptTitle: concept.title,
              conceptComposition: concept.composition ?? concept.description ?? '',
              typeIndex: indexCatalogByProductType(lastChanceCatalog),
              seed: index * 59 + regenerationSeed,
              crossConceptBlockedIds: crossIds,
              crossConceptBlockedVariants: crossVariants,
              crossConceptBlockedLineKeys: crossLineKeys,
              onWarn: (msg) => this.logger.warn(`Post-set-builder force-min "${concept.title}": ${msg}`),
            },
            initial: products,
            targetCount: selectionInput.minProductsPerSet,
            onLog: (msg) => this.logger.warn(`Post-set-builder force-min "${concept.title}": ${msg}`),
          },
          lastChanceCatalog,
        );
        if (forced.products.length >= selectionInput.minProductsPerSet) {
          products = forced.products.filter((p) => !isCorporateSetFiller(p, filterInput.userPrompt));
        }
        this.logger.warn(
          `Post-set-builder "${concept.title}": ${products.length}/${selectionInput.minProductsPerSet} items after all attempts`,
        );
      }

      if (products.length < selectionInput.minProductsPerSet) {
        const blockedIds = new Set([...crossIds, ...products.map((p) => p.id)]);
        const blockedVariants = new Set(crossVariants);
        for (const p of products) {
          registerCrossConceptBlock(p, blockedIds, blockedVariants);
          registerCrossConceptLineKeys(p, crossLineKeys, filterInput.userPrompt);
        }
        const desperatePool = (fullCatalog?.length ? fullCatalog : workingCatalog)
          .slice(0, 2000)
          .filter((p) => !isCorporateSetFiller(p, filterInput.userPrompt));
        const desperate = ensureConceptProducts(
          products,
          desperatePool,
          selectionInput.minProductsPerSet,
          {
            title: concept.title,
            composition: concept.composition ?? concept.description ?? '',
            brief: filterInput.userPrompt,
            style: concept.style,
            budgetMin: filterInput.budgetMin,
            budgetMax: budgetPerSet,
            budgetPerSet,
            minProductsPerSet: selectionInput.minProductsPerSet,
          },
          blockedIds,
          blockedVariants,
          new ConceptDiversityTracker(
            new Set(resolveMandatoryTypesForBrief(filterInput.userPrompt, filterInput.allowedItems ?? [])),
          ),
          index * 71 + regenerationSeed,
          false,
          (p) => scoreBriefRelevance(p, filterInput.userPrompt, brandColors),
          resolveMandatoryTypesForBrief(filterInput.userPrompt, filterInput.allowedItems ?? []),
        );
        if (desperate.length > products.length) {
          products = desperate.filter((p) => !isCorporateSetFiller(p, filterInput.userPrompt));
        }
      }

      for (const p of products) {
        registerCrossConceptBlock(p, crossIds, crossVariants);
        registerCrossConceptLineKeys(p, crossLineKeys, filterInput.userPrompt);
      }

      if (products.length > 0) {
        const meetsMin = products.length >= selectionInput.minProductsPerSet;
        const { floor: budgetFloor } = resolveSetBudgetRange(filterInput.budgetMin, budgetPerSet);
        const meetsBudget =
          budgetFloor <= 0 || estimateSetTotalPrice(products) >= budgetFloor * 0.92;
        if (meetsMin && meetsBudget) {
          result.push(
            this.mapProductsToConcept(
              concept.title,
              buildCompositionFromProducts(
                products,
                concept.style,
                concept.composition ?? concept.description,
              ),
              concept.style,
              products,
              false,
              index,
              concept.narrative,
              concept.whyItFits,
              brandColors,
              report,
              budgetPerSet,
              filterInput.quantity ?? null,
            ),
          );
        } else {
          this.logger.warn(
            `Post-set-builder "${concept.title}": skip thin set ${products.length}/${selectionInput.minProductsPerSet}, budget ok=${meetsBudget}`,
          );
        }
      } else {
        const shellRescue = buildSetWithRelaxation(
          {
            constraints: selectionInput,
            options: {
              catalog: (fullCatalog?.length ? fullCatalog : workingCatalog).slice(0, 2000),
              filterInput,
              conceptTitle: concept.title,
              conceptComposition: concept.composition ?? concept.description ?? '',
              typeIndex: indexCatalogByProductType((fullCatalog?.length ? fullCatalog : workingCatalog).slice(0, 2000)),
              seed: index * 73 + regenerationSeed,
              crossConceptBlockedIds: crossIds,
              crossConceptBlockedVariants: crossVariants,
              crossConceptBlockedLineKeys: crossLineKeys,
              onWarn: (msg) => this.logger.warn(`Post-set-builder shell-rescue "${concept.title}": ${msg}`),
            },
            initial: [],
            targetCount: selectionInput.minProductsPerSet,
            onLog: (msg) => this.logger.warn(`Post-set-builder shell-rescue "${concept.title}": ${msg}`),
          },
          (fullCatalog?.length ? fullCatalog : workingCatalog).slice(0, 2000),
        );
        const rescued = shellRescue.products.filter(
          (p) => !isCorporateSetFiller(p, filterInput.userPrompt),
        );
        if (rescued.length >= selectionInput.minProductsPerSet) {
          for (const p of rescued) registerCrossConceptBlock(p, crossIds, crossVariants);
          result.push(
            this.mapProductsToConcept(
              concept.title,
              buildCompositionFromProducts(
                rescued,
                concept.style,
                concept.composition ?? concept.description,
              ),
              concept.style,
              rescued,
              false,
              index,
              concept.narrative,
              concept.whyItFits,
              brandColors,
              report,
              budgetPerSet,
              filterInput.quantity ?? null,
            ),
          );
        } else {
          this.logger.warn(
            `Post-set-builder "${concept.title}": no products after all attempts — skipping empty shell`,
          );
        }
      }
    }

    const minRequired = filterInput.minProductsPerSet ?? countBounds.min;
    const refilled = result.filter((c) => (c.catalogProducts?.length ?? 0) >= minRequired).length;
    if (refilled < result.length) {
      this.logger.warn(
        `Post-set-builder: ${result.length - refilled}/${result.length} sets below minProductsPerSet after re-finalize`,
      );
    }
    return result;
  }

  private mapProductsToConcept(

    title: string,

    composition: string | undefined,

    style: string | undefined,

    products: CatalogProduct[],

    usedFallback: boolean,

    index: number,

    narrativeOverride?: string,

    whyItFitsOverride?: string,

    brandColors: string[] = [],

    selectionReport?: SelectionValidationReport,

    budgetPerSet: number | null = null,

    tirage: number | null = null,

  ): Concept {

    const fulfillment = summarizeSetFulfillment(products, tirage);

    const catalogProducts = products.map((p) => {
      const realImage = hasValidProductImage(p);
      const resolvedImage = resolveCatalogImageUrl(p);
      return {
        id: p.id,
        name: p.name,
        category: p.category,
        productType: detectProductRole(p).legacyType,
        price: p.price,
        stockAvailable: p.stockAvailable,
        stockShortfall: productStockShortfall(p, tirage),
        colors: (p.colors ?? [])
          .map((c) => (typeof c === 'string' ? c : typeof c.name === 'string' ? c.name : ''))
          .filter(Boolean),
        targetColor: pickCatalogColorNameForBrand(p, brandColors),
        catalogImageUrl: resolvedImage,
        imageUrl: resolvedImage,
        image: resolvedImage,
        hasCatalogImage: realImage,
        sourceUrl: (p as { sourceUrl?: string | null }).sourceUrl ?? null,
      };
    });



    const previewProductImageUrls = catalogProducts

      .map((p) => p.catalogImageUrl)

      .filter(Boolean) as string[];



    const narrative =

      narrativeOverride ??

      [composition, style ? `Стиль: ${style}` : ''].filter(Boolean).join('\n\n');

    const validationRisks = selectionReport?.violations.map((v) => v.message) ?? [];
    const validationRepairs = selectionReport?.repairs.map((r) => `${r.action}: ${r.reason}`) ?? [];
    const qualityScore = selectionReport
      ? scoreConceptSetQuality(selectionReport, products)
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

      fulfillment,

    };

  }

}



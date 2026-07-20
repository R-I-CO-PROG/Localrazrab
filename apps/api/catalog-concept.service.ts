import { Injectable, Logger } from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import { yieldEventLoop } from '../common/yield-event-loop';

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

import { resolveBudgetPerSet, enforceSetBudget } from '../providers/llm/set-budget.util';

import { filterCatalogByBriefRelevance } from '../providers/llm/catalog-brief-relevance.util';

import {
  resolveConceptFromSlots,
  buildCompositionFromProducts,
  type ProductSlot,
} from '../providers/llm/catalog-slot-picker.util';

import {
  ensureConceptProducts,
  resolveConceptProductSelection,
  upgradeSetToTargetBudget,
} from '../providers/llm/concept-product-picker.util';

import type { CatalogProduct } from '../providers/llm/catalog.util';

import { productVariantKey, upgradeToBrandColorVariants } from '../providers/llm/catalog-variant.util';

import { buildBrandColorScoreFn, pickCatalogColorNameForBrand } from '../providers/llm/catalog-color-match.util';

import { parseCatalogConceptsJson, type LlmCatalogConceptJson } from '../providers/llm/parse-llm-json';

import { defaultItemCount } from '../providers/llm/parse-desired-count';
import {
  averageItemCount,
  pickConceptItemCount,
  resolveProductCountBounds,
} from '../providers/llm/product-count-bounds.util';

import { resolveCatalogImageUrl } from '../products/product-image.util';

import { reconcileBriefConstraints } from '../requests/brief-constraints.util';
import { extractBriefColorsFromText } from '../requests/parse-brief.util';
import { resolveMandatoryTypesForBrief } from '../requests/mandatory-types.util';

import {

  ConceptDiversityTracker,

  detectMandatoryConceptTypesFromBrief,
  detectAlternativeTypeGroupsFromBrief,

  detectConceptProductType,
  typeConflictsInSet,

  enforceConceptSetDiversity,

} from '../providers/llm/concept-diversity.util';

import { scoreBriefRelevance } from '../providers/llm/catalog-brief-relevance.util';

import type { Concept, CatalogIdeatorOutput, CriticOutput } from './contracts';

import type { AgentBriefContext } from './brief-context.util';

import { CatalogIdeatorAgent } from './catalog-ideator.agent';

import { CatalogCriticAgent } from './catalog-critic.agent';

import type { AgentDebugTraceFn } from './agent-debug.types';

import { pickTopCatalogIdeasLocally } from '../providers/llm/catalog-fast-select.util';
import type { GenerationHistory } from './previous-generation.util';
import {
  refillConceptsAvoidingPrevious,
  replacePreviousGenerationProducts,
} from '../providers/llm/regeneration-novelty.util';
import {
  extractProductKeywordsFromBrief,
  findProductsByBriefKeywords,
} from '../providers/llm/brief-keyword-search.util';
import {
  finalizeConceptSelection,
  scoreConceptSetQuality,
  selectionConstraintsFromFilterInput,
  type SelectionValidationReport,
} from '../concept/selection-constraints';
import { detectProductRole } from '../concept/product-role.util';
import { hasValidProductImage } from '../concept/selection-constraints';
import { CRITIC_TOP_N } from './agent.constants';



const TARGET_CONCEPTS = 5;

type RawCatalogConcept = LlmCatalogConceptJson & { productSlots?: ProductSlot[] };



export interface CatalogDiscoverResult {

  concepts: Concept[];

  ideatorOutput?: CatalogIdeatorOutput;

  criticOutput?: CriticOutput;

  pipeline: 'ideator_critic' | 'legacy_llm' | 'fallback';

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

  ) {}



  async discoverConcepts(

    briefInput: AgentBriefContext,

    request: {

      userPrompt: string;

      category: string;

      budgetMin: number | null;

      budgetMax: number | null;

      quantity: number | null;

      setItemCount?: number | null;

      colors: unknown;

      allowedItems: unknown;

      forbiddenItems: unknown;

      blacklistedProductIds?: unknown;

      blacklistedSupplierIds?: unknown;

      assets: Array<{ type: string; url?: string }>;

    },

    options?: { trace?: AgentDebugTraceFn; generationHistory?: GenerationHistory | null },
  ): Promise<CatalogDiscoverResult> {
    const colorsFromBrief = extractBriefColorsFromText(request.userPrompt);
    const colors = [
      ...new Set([...this.normalizeHexColors(request.colors), ...colorsFromBrief]),
    ];

    const rawAllowed = (request.allowedItems as string[]) ?? [];

    const rawForbidden = (request.forbiddenItems as string[]) ?? [];

    const { allowedItems, forbiddenItems } = reconcileBriefConstraints(

      request.userPrompt,

      rawAllowed,

      rawForbidden,

    );

    const logoAsset = request.assets.find((a) => a.type === 'logo');

    const countBounds = resolveProductCountBounds(request);
    const desiredCount = averageItemCount(countBounds);

    const mandatoryConceptTypes = resolveMandatoryTypesForBrief(request.userPrompt);
    const alternativeTypeGroups = detectAlternativeTypeGroupsFromBrief(request.userPrompt);

    const diversityTracker = new ConceptDiversityTracker(new Set(mandatoryConceptTypes));

    const budgetPerSet = resolveBudgetPerSet(request.budgetMin, request.budgetMax);

    const generationHistory = options?.generationHistory ?? null;
    const previousProductIds = new Set(generationHistory?.productIds ?? []);
    const regenerationSeed = (generationHistory?.generationCount ?? 0) * 997;

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

    const stratifiedMax = Number(this.config.get('CATALOG_STRATIFIED_MAX', 480)) || 480;
    const catalogPipeline = await this.llmBrief.prepareCatalogPipeline(filterInput, stratifiedMax);
    const fullCatalog = catalogPipeline.relevance;
    const filteredCatalog = catalogPipeline.filtered;
    const relevanceCatalog = catalogPipeline.relevance;
    const catalogForLlm = catalogPipeline.forLlm;
    const catalogOverview = catalogPipeline.overview;
    const catalogTypeIndex = catalogPipeline.typeIndex;
    const fastPipeline = this.config.get<string>('CATALOG_FAST_PIPELINE', 'true') !== 'false';

    this.logger.log(
      `Catalog pipeline: ${catalogPipeline.totalInDb} total, ${filteredCatalog.length} filtered, ` +
        `${relevanceCatalog.length} relevance-scored, ${catalogOverview.categories.length} categories`,
    );



    const agentBrief: AgentBriefContext = {

      ...briefInput,

      allowedItems,

      forbiddenItems,

    };



    let rawConcepts: LlmCatalogConceptJson[] = [];

    let usedFallback = false;

    let pipeline: CatalogDiscoverResult['pipeline'] = 'ideator_critic';

    let ideatorOutput: CatalogIdeatorOutput | undefined;

    let criticOutput: CriticOutput | undefined;



    try {

      const ideatorResult = await this.catalogIdeator.generateIdeas({

        ...agentBrief,

        desiredItemCount: countBounds.max,

        budgetPerSet,

        mandatoryTypes: mandatoryConceptTypes,

        alternativeTypeGroups,

        catalogOverview,

        trace: options?.trace,

        generationHistory,

      });

      ideatorOutput = { ideas: ideatorResult.ideas };

      usedFallback = ideatorResult.usedFallback;

      if (fastPipeline) {
        criticOutput = pickTopCatalogIdeasLocally(
          ideatorResult.ideas,
          agentBrief,
          CRITIC_TOP_N,
          generationHistory,
        );
        this.logger.log(
          `Catalog fast select: ${ideatorResult.ideas.length} ideas → ${criticOutput.topIdeas.length} sets (no LLM Critic)`,
        );
      } else {
        criticOutput = await this.catalogCritic.pickTop5(
          ideatorResult.ideas,
          {
            ...agentBrief,
            desiredItemCount: countBounds.max,
            budgetPerSet,
            mandatoryTypes: mandatoryConceptTypes,
          },
          options?.trace,
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



    const usedProductIds = new Set<string>(generationHistory?.productIds ?? []);

    const usedVariantKeys = new Set<string>();

    const concepts: Concept[] = [];



    for (let index = 0; index < Math.min(rawConcepts.length, TARGET_CONCEPTS); index++) {
      const conceptItemCount = pickConceptItemCount(countBounds, index);

      concepts.push(

        this.toConcept(

          rawConcepts[index],

          catalogForLlm,

          relevanceCatalog,

          conceptItemCount,

          index,

          usedFallback,

          usedProductIds,

          usedVariantKeys,

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

      await yieldEventLoop();
    }



    while (concepts.length < TARGET_CONCEPTS && catalogForLlm.length > 0) {

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

        if (concepts.length >= TARGET_CONCEPTS) break;

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

    if (emptyCount > 0) {

      this.logger.warn(

        `Catalog concepts: ${emptyCount}/${concepts.length} sets empty — attempting refill`,

      );

      this.refillEmptyConceptProducts(

        concepts,

        catalogForLlm.length >= desiredCount * 4 ? catalogForLlm : relevanceCatalog,

        desiredCount,

        usedProductIds,

        usedVariantKeys,

        diversityTracker,

        budgetPerSet,

        request.userPrompt,

        colors,

      );

    }



    concepts.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

    let finalConcepts = concepts.slice(0, TARGET_CONCEPTS);
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

    return {

      concepts: finalConcepts,

      ideatorOutput,

      criticOutput,

      pipeline,

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

      (p) => !usedProductIds.has(p.id) && !usedVariantKeys.has(productVariantKey(p)),

    );

    const source = pool.length >= desiredCount ? pool : catalog;



    for (let i = 0; i < TARGET_CONCEPTS; i++) {

      const blockedIds = new Set(usedProductIds);

      const blockedVariants = new Set(usedVariantKeys);

      const slice = enforceConceptSetDiversity(

        [],

        source,

        desiredCount,

        diversityTracker,

        blockedIds,

        blockedVariants,

        offset * TARGET_CONCEPTS + i,

      );

      if (!slice.length) break;



      slice.forEach((p) => {

        usedProductIds.add(p.id);

        usedVariantKeys.add(productVariantKey(p));

      });

      concepts.push({

        title: themes[i] ?? `Набор ${offset + i + 1}`,

        composition: `Подбор товаров под задачу: ${userPrompt.slice(0, 120)}`,

        style: themes[i]?.split(' ')[0] ?? 'корпоративный',

        items: slice.map((p) => p.name),

      });

    }

    return concepts;

  }



  private toConcept(

    raw: RawCatalogConcept,

    catalog: CatalogProduct[],

    fullCatalog: CatalogProduct[],

    desiredCount: number,

    index: number,

    usedFallback: boolean,

    usedProductIds: Set<string>,

    usedVariantKeys: Set<string>,

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

    const searchCatalog =
      catalog.length >= Math.max(desiredCount * 4, 80) ? catalog : fullCatalog;

    const pool = searchCatalog.filter(

      (p) => !usedProductIds.has(p.id) && !usedVariantKeys.has(productVariantKey(p)),

    );

    const pickPool = pool.length ? pool : searchCatalog;
    const colorScore = buildBrandColorScoreFn(brandColors);
    const mandatoryTypes = resolveMandatoryTypesForBrief(brief);

    const briefKeywords = extractProductKeywordsFromBrief(brief);
    const keywordProducts =
      briefKeywords.length > 0
        ? findProductsByBriefKeywords(briefKeywords, pickPool, usedProductIds)
        : [];
    if (keywordProducts.length > 0) {
      this.logger.log(
        `Brief keywords [${briefKeywords.join(', ')}] → found ${keywordProducts.length} direct matches for "${conceptTitle}"`,
      );
    }

    let products: CatalogProduct[] = [];

    const keywordTypes = new Set(keywordProducts.map((p) => detectConceptProductType(p)));
    const slotBlockedIds = new Set([
      ...usedProductIds,
      ...keywordProducts.map((p) => p.id),
    ]);

    if (raw.productSlots?.length) {

      const slotsForPicker = raw.productSlots.filter(
        (s) => !typeConflictsInSet(keywordTypes, s.type),
      );
      const slotTypes = new Set(slotsForPicker.map((s) => s.type));

      products = resolveConceptFromSlots(slotsForPicker, pickPool, desiredCount, {

        brief,

        conceptTitle,

        conceptComposition,

        conceptStyle: raw.style?.trim(),

        brandColors,

        filterInput,

        blockedIds: slotBlockedIds,

        blockedVariants: usedVariantKeys,

        seed: index * 17 + regenerationSeed,

        perSetBudget: budgetPerSet,

        budgetMax: budgetPerSet ?? filterInput.budgetMax ?? undefined,

        slotTypes: slotsForPicker.map((s) => s.type),

        desiredCount,

        mandatoryTypes,

      }, catalogTypeIndex);

      {
        const mergedTypes = new Set<string>();
        const merged: CatalogProduct[] = [];
        const allCandidates = [...keywordProducts, ...products];
        for (const p of allCandidates) {
          const type = detectConceptProductType(p);
          if (merged.some((m) => m.id === p.id)) continue;
          if (typeConflictsInSet(mergedTypes, type)) continue;
          merged.push(p);
          mergedTypes.add(type);
          if (merged.length >= desiredCount) break;
        }
        products = merged;
      }

      if (products.length < desiredCount) {

        const slotScoreFn = (product: CatalogProduct) => {
          let score = scoreBriefRelevance(product, brief, brandColors) + colorScore(product);
          const type = detectConceptProductType(product);
          if (slotTypes.has(type)) score += 120;
          if (type === 'other' || type === 'keychain') score -= 150;
          return score;
        };

        products = ensureConceptProducts(

          products,

          pickPool,

          desiredCount,

          { title: conceptTitle, composition: conceptComposition, brief, style: raw.style?.trim() },

          slotBlockedIds,

          usedVariantKeys,

          diversityTracker,

          index * 31 + regenerationSeed,

          false,

          slotScoreFn,

          mandatoryTypes,

        );

      }

    } else {

      products = resolveConceptProductSelection({

        llmItems: raw.items ?? [],

        conceptTitle,

        conceptComposition,

        brief,

        catalog: pickPool,

        desiredCount,

        blockedIds: slotBlockedIds,

        blockedVariants: usedVariantKeys,

        brandColors,

      });

      {
        const mergedTypes = new Set<string>();
        const merged: CatalogProduct[] = [];
        const allCandidates = [...keywordProducts, ...products];
        for (const p of allCandidates) {
          const type = detectConceptProductType(p);
          if (merged.some((m) => m.id === p.id)) continue;
          if (typeConflictsInSet(mergedTypes, type)) continue;
          merged.push(p);
          mergedTypes.add(type);
          if (merged.length >= desiredCount) break;
        }
        products = merged;
      }

      products = ensureConceptProducts(

        products,

        pickPool,

        desiredCount,

        { title: conceptTitle, composition: conceptComposition, brief, style: raw.style?.trim() },

        slotBlockedIds,

        usedVariantKeys,

        diversityTracker,

          index * 17 + regenerationSeed,

          !usedFallback,

          (p) => scoreBriefRelevance(p, brief, brandColors) + colorScore(p),

          mandatoryTypes,

        );

    }



    if (budgetPerSet != null && budgetPerSet > 0 && products.length > 0) {

      const diversityBlockedIds = new Set([...usedProductIds, ...products.map((p) => p.id)]);

      const diversityBlockedVariants = new Set([

        ...usedVariantKeys,

        ...products.map((p) => productVariantKey(p)),

      ]);

      products = enforceSetBudget(

        products,

        pickPool,

        budgetPerSet,

        diversityBlockedIds,

        diversityBlockedVariants,

        index * 31 + regenerationSeed,

      );

      if (!products.length) {

        products = ensureConceptProducts(

          [],

          pickPool.filter((p) => (p.price ?? 0) <= budgetPerSet),

          desiredCount,

          { title: conceptTitle, composition: conceptComposition, brief, style: raw.style?.trim() },

          usedProductIds,

          usedVariantKeys,

          diversityTracker,

          index * 41 + regenerationSeed,

          false,

          undefined,

          mandatoryTypes,

        );

      }

    }



    products = products.slice(0, desiredCount);

    {
      const finalTypes = new Set<string>();
      const deduped: CatalogProduct[] = [];
      for (const p of products) {
        const type = detectConceptProductType(p);
        if (!typeConflictsInSet(finalTypes, type)) {
          deduped.push(p);
          finalTypes.add(type);
        }
      }
      if (deduped.length < products.length) {
        this.logger.warn(
          `Dedup removed ${products.length - deduped.length} conflicting products from "${conceptTitle}"`,
        );
        if (deduped.length < desiredCount) {
          products = ensureConceptProducts(
            deduped,
            pickPool,
            desiredCount,
            { title: conceptTitle, composition: conceptComposition, brief, style: raw.style?.trim() },
            usedProductIds,
            usedVariantKeys,
            diversityTracker,
            index * 53 + regenerationSeed,
            false,
            undefined,
            mandatoryTypes,
          );
        } else {
          products = deduped;
        }
      }
    }

    products = upgradeToBrandColorVariants(products, searchCatalog, brandColors);

    {
      const finalTypes = new Set<string>();
      const clean: CatalogProduct[] = [];
      for (const p of products) {
        const t = detectConceptProductType(p);
        if (typeConflictsInSet(finalTypes, t)) {
          this.logger.warn(`Final dedup: removed "${p.name}" (${t}) from "${conceptTitle}"`);
          continue;
        }
        clean.push(p);
        finalTypes.add(t);
      }
      products = clean;
    }

    if (budgetPerSet != null && budgetPerSet > 0 && products.length > 0) {
      products = upgradeSetToTargetBudget(
        products,
        pickPool,
        budgetPerSet,
        {
          title: conceptTitle,
          composition: conceptComposition,
          brief,
          style: raw.style?.trim(),
          brandColors,
          filterInput,
        },
        catalogTypeIndex,
      );
    }

    if (products.length >= 3) {
      const { scoreSetCohesion, tryFixSetOutlier } = require('../providers/llm/set-cohesion.util');
      const cohesion = scoreSetCohesion(products, { brief, brandColors });
      if (cohesion.outlierIndex !== null && cohesion.score < 55) {
        const fixed = tryFixSetOutlier(
          products,
          cohesion.outlierIndex,
          pickPool,
          usedProductIds,
          usedVariantKeys,
          brandColors,
          brief,
        );
        if (fixed) {
          this.logger.log(
            `Set cohesion fix for "${conceptTitle}": replaced ${products[cohesion.outlierIndex!]?.name} (${cohesion.reason})`,
          );
          products = fixed;
        }
      }
    }

    if (products.length > 0) {
      diversityTracker.recordConceptTypes(products.map(detectConceptProductType));
    }

    const selectionInput = selectionConstraintsFromFilterInput(filterInput, {
      min: filterInput.minProductsPerSet ?? desiredCount,
      max: filterInput.maxProductsPerSet ?? desiredCount,
    });
    const { products: finalizedProducts, report: selectionReport } = finalizeConceptSelection(
      products,
      selectionInput,
      {
        catalog: pickPool,
        filterInput,
        conceptTitle,
        conceptComposition,
        typeIndex: catalogTypeIndex,
        seed: index * 19,
      },
    );
    products = finalizedProducts;

    if (selectionReport.repairs.length > 0 || selectionReport.violations.length > 0) {
      this.logger.log(
        `Selection finalize "${conceptTitle}": ${selectionReport.finalCount} items, ` +
          `${selectionReport.violations.length} violations, ${selectionReport.repairs.length} repairs`,
      );
      void trace?.({
        step: 'selection_finalize',
        actor: 'SelectionConstraints',
        direction: 'internal',
        summary: `${conceptTitle}: ${selectionReport.finalCount} items, ${selectionReport.violations.length} violations`,
        response: {
          title: conceptTitle,
          valid: selectionReport.valid,
          violations: selectionReport.violations,
          repairs: selectionReport.repairs,
          budgetUsedPct: selectionReport.budgetUsedPct,
          budgetFitFailed: selectionReport.budgetFitFailed,
          finalCount: selectionReport.finalCount,
        },
      });
    }

    for (const p of products) {
      usedProductIds.add(p.id);
      usedVariantKeys.add(productVariantKey(p));
    }

    const syncedComposition = buildCompositionFromProducts(
      products,
      raw.style?.trim(),
      conceptComposition,
    );

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

      selectionReport,

    );

  }



  private refillEmptyConceptProducts(

    concepts: Concept[],

    catalog: CatalogProduct[],

    desiredCount: number,

    usedProductIds: Set<string>,

    usedVariantKeys: Set<string>,

    diversityTracker: ConceptDiversityTracker,

    budgetPerSet: number | null,

    brief: string,

    brandColors: string[] = [],

  ): void {

    const mandatoryTypes = resolveMandatoryTypesForBrief(brief);

    for (let i = 0; i < concepts.length; i++) {

      if (concepts[i].catalogProducts?.length) continue;



      const concept = concepts[i];

      let pool = catalog.filter(

        (p) => !usedProductIds.has(p.id) && !usedVariantKeys.has(productVariantKey(p)),

      );

      if (!pool.length) continue;



      if (budgetPerSet != null && budgetPerSet > 0) {

        const affordable = pool.filter((p) => (p.price ?? 0) <= budgetPerSet);

        if (affordable.length >= desiredCount) pool = affordable;

      }



      const colorScore = buildBrandColorScoreFn(brandColors);

      let products = ensureConceptProducts(

        [],

        pool,

        desiredCount,

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



      if (!products.length) continue;

      products = upgradeToBrandColorVariants(products, catalog, brandColors);



      products.forEach((p) => {

        usedProductIds.add(p.id);

        usedVariantKeys.add(productVariantKey(p));

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

      );



      this.logger.log(`Refilled concept "${concept.title}" with ${products.length} products`);

    }

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

  ): Concept {

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

    };

  }

}



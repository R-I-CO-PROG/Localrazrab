import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenrouterAgentClient } from './openrouter-agent.client';
import { parseCatalogIdeatorOutput } from './json-repair.util';
import {
  SYSTEM_PROMPT_IDEATOR_CATALOG,
  SYSTEM_PROMPT_IDEATOR_CATALOG_MORE,
  REGENERATION_NOVELTY_RULES,
} from './prompts';
import {
  IDEATOR_MAX_IDEAS,
  IDEATOR_MIN_IDEAS,
  IDEATOR_TARGET_IDEAS,
  IDEATOR_TARGET_IDEAS_FAST,
  IDEATOR_MIN_IDEAS_FAST,
  IDEATOR_MAX_ATTEMPTS_FAST,
} from './agent.constants';
import { AgentBriefContext, buildAgentBriefPayload } from './brief-context.util';
import { buildAudienceFocusHint } from '../providers/llm/catalog-context-scoring.util';
import type { CatalogIdeatorIdea, CatalogIdeatorOutput, CatalogProductSlot } from './contracts';
import type { AgentDebugTraceFn } from './agent-debug.types';
import type { CatalogOverview } from '../providers/llm/catalog-index.util';
import {
  buildPreviousResultsPayload,
  isSimilarConceptTitle,
  type GenerationHistory,
} from './previous-generation.util';
import {
  getProductTypeFamily,
  CATALOG_IDEATOR_TYPE_SLUGS,
  pickAlternativeTypesForConcept,
} from '../providers/llm/concept-diversity.util';
import { generateLocalCatalogIdeas } from '../providers/llm/catalog-local-ideator.util';
import { withTimeout } from '../common/promise-timeout.util';
import {
  isDirectedBriefMode,
  resolveNamedItemsForBrief,
} from '../requests/named-positions.util';
export type CatalogIdeatorResult = CatalogIdeatorOutput & {
  usedFallback: boolean;
  fallbackReason?: string;
};

/** Приводит boldness к целому 0/1/2; по умолчанию 1 (около-стандартный). */
function clampBoldness(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 1;
  return Math.max(0, Math.min(2, n));
}

export interface CatalogIdeatorInput extends AgentBriefContext {
  desiredItemCount: number;
  budgetPerSet: number | null;
  mandatoryTypes: string[];
  namedTypes?: string[];
  directedMode?: boolean;
  namedItems?: string[];
  alternativeTypeGroups?: string[][];
  catalogOverview: CatalogOverview;
  trace?: AgentDebugTraceFn;
  generationHistory?: GenerationHistory | null;
}

const DRINKWARE_FAMILY = 'drinkware';
const HEADWEAR_FAMILY = 'headwear';
const CARRY_FAMILY = 'carry';

/** Разные «скелеты» наборов — не подставлять всем одну и ту же футболку+кепку+очки */
const SLOT_ARCHETYPES: string[][] = [
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

const SLOT_TYPE_ALIASES: Record<string, string> = {
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

@Injectable()
export class CatalogIdeatorAgent {
  private readonly logger = new Logger(CatalogIdeatorAgent.name);

  constructor(
    private readonly openrouter: OpenrouterAgentClient,
    private readonly config: ConfigService,
  ) {}

  private isFastPipeline(): boolean {
    return this.config.get<string>('CATALOG_FAST_PIPELINE', 'true') !== 'false';
  }

  private ideatorTargets() {
    if (!this.isFastPipeline()) {
      return {
        target: IDEATOR_TARGET_IDEAS,
        min: IDEATOR_MIN_IDEAS,
        maxAttempts: 3,
      };
    }
    return {
      target: IDEATOR_TARGET_IDEAS_FAST,
      min: IDEATOR_MIN_IDEAS_FAST,
      maxAttempts: IDEATOR_MAX_ATTEMPTS_FAST,
    };
  }

  private ideatorTimeoutMs(): number {
    if (this.isFastPipeline()) {
      return Number(this.config.get('CATALOG_IDEATOR_FAST_TIMEOUT_MS', 28_000)) || 28_000;
    }
    return Number(this.config.get('CATALOG_IDEATOR_TIMEOUT_MS', 60_000)) || 60_000;
  }

  private ideatorMaxTokens(): number {
    if (this.isFastPipeline()) {
      return Number(this.config.get('OPENROUTER_MAX_TOKENS_CATALOG_IDEATOR_FAST', 4500)) || 4500;
    }
    return Number(this.config.get('OPENROUTER_MAX_TOKENS_CATALOG_IDEATOR', 8000)) || 8000;
  }

  async generateIdeas(input: CatalogIdeatorInput): Promise<CatalogIdeatorResult> {
    const { min } = this.ideatorTargets();

    const skipLlm = this.config.get<string>('CATALOG_IDEATOR_SKIP_LLM') === 'true';
    if (!this.openrouter.isEnabled() || skipLlm) {
      this.logger.warn(skipLlm ? 'CATALOG_IDEATOR_SKIP_LLM — using local catalog ideator' : 'OpenRouter disabled — using local catalog ideator');
      return this.buildLocalResult(input, skipLlm ? 'skip_llm_env' : 'openrouter_disabled');
    }

    const timeoutMs = this.ideatorTimeoutMs();
    const t0 = Date.now();
    this.logger.log(`CatalogIdeator: starting LLM call, timeout=${timeoutMs}ms, fastPipeline=${this.isFastPipeline()}`);
    try {
      const llmResult = await withTimeout(
        this.generateIdeasFromLlm(input),
        timeoutMs,
        'CatalogIdeator',
      );
      this.logger.log(`CatalogIdeator: LLM succeeded in ${Date.now() - t0}ms`);
      if (llmResult.ideas.length >= min) {
        return { ...llmResult, usedFallback: false };
      }
      this.logger.warn(
        `CatalogIdeator: only ${llmResult.ideas.length}/${min} ideas from LLM — topping up locally`,
      );
      return this.mergeWithLocal(input, llmResult.ideas, 'insufficient_llm_ideas');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`CatalogIdeator: LLM failed/timeout in ${Date.now() - t0}ms (${msg}) — local fallback`);
      return this.buildLocalResult(input, msg.slice(0, 120));
    }
  }

  private buildLocalResult(input: CatalogIdeatorInput, reason: string): CatalogIdeatorResult {
    const raw = generateLocalCatalogIdeas({
      userPrompt: input.userQuery,
      category: input.category,
      desiredItemCount: input.desiredItemCount,
      mandatoryTypes: input.mandatoryTypes,
      alternativeTypeGroups: input.alternativeTypeGroups,
    });
    // ВАЖНО: локальный фолбэк раньше отдавал идеи МИНУЯ normalize() — сезонный оксюморон-гейт
    // («Новогодний пикник») и нормализация слотов не применялись. При WAF-блоке OpenRouter прод
    // идёт 100% через этот путь, поэтому гоняем те же правила, что и для LLM-идей.
    const ideas = this.normalize({ ideas: raw }, input).ideas;
    return { ideas, usedFallback: true, fallbackReason: reason };
  }

  private mergeWithLocal(
    input: CatalogIdeatorInput,
    existing: CatalogIdeatorIdea[],
    reason: string,
  ): CatalogIdeatorResult {
    const rawLocal = generateLocalCatalogIdeas({
      userPrompt: input.userQuery ?? '',
      category: input.category,
      desiredItemCount: input.desiredItemCount,
      mandatoryTypes: input.mandatoryTypes,
      alternativeTypeGroups: input.alternativeTypeGroups,
      count: IDEATOR_MAX_IDEAS,
    });
    // Локальные добор-идеи тоже через normalize() (сезонный гейт + нормализация слотов).
    const local = this.normalize({ ideas: rawLocal }, input).ideas;
    const merged = this.mergeUniqueIdeas(existing, local, input.generationHistory);
    return {
      ideas: merged.slice(0, IDEATOR_MAX_IDEAS),
      usedFallback: existing.length === 0,
      fallbackReason: reason,
    };
  }

  private async generateIdeasFromLlm(input: CatalogIdeatorInput): Promise<CatalogIdeatorOutput> {
    const brief = buildAgentBriefPayload(input);
    let allIdeas: CatalogIdeatorIdea[] = [];
    let lastParseErr: Error | null = null;
    const { target, min, maxAttempts } = this.ideatorTargets();

    const catalogPayload = {
      catalog_overview: input.catalogOverview,
      catalog_total_in_scope:
        input.catalogOverview.totalInDatabase ?? input.catalogOverview.totalProducts,
      allowed_product_types: CATALOG_IDEATOR_TYPE_SLUGS,
      catalog_note:
        'Не выбирайте SKU. Только productSlots с type из allowed_product_types. ' +
        'catalog_overview.categories — ветки IMBA-каталога (51k SKU). ' +
        'Реальные товары подберёт система из всего каталога.',
    };

    const previousResults = buildPreviousResultsPayload(input.generationHistory);
    const regenerationNote = previousResults
      ? 'REPEAT GENERATION: user already saw previous_results — propose NEW angles and slot mixes.'
      : null;
    // ФОКУС АУДИТОРИИ: рамку концепций (заголовки+слоты) задаёт идеатор. Для профессий/предпочтений
    // вне generic-офиса (газовик/нефтяник/…, «многофункциональные») даём ЯВНЫЙ хинт, иначе LLM ловит
    // профессию нестабильно и генерит «Стильный офис»/«Вдохновение» с нерелевантными предметами.
    const audienceFocus = buildAudienceFocusHint(input.userQuery ?? '');

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
            audience_focus: audienceFocus,
            brandColors: input.colors ?? [],
            colorNote:
              input.colors?.length ?
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
            audience_focus: audienceFocus,
            brandColors: input.colors ?? [],
            colorNote:
              input.colors?.length ?
                'Подбирайте слоты и notes с учётом brandColors — одежда и головные уборы в цветах бренда.'
              : null,
            previous_results: previousResults,
            regeneration_note: regenerationNote,
            task:
              `Generate exactly ${target} distinct cohesive gift set concepts that LITERALLY match clientBrief. ` +
              'Use productSlots (types only). Read brief word by word.',
          });

      const content = await this.openrouter.chatJson({
        systemPrompt: isTopUp
          ? `${SYSTEM_PROMPT_IDEATOR_CATALOG_MORE}${previousResults ? `\n\n${REGENERATION_NOVELTY_RULES}` : ''}`
          : `${SYSTEM_PROMPT_IDEATOR_CATALOG}${previousResults ? `\n\n${REGENERATION_NOVELTY_RULES}` : ''}`,
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
        const batch = this.normalize(parseCatalogIdeatorOutput(content), input);
        allIdeas = this.mergeUniqueIdeas(allIdeas, batch.ideas, input.generationHistory);
        this.logger.log(
          `CatalogIdeator batch ${attempt}: +${batch.ideas.length} → ${allIdeas.length} total`,
        );

        if (allIdeas.length >= min) {
          return { ideas: allIdeas.slice(0, IDEATOR_MAX_IDEAS) };
        }
      } catch (err) {
        lastParseErr = err instanceof Error ? err : new Error(String(err));
        this.logger.warn(`CatalogIdeator parse attempt ${attempt}: ${lastParseErr.message.slice(0, 140)}`);
      }
    }

    if (allIdeas.length >= min) {
      return { ideas: allIdeas.slice(0, IDEATOR_MAX_IDEAS) };
    }

    throw (
      lastParseErr ??
      new Error(`CatalogIdeator: недостаточно идей (${allIdeas.length}/${min})`)
    );
  }

  private mergeUniqueIdeas(
    existing: CatalogIdeatorIdea[],
    incoming: CatalogIdeatorIdea[],
    generationHistory?: GenerationHistory | null,
  ): CatalogIdeatorIdea[] {
    const seenTitles = new Set(existing.map((i) => this.normTitle(i.title)));
    const seenAxes = new Set(existing.map((i) => i.themeAxis).filter(Boolean));
    const blockedTitles = generationHistory?.conceptTitles ?? [];
    const blockedAxes = new Set(
      (generationHistory?.themeAxes ?? []).map((a) => a.trim().toLowerCase()),
    );
    const merged = [...existing];
    for (const idea of incoming) {
      const key = this.normTitle(idea.title);
      if (!key || seenTitles.has(key)) continue;
      if (blockedTitles.some((t) => isSimilarConceptTitle(t, idea.title))) continue;
      if (idea.themeAxis) {
        const axis = idea.themeAxis.trim().toLowerCase();
        if (seenAxes.has(idea.themeAxis) || blockedAxes.has(axis)) continue;
      }
      seenTitles.add(key);
      if (idea.themeAxis) seenAxes.add(idea.themeAxis);
      merged.push(idea);
    }
    return merged;
  }

  private normTitle(title: string): string {
    return title.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  private resolveSlotType(raw: string, allowed: Set<string>): string | null {
    const key = raw.trim().toLowerCase().replace(/\s+/g, '_');
    const mapped = SLOT_TYPE_ALIASES[key] ?? key;
    return allowed.has(mapped) ? mapped : null;
  }

  private archetypeIndex(seed: string): number {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
    }
    return hash % SLOT_ARCHETYPES.length;
  }

  private fillSlotsFromArchetype(
    deduped: CatalogProductSlot[],
    desiredCount: number,
    mandatoryTypes: string[],
    fillSeed: string,
    allowed: Set<string>,
  ): CatalogProductSlot[] {
    let carryUsed = deduped.some((s) => getProductTypeFamily(s.type) === CARRY_FAMILY);
    let headwearUsed = deduped.some((s) => getProductTypeFamily(s.type) === HEADWEAR_FAMILY);
    let drinkwareUsed = deduped.some((s) => getProductTypeFamily(s.type) === DRINKWARE_FAMILY);
    const seenTypes = new Set(deduped.map((s) => s.type));
    const seenFamilies = new Set(deduped.map((s) => getProductTypeFamily(s.type)));
    const result = [...deduped];

    const archetype = SLOT_ARCHETYPES[this.archetypeIndex(fillSeed)] ?? SLOT_ARCHETYPES[0];
    const fillOrder = [...archetype, ...SLOT_FILL_EXTRAS];

    for (const type of fillOrder) {
      if (result.length >= desiredCount) break;
      if (!allowed.has(type) || seenTypes.has(type)) continue;
      const family = getProductTypeFamily(type);
      if (seenFamilies.has(family)) continue;
      if (family === CARRY_FAMILY && carryUsed) continue;
      if (family === HEADWEAR_FAMILY && headwearUsed) continue;
      if (family === DRINKWARE_FAMILY && drinkwareUsed) continue;
      result.push({ type, priority: mandatoryTypes.includes(type) ? 'must' : 'nice' });
      seenTypes.add(type);
      seenFamilies.add(family);
      if (family === CARRY_FAMILY) carryUsed = true;
      if (family === HEADWEAR_FAMILY) headwearUsed = true;
      if (family === DRINKWARE_FAMILY) drinkwareUsed = true;
    }

    return result.slice(0, desiredCount);
  }

  private buildDirectedSlots(
    namedTypes: string[],
    namedItems: string[],
    desiredCount: number,
  ): CatalogProductSlot[] {
    const slots: CatalogProductSlot[] = [];
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

  private normalizeSlots(
    raw: unknown,
    desiredCount: number,
    mandatoryTypes: string[],
    alternativeTypeGroups: string[][],
    conceptIndex: number,
    fillSeed: string,
    directedMode = false,
    namedTypes: string[] = [],
    namedItems: string[] = [],
  ): CatalogProductSlot[] {
    if (directedMode && namedTypes.length > 0) {
      return this.buildDirectedSlots(namedTypes, namedItems, desiredCount);
    }
    const allowed = new Set(CATALOG_IDEATOR_TYPE_SLUGS);
    const slots: CatalogProductSlot[] = [];

    if (Array.isArray(raw)) {
      for (const entry of raw) {
        if (!entry || typeof entry !== 'object') continue;
        const e = entry as { type?: string; priority?: string; notes?: string };
        const type = this.resolveSlotType(String(e.type ?? ''), allowed);
        if (!type) continue;
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
    const deduped: CatalogProductSlot[] = [];
    const seenTypes = new Set<string>();
    const seenFamilies = new Set<string>();

    for (const slot of slots) {
      if (seenTypes.has(slot.type)) continue;
      const family = getProductTypeFamily(slot.type);
      if (seenFamilies.has(family)) continue;
      if (family === CARRY_FAMILY) {
        if (carryUsed) continue;
        carryUsed = true;
      }
      if (family === HEADWEAR_FAMILY) {
        if (headwearUsed) continue;
        headwearUsed = true;
      }
      if (family === DRINKWARE_FAMILY) {
        if (drinkwareUsed) continue;
        drinkwareUsed = true;
      }
      seenTypes.add(slot.type);
      seenFamilies.add(family);
      deduped.push(slot);
    }

    for (const type of mandatoryTypes) {
      if (deduped.some((s) => s.type === type)) continue;
      if (deduped.length >= desiredCount) break;
      deduped.unshift({ type, priority: 'must' });
      seenTypes.add(type);
    }

    const altTypes = pickAlternativeTypesForConcept(alternativeTypeGroups, conceptIndex);
    for (const type of altTypes) {
      if (seenTypes.has(type)) continue;
      if (deduped.length >= desiredCount) break;
      deduped.push({ type, priority: 'must' });
      seenTypes.add(type);
    }

    return this.padSlotsToDesiredCount(
      this.fillSlotsFromArchetype(
        deduped,
        desiredCount,
        mandatoryTypes,
        fillSeed,
        allowed,
      ),
      desiredCount,
    );
  }

  private padSlotsToDesiredCount(
    slots: CatalogProductSlot[],
    targetSlots: number,
  ): CatalogProductSlot[] {
    const productSlots = [...slots];
    if (productSlots.length >= targetSlots) {
      return productSlots.slice(0, targetSlots);
    }

    const usedFamilies = new Set(productSlots.map((s) => getProductTypeFamily(s.type)));
    const usedTypes = new Set(productSlots.map((s) => s.type));
    const fillerTypes = CATALOG_IDEATOR_TYPE_SLUGS.filter(
      (t) => !usedFamilies.has(getProductTypeFamily(t)) && !usedTypes.has(t),
    );

    let fi = 0;
    while (productSlots.length < targetSlots && fi < fillerTypes.length) {
      const type = fillerTypes[fi];
      productSlots.push({
        type,
        priority: 'nice',
        notes: '',
      });
      usedFamilies.add(getProductTypeFamily(type));
      usedTypes.add(type);
      fi += 1;
    }

    return productSlots.slice(0, targetSlots);
  }

  private normalize(output: CatalogIdeatorOutput, input: CatalogIdeatorInput): CatalogIdeatorOutput {
    const named = resolveNamedItemsForBrief(input.userQuery ?? '', input.allowedItems ?? []);
    const directedMode = input.directedMode ?? isDirectedBriefMode(named.namedTypes);
    const namedTypes = input.namedTypes?.length ? input.namedTypes : named.namedTypes;
    const namedItems = input.namedItems?.length ? input.namedItems : named.namedItems;

    // Сезонный оксюморон-фильтр: LLM иногда придумывает «Новогодний пикник»/«Летнюю сауну».
    // Отсекаем концепции, чьё НАЗВАНИЕ/тема противоречат сезону брифа (детерминированно —
    // промпт-инструкция ненадёжна). Оставляем ≥4 идей, чтобы не обеднить пул.
    const briefLc = (input.userQuery ?? '').toLowerCase();
    const winterBrief = /новогодн|нов[а-яё]*\s*год|зимн|рождеств|(?<![а-яё])[её]лк/i.test(briefLc);
    const summerBrief = /летн|пляжн|(?<![а-яё])лето(?![а-яё])|жарк|open\s*air/i.test(briefLc);
    const isSeasonalOxymoron = (idea: CatalogIdeatorIdea): boolean => {
      const t = `${idea.title ?? ''} ${idea.themeAxis ?? ''} ${idea.style ?? ''}`.toLowerCase();
      if (winterBrief && /пикник|пляж|beach|picnic|шашлык|барбекю|(?<![a-z])bbq(?![a-z])|(?<![а-яё])сауна|летн(?:ий|ее|яя|ие)/i.test(t)) return true;
      if (summerBrief && /(?<![а-яё])лыжн|каток|снеж|метел|сугроб/i.test(t)) return true;
      return false;
    };

    const ideas: CatalogIdeatorIdea[] = (output.ideas ?? [])
      .filter((idea) => idea.title && idea.composition)
      .map((idea, conceptIndex) => {
        const productSlots = directedMode
          ? this.buildDirectedSlots(namedTypes, namedItems, input.desiredItemCount)
          : this.normalizeSlots(
              idea.productSlots ?? [],
              input.desiredItemCount,
              input.mandatoryTypes,
              input.alternativeTypeGroups ?? [],
              conceptIndex,
              `${idea.themeAxis?.trim() || idea.title?.trim() || 'set'}#${input.generationHistory?.generationCount ?? 0}`,
              directedMode,
              namedTypes,
              namedItems,
            );
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
          boldness: clampBoldness((idea as { boldness?: unknown }).boldness),
        };
      })
      .filter((idea) => idea.productSlots.length >= Math.min(input.desiredItemCount, namedTypes.length || input.desiredItemCount));

    // Отсекаем сезонные оксюмороны, но не опускаемся ниже 4 идей (иначе беднеет спред boldness).
    const seasonal = ideas.filter((idea) => !isSeasonalOxymoron(idea));
    const finalIdeas = seasonal.length >= 4 ? seasonal : ideas;

    return { ideas: finalIdeas };
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { CatalogBuyerAgent } from './catalog-buyer.agent';
import type { AgentDebugTraceFn } from './agent-debug.types';
import type { CatalogProduct } from '../providers/llm/catalog.util';
import type { ProductSlot } from '../providers/llm/catalog-slot-picker.util';
import { buildConceptPool, isExcluded } from '../providers/llm/catalog-shortlist.util';
import { deriveAudienceNeeds, pickArchetypeForConcept, scoreGiftWorthiness, scoreArchetypeMatch, scenarioPropsFor } from '../providers/llm/catalog-context-scoring.util';
import { optimizeComposition, audienceDna } from '../providers/llm/catalog-gift-dna.util';
import { buildBriefRelevanceContext, scoreBriefRelevanceWithContext } from '../providers/llm/catalog-brief-relevance.util';
import { detectConceptProductType, OPTIONAL_TYPE_MAX_CONCEPTS, mandatoryTypeAliases } from '../providers/llm/concept-diversity.util';
import { familyForType, coarseFamilyOf, coarseFamilyForType } from '../concept/product-taxonomy';
import { assembleFromPool, applyRerankToSet, isFunctionallyRedundant } from '../providers/llm/catalog-set-assembler.util';
import { isCompatibleComplement, hasAnchorAffinity } from '../providers/llm/catalog-anchor-affinity.util';
import { estimateSetTotalPrice, resolveSetBudgetRange } from '../providers/llm/set-budget.util';
import { matchesBrandColors, isColorCriticalProduct } from '../providers/llm/catalog-color-match.util';
import { upgradeToBrandColorVariants } from '../providers/llm/catalog-variant.util';
import { scoreConceptCoherence } from '../providers/llm/catalog-context-scoring.util';
import type { SelectionLedger } from '../providers/llm/catalog-selection-ledger';
import {
  enforceSetHardConstraints,
  type SelectionConstraintsInput,
} from '../concept/selection-constraints';
import type {
  ConceptBoldness,
  ShortlistContext,
} from '../providers/llm/catalog-neural-selector.types';
import { productMatchesMaterial } from '../providers/llm/material-match.util';

/**
 * Семейства, исчерпавшие межконцептовый лимит (были в ≥ OPTIONAL_TYPE_MAX_CONCEPTS наборах) —
 * жёстко не наполняем ими новый набор (футболка/флешка/ежедневник не в 3–4 из 5).
 * Освобождены: обязательные типы (нужны в каждом наборе) и catch-all `other`/`unique:other`
 * (не семейство, а свалка РАЗНЫХ неклассифицированных типов — капить нельзя).
 */
export const CATCHALL_FAMILIES = new Set(['other', 'unique:other']);
/** Крупные группы (маппленные из мелких) — лимит 3 из 5; уникальные специфичные — 2. */
const COARSE_MAX_CONCEPTS = 3;
const COARSE_GROUP_KEYS = new Set(['drink', 'carry', 'write', 'paper', 'power', 'tech', 'textile', 'apparel']);

/**
 * Блокируем КРУПНЫЕ семейства (drink/carry/write/paper/power/tech/textile/apparel), исчерпавшие
 * межконцептовый лимит (в ≥2 из 5 наборов) — прямой ответ на «зарядка/сумка/ручка ВЕЗДЕ».
 * Возвращает набор КРУПНЫХ ключей; потребители проверяют coarseFamilyForType(candidate).
 * Освобождены обязательные типы и catch-all other.
 *
 * ВАЖНО: принимает `coarseFamilyUsage` — счётчик «в скольких наборах ВСТРЕЧАЛАСЬ эта крупная
 * группа», по одному инкременту за концепцию (см. absorbConceptIntoRunState). НЕ суммировать
 * из fine-family `familyUsage` здесь: 2 разных мелких семейства одной крупной группы в ОДНОМ
 * наборе (наушники+колонка → 'tech') давали двойной счёт и капили группу уже после 2 наборов
 * вместо 3 (баг «coarse variety-cap double-counts concepts»).
 */
export function computeBlockedFamilies(
  coarseFamilyUsage: Map<string, number> | undefined,
  mandatoryTypes: string[] | undefined,
): Set<string> {
  const mandatoryCoarse = new Set((mandatoryTypes ?? []).map((t) => coarseFamilyOf(familyForType(t))));
  // Крупную группу (drink/carry/write/paper/power/tech/textile/apparel) капим в ≤3 из 5 (тестер
  // флагует повтор при ≥4; cap на 2 голодал бюджет — welcome-pack'у нужны staple-группы). Мелкие
  // уникальные специфичные семейства — на своём лимите (2).
  const blocked = new Set<string>();
  for (const [c, n] of coarseFamilyUsage ?? []) {
    if (mandatoryCoarse.has(c) || CATCHALL_FAMILIES.has(c)) continue;
    const limit = COARSE_GROUP_KEYS.has(c) ? COARSE_MAX_CONCEPTS : OPTIONAL_TYPE_MAX_CONCEPTS;
    if (n >= limit) blocked.add(c);
  }
  return blocked;
}

/**
 * Разворачивает mandatory-slugs брифа в набор slugs продуктового классификатора (термос →
 * термос+термокружка+тамблер). Без этого моста «mandatory нужен в каждом наборе» проверки этого
 * файла (structural-trim/composition-opt/anchor-prune/trimOffTheme/professionHero) точным
 * сравнением упускали реальный mandatory-товар другого, но эквивалентного slug'а — и рисковали
 * его подрезать/заменить наравне с обычной позицией.
 */
function expandMandatorySet(mandatoryTypes: string[] | undefined): Set<string> {
  return new Set((mandatoryTypes ?? []).flatMap((t) => mandatoryTypeAliases(t)));
}

/** Минимальная форма идеи, нужная селектору (декаплинг от RawCatalogConcept). */
export interface NeuralRawConcept {
  title?: string;
  composition?: string;
  items?: string[];
  productSlots?: ProductSlot[];
  style?: string;
  whyItFits?: string;
  themeAxis?: string;
}

/** Богатый нарратив концепции для байера: тема + стиль + «почему подходит» + роли слотов.
 *  Одна строка conceptSummary не давала модели «истории» → наборы выходили «свалкой». */
function buildConceptNarrative(raw: NeuralRawConcept): string {
  const slotRoles = (raw.productSlots ?? [])
    .map((s) => s.notes || s.positionLabel || s.type)
    .filter(Boolean)
    .slice(0, 6)
    .join(', ');
  const parts = [
    raw.composition?.trim(),
    raw.whyItFits?.trim(),
    raw.style?.trim() ? `Стиль: ${raw.style.trim()}` : '',
    slotRoles ? `Состав-задумка: ${slotRoles}` : '',
  ].filter(Boolean);
  return parts.join('. ').slice(0, 420);
}

export interface SelectConceptArgs {
  raw: NeuralRawConcept;
  boldness: ConceptBoldness;
  /** Суженный/стратифицированный каталог для шортлистов. */
  catalog: CatalogProduct[];
  /** Полный каталог для крайнего добора. */
  fullCatalog: CatalogProduct[];
  ledger: SelectionLedger;
  minItems: number;
  maxItems: number;
  budgetPerSet: number | null;
  brief: string;
  brandColors: string[];
  /** Категории/типы из брифа «Исключения» — жёсткий запрет во всех наборах. */
  excludedItems?: string[];
  /** «Можно только X» — жёсткий whitelist категорий/бакетов (не гейтуется в пуле, только на
   *  финальном enforce, т.к. relaxed-пул уже мягко whitelist-ит; здесь — гарантия последнего слова). */
  allowedItems?: string[];
  /** true → whitelist из СВОБОДНОГО ТЕКСТА (illustrative), enforce может смягчать not_in_allowed_bucket
   *  до floor. false → ЯВНАЯ UI-категория («Посуда»): жёсткий whitelist (не возвращаем зонты). */
  allowedBucketSoft?: boolean;
  /** Семейства из ПРЕДЫДУЩИХ наборов прогона — для межконцептового анти-однообразия. */
  familyUsage?: Map<string, number>;
  /** Крупные группы (coarseFamilyOf) из ПРЕДЫДУЩИХ наборов — по одному инкременту за концепцию
   *  (не сумма мелких семейств: см. computeBlockedFamilies). */
  coarseFamilyUsage?: Map<string, number>;
  /** Обязательные типы из брифа (названные позиции + mandatoryTypes): гарантируем в наборе. */
  mandatoryTypes?: string[];
  /** Тираж заявки: mandatory-кандидаты с остатком ≥ тиража приоритетнее. */
  tirage?: number | null;
  /** Порядковый номер концепции в прогоне — round-robin архетипов (разные истории на 5 наборов). */
  conceptIndex?: number;
  /** id товаров, СМЫСЛОВО близких к уже использованным в прошлых наборах — исключаем из пула
   *  (семантический кросс-концептовый дедуп: «ручка/папка/рюкзак везде» по смыслу). */
  excludedProductIds?: Set<string>;
  /** Материал ВСЕГО набора из LLM-классификации намерения брифа («полностью кожаный набор»,
   *  «набор из дерева») — ЖЁСТКИЙ фильтр пула кандидатов по имени/описанию (в БД нет структурного
   *  поля материала). Если после фильтра кандидатов остаётся < minItems — фильтр не применяется
   *  для ЭТОГО набора (лучше набор без материала, чем пустой/сломанный набор), с предупреждением
   *  в лог, чтобы это было видно, а не тихо проигнорировано.
   */
  requiredMaterial?: string | null;
  trace?: AgentDebugTraceFn;
}

/**
 * Оркестратор нейро-подбора ОДНОГО набора: retrieval → нейро-байер → детерминированная сборка.
 * Всегда возвращает товары по контракту (детерминированная сборка гарантирует ≥ min при
 * непустом каталоге). Никогда не бросает исключений.
 */
@Injectable()
export class CatalogNeuralSelectorService {
  private readonly logger = new Logger(CatalogNeuralSelectorService.name);

  constructor(private readonly buyer: CatalogBuyerAgent) {}

  async selectConceptProducts(args: SelectConceptArgs): Promise<CatalogProduct[]> {
    // Семантический кросс-концептовый дедуп: убираем из кандидатов товары, смыслово близкие к
    // уже использованным в прошлых наборах (передаются из concept.service). До построения пула.
    const ex = args.excludedProductIds;
    let catalog = ex?.size ? args.catalog.filter((p) => !ex.has(p.id)) : args.catalog;
    let fullCatalog = ex?.size ? args.fullCatalog.filter((p) => !ex.has(p.id)) : args.fullCatalog;

    // МАТЕРИАЛ НАБОРА («полностью кожаный набор») — НЕ жёсткий фильтр пула (это отсекало
    // аудиторно-релевантные позиции ДО того, как архетип/аудитория-скоринг buildConceptPool
    // вообще успевал их увидеть — на брифе «кожаное для строителей» в итоге побеждали случайные
    // кожаные кошельки/косметички вместо рабочей экипировки, потому что архетип «стройка» строил
    // пул уже из усечённого материалом каталога, где профильных позиций почти не было).
    // Вместо этого — материал-совпадающие товары СТАВИМ ПЕРВЫМИ в каждом каталоге (без исключения
    // остальных): при per-category cap/сортировке внутри buildConceptPool это отдаёт приоритет
    // кожаному варианту КАЖДОЙ категории/роли, если он есть, но не выбрасывает категории без кожи
    // целиком. Плюс явная инструкция байеру в нарративе (см. buildConceptNarrative ниже).
    if (args.requiredMaterial) {
      const matchesMaterial = (p: CatalogProduct) => productMatchesMaterial(p, args.requiredMaterial!);
      const byMaterialFirst = (a: CatalogProduct, b: CatalogProduct) =>
        Number(matchesMaterial(b)) - Number(matchesMaterial(a));
      catalog = [...catalog].sort(byMaterialFirst);
      fullCatalog = [...fullCatalog].sort(byMaterialFirst);
      const materialCount = fullCatalog.filter(matchesMaterial).length;
      this.logger.log(
        `Material preference "${args.requiredMaterial}": ${materialCount}/${fullCatalog.length} в fullCatalog поставлены первыми (не фильтр, аудитория приоритетнее)`,
      );
    }
    // Дальше по функции ЕСТЬ прямые обращения к args.catalog/args.fullCatalog (напр. бюджетный
    // top-up), а не только к локальным `catalog`/`fullCatalog` выше — мутируем сам args, чтобы
    // фильтр по excludedProductIds/материалу действовал ВЕЗДЕ, а не только в начале функции.
    args.catalog = catalog;
    args.fullCatalog = fullCatalog;
    const ctx: ShortlistContext = {
      brief: args.brief,
      brandColors: args.brandColors,
      budgetPerSet: args.budgetPerSet,
      excludedItems: args.excludedItems,
      familyUsage: args.familyUsage,
      mandatoryTypes: args.mandatoryTypes,
      tirage: args.tirage,
      // Цель ценовой кривой — цена-на-предмет для набора ожидаемого размера. Целимся в
      // ПОЛНЫЙ набор (maxItems), чтобы пул держал доступные качественные позиции под каждый
      // слот; недобор до floor затем добивает assembleFromPool (3b) апгрейдом/добором.
      expectedItems: args.maxItems,
      // Тема КОНКРЕТНОЙ концепции + потребности аудитории → пул различается по концепциям и
      // поднимает профессионально-релевантные позиции над generic-сувенирами.
      conceptTitle: args.raw.title,
      conceptComposition: args.raw.composition,
      audienceNeeds: deriveAudienceNeeds(args.brief),
      // Архетип подарка ЭТОЙ концепции (детерминированно по названию) — связная история набора
      // + жёсткий анти-сувенир для аудитории. Разные концепции → разные архетипы (когерентность+вариативность).
      archetype: pickArchetypeForConcept(args.brief, args.raw.title, args.conceptIndex),
      requiredMaterial: args.requiredMaterial,
    };

    // ЯКОРЬ-РЕЖИМ (когерентность добора к якорю): пользователь просил КОНКРЕТНЫЙ тех-товар
    // (повербанк/зарядка) БЕЗ аудитории-сюжета → точечный запрос, а не подарочный набор. Добор —
    // только СВЯЗАННЫМ (кабель/наушники/хаб), иначе якорь СОЛО. Узко: maxItems<=2 (не сюжетный набор)
    // + archetype==null (нет аудитории) + у якоря есть карта совместимости (тех-зарядка). Флаг отката.
    const anchorEligible =
      process.env.CATALOG_ANCHOR_COHERENCE !== 'false' &&
      args.maxItems <= 2 &&
      ctx.archetype == null;
    const anchorTypeCand = (args.mandatoryTypes ?? []).find((t) => hasAnchorAffinity(t, args.brief)) ?? '';
    const bareTechAnchorMode = anchorEligible && hasAnchorAffinity(anchorTypeCand, args.brief);
    const anchorType = bareTechAnchorMode ? anchorTypeCand || 'powerbank' : undefined;
    const anchorLabel = bareTechAnchorMode ? args.brief : undefined;

    const blockedFamilies = computeBlockedFamilies(args.coarseFamilyUsage, args.mandatoryTypes);

    // Единый категориально-разнообразный пул на концепцию (не по слотам идеатора).
    // catalog = релевантный (на бриф), fullCatalog = широкий (для диверсификации
    // монокатегорийных нишевых брифов вроде эко=сумки).
    let pool = buildConceptPool(catalog, fullCatalog, ctx, args.ledger, {
      size: 48,
      perCategoryCap: 3,
    });

    // АРХЕТИП-ЯДРО: профессиональные позиции (маска для сна врачу, папка руководителя продажнику)
    // часто НЕ попадают в стратифицированный срез каталога → пул их не видит, namePositive-бонусу
    // нечего ранжировать, судья ставит «нет привязки к профессии». Целевая дозагрузка из ПОЛНОГО
    // каталога (как mandatory): до 8 валидных namePositive-кандидатов в НАЧАЛО пула.
    // Реквизит СЮЖЕТА концепции («выезды»→автодержатель, «переговоры»→презентер) + архетипный
    // namePositive: имена этих предметов сами рассказывают историю (судья видит только имена).
    const scenarioRes = scenarioPropsFor(args.raw.title, args.raw.composition);
    const archetypeRe = ctx.archetype?.namePositive;
    const np = scenarioRes.length || archetypeRe
      ? { test: (s: string) => scenarioRes.some((re) => re.test(s)) || (archetypeRe?.test(s) ?? false) }
      : null;
    if (np) {
      const poolIds = new Set(pool.map((p) => p.id));
      const minWorthy = Math.max(150, (args.budgetPerSet ?? 0) * 0.08);
      const relCtx = buildBriefRelevanceContext(args.brief, args.brandColors);
      const seenBase = new Set<string>();
      const core: CatalogProduct[] = [];
      for (const p of fullCatalog) {
        if (core.length >= 8) break;
        // Матч ТОЛЬКО по имени: описание тащило мусор («Сумка-холодильник» через «для поездок»,
        // «Армейский жетон» через «гравировку» в описании).
        if (poolIds.has(p.id) || !np.test(p.name)) continue;
        const price = p.price ?? 0;
        if (price < minWorthy || (args.budgetPerSet != null && args.budgetPerSet > 0 && price > args.budgetPerSet)) continue;
        if ((p.stockAvailable ?? 0) <= 0 || !(p.catalogImageUrl || p.imageUrl)) continue;
        if (!args.ledger.canUse(p)) continue;
        // ЗАПРЕТЫ: сильный матчер (стем/семейства/латиница), а не сырой substring (ломался на
        // «аккумуляторы» vs «внешний аккумулятор», «power bank» vs «пауэр»). Канал archetype-core
        // впрыскивает в ГОЛОВУ пула в обход isExcluded — поэтому проверяем тут явно.
        if (isExcluded(p, args.excludedItems)) continue;
        // Уважаем гейты: сувенирная дешёвка и off-brief (оружие/сезон/novelty) в ядро не идут.
        if (scoreGiftWorthiness(p) < 0) continue;
        if (scoreBriefRelevanceWithContext(p, relCtx) < -20) continue;
        // Дедуп по базовому имени: не «Плед; Плед; Плед».
        const base = p.name.toLowerCase().replace(/[«»"(),./+-]/g, ' ').replace(/\s+/g, ' ').slice(0, 28);
        if (seenBase.has(base)) continue;
        seenBase.add(base);
        core.push(p);
      }
      if (core.length) {
        pool.unshift(...core);
        this.logger.log(
          `Archetype core "${ctx.archetype?.id}": +${core.length} проф. позиций [${core.slice(0, 3).map((p) => p.name.slice(0, 36)).join('; ')}]`,
        );
      }
    }

    // ОБРЕЗКА JUNK-ХВОСТА: штрафы лишь ранжируют пул, но LLM-байер видит все карточки плоским
    // списком и берёт любую (фляжка −120, браслет −70 всё равно попадали в наборы). Анти-архетип
    // и сувенирную дешёвку убираем из пула ФИЗИЧЕСКИ — байеру их не показываем. Минимум 24
    // позиции сохраняем (разнообразие/контракт); это пул на концепцию, не каталог.
    // Семантический мусор: fit к интенту аудитории заметно отрицательный («органайзер для
    // багажника» −0.14 продажнику) — физически убираем из пула (байер видит плоский список).
    const SEM_JUNK = -0.05;
    if (pool.some((p) => p.semanticFit != null)) {
      const semKept = pool.filter((p) => p.semanticFit == null || p.semanticFit >= SEM_JUNK);
      if (semKept.length >= 20 && semKept.length < pool.length) {
        const dropped = pool.length - semKept.length;
        pool.length = 0;
        pool.push(...semKept);
        this.logger.log(`Pool semantic-trim: −${dropped} позиций (fit < ${SEM_JUNK})`);
      }
    }
    if (ctx.archetype || pool.length > 24) {
      const kept = pool.filter(
        (p) => scoreArchetypeMatch(p, ctx.archetype, args.budgetPerSet) >= 0 && scoreGiftWorthiness(p) >= 0,
      );
      if (kept.length >= 24) {
        const dropped = pool.length - kept.length;
        pool.length = 0;
        pool.push(...kept);
        if (dropped > 0) this.logger.log(`Pool junk-trim: −${dropped} анти/сувенир позиций, осталось ${kept.length}`);
      }
    }

    // СТРУКТУРНАЯ РАЗВЯЗКА НАБОРОВ: семейства, исчерпавшие межконцептовый лимит (drinkware/carry/
    // pen после 2 наборов), убираем из пула ФИЗИЧЕСКИ — иначе LLM-байер берёт их из плоского
    // списка и все 5 наборов получают костяк «попить+рюкзак+ручка» (жалоба: концепции-клоны).
    // Страховка бюджета остаётся: 3c/relaxed-добор идут мимо пула. Минимум 20 позиций сохраняем.
    if (blockedFamilies.size) {
      const mandatorySet = expandMandatorySet(args.mandatoryTypes);
      const structKept = pool.filter((p) => {
        const type = detectConceptProductType(p);
        if (mandatorySet.has(type)) return true; // mandatory нужен в каждом наборе
        return !(blockedFamilies.has(coarseFamilyForType(type)) || blockedFamilies.has(familyForType(type)));
      });
      if (structKept.length >= 20 && structKept.length < pool.length) {
        const dropped = pool.length - structKept.length;
        pool.length = 0;
        pool.push(...structKept);
        this.logger.log(`Pool structure-trim: −${dropped} позиций исчерпанных семейств [${[...blockedFamilies].slice(0, 5).join(', ')}]`);
      }
    }

    for (const type of args.mandatoryTypes ?? []) {
      const inPool = pool.filter((p) => detectConceptProductType(p) === type);
      const inCatalog = catalog.filter((p) => detectConceptProductType(p) === type).length;
      const inFull = fullCatalog.filter((p) => detectConceptProductType(p) === type).length;
      this.logger.log(
        `Mandatory "${type}": catalog=${inCatalog}, fullCatalog=${inFull}, pool=${inPool.length} ` +
          `[${inPool.slice(0, 4).map((p) => `${p.name.slice(0, 40)}|${p.price}₽|сток${p.stockAvailable}`).join('; ')}]`,
      );
    }

    let composition = null;
    try {
      composition = await this.buyer.composeSet(
        {
          brief: args.brief,
          conceptTitle: args.raw.title?.trim() || 'Набор',
          conceptNarrative:
            buildConceptNarrative(args.raw) +
            (ctx.archetype
              ? `\nАрхетип набора: «${ctx.archetype.id}» — собери ЕДИНУЮ историю под него; обязательно включи 1-2 позиции с явной профессиональной привязкой к аудитории брифа (они в начале пула).`
              : '') +
            (args.requiredMaterial
              ? `\nМАТЕРИАЛ (жёсткое требование клиента): все позиции должны быть из «${args.requiredMaterial}», где это в принципе бывает у данного типа товара. Аудитория/роль набора ВАЖНЕЕ материала — НЕ бери случайный ${args.requiredMaterial}-товар не по теме (напр. косметичку/кошелёк для набора не про личные аксессуары) только чтобы выполнить материал; товары в пуле уже отсортированы так, что подходящие по материалу идут первыми среди прочих равных — предпочитай их среди тематически уместных вариантов.`
              : ''),
          boldness: args.boldness,
          budgetPerSet: args.budgetPerSet,
          minItems: args.minItems,
          maxItems: args.maxItems,
          pool,
          brandColors: args.brandColors,
        },
        args.trace,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Neural compose failed (${msg}) — deterministic assembly`);
      composition = null;
    }

    let set = assembleFromPool({
      pool,
      productIds: composition?.productIds ?? null,
      ledger: args.ledger,
      minItems: args.minItems,
      maxItems: args.maxItems,
      budgetPerSet: args.budgetPerSet,
      brief: args.brief,
      brandColors: args.brandColors,
      fullCatalog,
      excludedItems: args.excludedItems,
      mandatoryTypes: args.mandatoryTypes,
      tirage: args.tirage,
      blockedFamilies,
      familyUsage: args.familyUsage,
      conceptTitle: ctx.conceptTitle,
      conceptComposition: ctx.conceptComposition,
      anchorType,
      anchorLabel,
      // Архетип-анти как ЖЁСТКИЙ отвод (не только −120 скор): иначе relaxed()-добор из сырого
      // fullCatalog втаскивал golf-набор врачу / косметичку мужской аудитории мимо скоринга.
      // В якорь-режиме архетипа нет (anchorEligible требует archetype==null) → отвода нет.
      reject: ctx.archetype
        ? (p) => scoreArchetypeMatch(p, ctx.archetype, args.budgetPerSet) < 0
        : undefined,
    });

    // #6 ЦВЕТО-СТАРВАЦИЯ (отзыв ЦА «бюджет 4000 → одна бутылка»): строгий цвет-гейт вырезал
    // тематичные цвето-критичные товары ОТОВСЮДУ (фирм. red/green/yellow клешат с сине-серым уютом),
    // выжили лишь не-цвето-критичные (ручки) → семейный дедуп → 1 позиция. Если набор не дотянул до
    // minItems при заданном цвете — ПЕРЕСОБИРАЕМ с релаксом цвета: полный тематичный набор в
    // неидеальном цвете лучше одной ручки. Дальше enforce/квота палитры для этой концепции цвет НЕ
    // навязывают (иначе снова выкосят). Флаг отката.
    if (
      process.env.CATALOG_RELAX_COLOR_ON_STARVE !== 'false' &&
      set.length < args.minItems &&
      (args.brandColors?.length ?? 0) > 0 &&
      !ctx.relaxColorClash
    ) {
      this.logger.log(
        `Цвето-старвация: набор ${set.length}<${args.minItems} при цвете [${args.brandColors.join(',')}] — пересборка с релаксом цвета`,
      );
      set.forEach((p) => args.ledger.release(p));
      ctx.relaxColorClash = true;
      pool = buildConceptPool(catalog, fullCatalog, ctx, args.ledger, { size: 48, perCategoryCap: 3 });
      set = assembleFromPool({
        pool,
        productIds: null,
        ledger: args.ledger,
        minItems: args.minItems,
        maxItems: args.maxItems,
        budgetPerSet: args.budgetPerSet,
        brief: args.brief,
        brandColors: args.brandColors,
        fullCatalog,
        excludedItems: args.excludedItems,
        mandatoryTypes: args.mandatoryTypes,
        tirage: args.tirage,
        blockedFamilies,
        familyUsage: args.familyUsage,
        conceptTitle: ctx.conceptTitle,
        conceptComposition: ctx.conceptComposition,
        anchorType,
        anchorLabel,
        relaxColorClash: true,
        reject: ctx.archetype
          ? (p) => scoreArchetypeMatch(p, ctx.archetype, args.budgetPerSet) < 0
          : undefined,
      });
    }

    // LLM-критик связности (флаг CATALOG_COHERENCE_RERANK, дефолт on): оценивает СОБРАННЫЙ набор
    // целиком и меняет 1-2 худшие/нетематичные позиции на лучшие из пула. Свопы детерминированно
    // валидируются (applyRerankToSet: cap/mandatory/dupe/familyBlocked, ledger sync). Fail → исходный набор.
    let finalSet = set;
    // >= 2 (было >= 3): наборы 1-2 товара (бриф «1-2 товара») тоже получают критик связности —
    // раньше для них ВЕСЬ слой качества отключался. Свопы валидируются и ничего не роняют.
    if (process.env.CATALOG_COHERENCE_RERANK !== 'false' && set.length >= 2) {
      try {
        const rr = await this.buyer.rerankSet(
          {
            brief: args.brief,
            conceptTitle: args.raw.title ?? '',
            conceptNarrative: args.raw.composition ?? '',
            audienceNeeds: ctx.audienceNeeds,
            archetypeId: ctx.archetype?.id ?? null,
            budgetPerSet: args.budgetPerSet,
            current: set,
            pool,
          },
          args.trace,
        );
        if (rr?.replace.length) {
          finalSet = applyRerankToSet({
            set,
            pool,
            swaps: rr.replace,
            ledger: args.ledger,
            budgetPerSet: args.budgetPerSet,
            mandatoryTypes: args.mandatoryTypes,
            blockedFamilies,
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Coherence rerank failed (${msg}) — keep set`);
      }
    }

    // КОМПОЗИЦИОННЫЙ ПОИСК (флаг CATALOG_COMPOSITION_OPT, дефолт on): hill-climb по пулу,
    // максимизирующий КОМПОЗИЦИОННЫЙ скор набора (цельность истории + синергии предметов +
    // соответствие ДНК аудитории) вместо суммы независимых скоров товаров. Заменяет чужеродные
    // позиции на усиливающие историю (флешка→чай в уютном наборе), не трогая mandatory/cap/дубли.
    if (process.env.CATALOG_COMPOSITION_OPT !== 'false' && finalSet.length >= 2) {
      const mandSet = expandMandatorySet(args.mandatoryTypes);
      const minWorthy = Math.max(150, (args.budgetPerSet ?? 0) * 0.08);
      const { set: optimized, swaps } = optimizeComposition({
        set: finalSet,
        pool,
        audience: audienceDna(args.brief),
        budgetPerSet: args.budgetPerSet,
        isMandatory: (p) => mandSet.has(detectConceptProductType(p)),
        canUse: (p) => args.ledger.canUse(p),
        dupesRole: (cand, rest) =>
          isFunctionallyRedundant(cand, rest) ||
          rest.some((r) => (r.category && r.category === cand.category) ||
            familyForType(detectConceptProductType(r)) === familyForType(detectConceptProductType(cand))),
        minWorthy,
        // Свопим ТОЛЬКО в архетип-положительных героев аудитории (визитница/папка/термокружка/
        // плед) — не в ложные keyword-DNA матчи (органайзер для багажника). Улучшаем историю
        // строго релевантными позициями. В ЯКОРЬ-режиме — только в связанный с якорём комплемент
        // (иначе hill-climb по синергии travel+energy втащит поясную сумку обратно к повербанку).
        accept: bareTechAnchorMode
          ? (cand: CatalogProduct) => isCompatibleComplement(anchorType!, anchorLabel!, cand)
          : ctx.archetype
            ? (cand) => scoreArchetypeMatch(cand, ctx.archetype, args.budgetPerSet) > 0
            : undefined,
        // Фиксируем свопы в реестре ПО ХОДУ поиска — тогда canUse каждой итерации видит
        // актуальный набор и не пускает line/variant-дубль уже свопнутого кандидата (иной семьи,
        // мимо dupesRole). Реестр уже обновлён внутри — здесь повторно НЕ применяем.
        release: (p) => args.ledger.release(p),
        reserve: (p) => args.ledger.reserve(p),
      });
      if (swaps.length) this.logger.log(`Composition-opt: ${swaps.length} своп(ов), скор ↑ [${swaps.map((s) => `${s.from.name.slice(0, 16)}→${s.to.name.slice(0, 16)}`).join('; ')}]`);
      finalSet = optimized;
    }

    // ГАРАНТИЯ ПРОФЕССИОНАЛЬНОГО ЯКОРЯ: судья требует, чтобы КАЖДЫЙ набор явно отражал аудиторию
    // («ни один набор не отражает специфику продажника»). Если в наборе нет ни одной namePositive-
    // позиции (визитница/папка врачу — маска для сна), меняем слабейшую НЕ-mandatory позицию на
    // лучшего доступного героя из пула (в рамках cap, без дубля роли/категории).
    if (process.env.CATALOG_PROFESSION_HERO !== 'false') {
      finalSet = this.ensureProfessionHero(finalSet, pool, ctx, args);
    }

    // ФИНАЛЬНЫЙ АНТИ-OFF-THEME КРИТИК: судья систематически бьёт за 1-2 позиции «не для этой
    // аудитории/повода» (плед мужчинам на 23 февраля, коврик для пикника на 8 марта). Заменяем
    // самую нерелевантную позицию на on-theme аналог из пула; если замены нет — выбрасываем
    // (набор остаётся ≥3). Это убирает провальные концепции (ии<45), тянущие средний балл вниз.
    if (process.env.CATALOG_OFFTHEME_TRIM !== 'false') {
      finalSet = this.trimOffTheme(finalSet, pool, ctx, args);
    }

    // #4 СВЯЗНОСТЬ НАЗВАНИЯ И СОСТАВА: концепция с сильной темой заголовка («Тёплый уют») должна
    // иметь ≥половины позиций В ТЕМЕ. Нейро-сборщик выбрасывает slot-план идеатора и берёт товары
    // из brief-релевантного пула, поэтому «уют» = плед+бутылка+полотенце. Свопаем нейтральные/оф-темные
    // не-mandatory позиции на on-theme аналоги из пула (только если замена есть — набор не роняем).
    if (process.env.CATALOG_TITLE_COHERENCE !== 'false') {
      finalSet = this.enforceTitleCoherence(finalSet, pool, ctx, args);
    }

    // ФИНАЛЬНЫЙ ANCHOR-PRUNE: rerank/composition-opt/professionHero/trimOffTheme могли ВЕРНУТЬ
    // несвязанный с якорём товар (у applyRerankToSet нет anchor-проверки). В якорь-режиме снимаем
    // НЕ-mandatory позицию, несовместимую с якорём, пока набор > minItems (min=1 → падаем до соло:
    // лучше один повербанк, чем повербанк+помада/сумка/блокнот).
    if (bareTechAnchorMode && anchorType) {
      const mand = expandMandatorySet(args.mandatoryTypes);
      const minKeep = Math.max(1, args.minItems);
      for (let i = finalSet.length - 1; i >= 0 && finalSet.length > minKeep; i--) {
        const p = finalSet[i];
        if (mand.has(detectConceptProductType(p))) continue; // якорь/mandatory не трогаем
        if (!isCompatibleComplement(anchorType, anchorLabel!, p)) {
          args.ledger.release(p);
          finalSet.splice(i, 1);
          this.logger.log(`Anchor-prune: снят несвязанный «${p.name.slice(0, 30)}» (якорь «${anchorLabel?.slice(0, 24)}»)`);
        }
      }
    }

    // ВОССТАНОВЛЕНИЕ БЮДЖЕТ-FLOOR ПОСЛЕ ПОСТ-ГЕЙТОВ. assembleFromPool (блоки 3b/3c) доводил сумму
    // до floor (~85% cap), но следующая цепочка МОГЛА её опустить: applyRerankToSet и
    // optimizeComposition меняют позицию на более дешёвую, а trimOffTheme ВЫБРАСЫВАЕТ позицию без
    // замены. Терминальный бэкстоп подрезает только ПОТОЛОК (cap) и floor не восстанавливает —
    // набор уезжал «тонким» (судья бьёт за недобор бюджета). Добираем тематичными позициями пула
    // в рамках cap. Bounded: не выше maxItems, не дороже cap, только не-дубли и не архетип-анти.
    finalSet = this.topUpToBudgetFloor(finalSet, pool, ctx, args, bareTechAnchorMode ? anchorType : undefined, anchorLabel);

    // ЕДИНЫЙ ФИНАЛЬНЫЙ БЭКСТОП ОГРАНИЧЕНИЙ (флаг CATALOG_FINAL_ENFORCE, дефолт on): что бы ни
    // натворили LLM-реранк / composition-opt / professionHero / archetype-core / mandatory-fallback
    // (у них частичные гейты), собранный набор проходит через авторитетную проверку обещаний
    // пользователю — forbidden item/цвет, цвето-критичный клеш с брендом, битое фото, тираж, бюджет —
    // и чинится добором из пула. Так утечка не зависит от того, что конкретный гейт «не забыл».
    if (process.env.CATALOG_FINAL_ENFORCE !== 'false') {
      const scInput: SelectionConstraintsInput = {
        userPrompt: args.brief,
        budgetPerSet: args.budgetPerSet,
        quantity: args.tirage ?? null,
        minProductsPerSet: Math.max(1, args.minItems),
        maxProductsPerSet: Math.max(args.minItems, args.maxItems),
        // При цвето-старвации (пересобрали с релаксом) enforce НЕ вырезает по цвету — иначе снова
        // выкосит тематичные позиции до 1 ручки. Цвет тут — уже осознанный компромисс.
        colors: ctx.relaxColorClash ? [] : args.brandColors,
        allowedItems: args.allowedItems ?? [],
        allowedBucketSoft: args.allowedBucketSoft ?? false,
        forbiddenItems: args.excludedItems ?? [],
        mandatoryTypes: args.mandatoryTypes,
      };
      const accept =
        bareTechAnchorMode && anchorType
          ? (c: CatalogProduct) => isCompatibleComplement(anchorType, anchorLabel!, c)
          : undefined;
      const enforced = enforceSetHardConstraints(finalSet, scInput, pool, {
        ledger: args.ledger,
        accept,
        log: (m) => this.logger.log(m),
      });
      finalSet = enforced.set;
    }

    // #2 ФИРМЕННЫЕ ЦВЕТА: в нейро-пути цвет иначе НИКАК не гарантируется — доминирует релевантность,
    // все пост-гейты цвет игнорируют. (а) снап выбранных SKU к их фирменно-цветному варианту той же
    // линейки (если есть в каталоге); (б) квота палитры — ≥половина цвето-критичных позиций в
    // фирменном цвете (своп худшей не-в-палитре на палитровый аналог из пула). Флаг отката.
    if (process.env.CATALOG_BRAND_PALETTE !== 'false' && (args.brandColors?.length ?? 0) > 0 && !ctx.relaxColorClash) {
      finalSet = upgradeToBrandColorVariants(
        finalSet,
        fullCatalog.length ? fullCatalog : catalog,
        args.brandColors,
      );
      finalSet = this.enforceBrandPaletteQuota(finalSet, pool, ctx, args);
    }

    // МАТЕРИАЛ — ЖЁСТКАЯ ЗАМЕНА ПРИ НАЛИЧИИ («полностью кожаный набор»): скоринг-бонус (+40 в
    // scoreRow) сам по себе слишком слаб против суммы архетипа/связности/аудитории — набор мог
    // остаться почти без материала, даже когда кожаные варианты РЕАЛЬНО есть в пуле. Здесь —
    // гарантия, а не надежда: аудитория/роль товара УЖЕ выбрана всеми предыдущими шагами, меняем
    // только НА ТОТ ЖЕ ТИП товара — не превращаем термос в кошелёк, только «обычный термос» →
    // «кожаный термос», если такой вариант есть. СТОИТ ПОСЛЕДНИМ ШАГОМ: enforceSetHardConstraints/
    // topUpToBudgetFloor/trimOffTheme/enforceTitleCoherence добирают из пула БЕЗ учёта материала и
    // ранее откатывали своп, если он стоял до них — теперь это финальное слово по материалу.
    if (args.requiredMaterial) {
      const needle = args.requiredMaterial;
      let materialSwaps = 0;
      finalSet = finalSet.map((current) => {
        if (productMatchesMaterial(current, needle)) return current;
        const type = detectConceptProductType(current);
        const candidate = pool.find(
          (p) =>
            p.id !== current.id &&
            detectConceptProductType(p) === type &&
            productMatchesMaterial(p, needle) &&
            args.ledger.canUse(p) &&
            (args.budgetPerSet == null || args.budgetPerSet <= 0 || (p.price ?? 0) <= args.budgetPerSet),
        );
        if (!candidate) return current;
        args.ledger.release(current);
        args.ledger.reserve(candidate);
        materialSwaps++;
        return candidate;
      });
      if (materialSwaps) {
        this.logger.log(
          `Material hard-swap "${args.requiredMaterial}": ${materialSwaps} позиц. заменено на материал-совпадающие того же типа`,
        );
      }
    }

    return finalSet;
  }

  /**
   * Добирает набор до бюджет-floor тематичными позициями пула, если пост-гейты (реранк /
   * composition-opt / trimOffTheme) опустили сумму ниже. Никогда не пробивает cap и maxItems,
   * не дублирует категорию/семейство, не берёт архетип-анти и несвязанное с якорём.
   * Флаг CATALOG_BUDGET_FLOOR_TOPUP=false отключает.
   */
  private topUpToBudgetFloor(
    set: CatalogProduct[],
    pool: CatalogProduct[],
    ctx: ShortlistContext,
    args: SelectConceptArgs,
    anchorType?: string,
    anchorLabel?: string,
  ): CatalogProduct[] {
    if (process.env.CATALOG_BUDGET_FLOOR_TOPUP === 'false') return set;
    const budgetPerSet = args.budgetPerSet;
    if (budgetPerSet == null || budgetPerSet <= 0) return set;
    const { floor, cap } = resolveSetBudgetRange(null, budgetPerSet);
    if (floor <= 0 || cap <= 0) return set;

    const next = set.slice();
    const relCtx = buildBriefRelevanceContext(args.brief, args.brandColors);
    const setIds = new Set(next.map((p) => p.id));
    const usedCats = new Set(next.map((p) => p.category).filter(Boolean));
    const usedFams = new Set(next.map((p) => familyForType(detectConceptProductType(p))));
    const FILL_RELEVANCE_FLOOR = -20;
    // #4 СВЯЗНОСТЬ: добор — тема-осознанный (не тащим анти-тему заголовка; on-theme в приоритете),
    // чтобы «Тёплый уют» не добивался бутылкой/полотенцем ради суммы. Флаг отката.
    const themeAware = process.env.CATALOG_THEME_AWARE_FILL !== 'false';
    const coh = (p: CatalogProduct) =>
      themeAware ? scoreConceptCoherence(p, ctx.conceptTitle, ctx.conceptComposition) : 0;
    const pickFrom = (source: CatalogProduct[], allowCatRepeat: boolean): CatalogProduct | undefined => {
      const headroom = cap - estimateSetTotalPrice(next);
      return source
        .filter((p) => !setIds.has(p.id) && args.ledger.canUse(p))
        .filter((p) => (p.price ?? 0) > 0 && (p.price ?? 0) <= headroom)
        .filter((p) => allowCatRepeat || !usedCats.has(p.category))
        .filter((p) => !usedFams.has(familyForType(detectConceptProductType(p))))
        .filter((p) => !isFunctionallyRedundant(p, next))
        .filter((p) => scoreBriefRelevanceWithContext(p, relCtx) >= FILL_RELEVANCE_FLOOR)
        .filter((p) => scoreArchetypeMatch(p, ctx.archetype, budgetPerSet) >= 0)
        .filter((p) => coh(p) >= 0)
        .filter((p) => !anchorType || isCompatibleComplement(anchorType, anchorLabel ?? '', p))
        // Сначала on-theme, затем максимальный вклад в бюджет (освоить floor КАЧЕСТВЕННО).
        .sort((a, b) => coh(b) - coh(a) || (b.price ?? 0) - (a.price ?? 0))[0];
    };
    // #6 БЮДЖЕТ/РЕГЕН: пул концепции мог оголодать (ledger пинит прошлые наборы + цвето/сток/
    // дедуп-гейты) — тогда добор из ШИРОКОГО каталога (сперва строго, затем с повтором категории),
    // иначе набор уезжает «одна бутылка при живом бюджете 4000₽». Флаг отката.
    const wideFallback = process.env.CATALOG_WIDE_TOPUP_FALLBACK !== 'false';
    const full = args.fullCatalog ?? [];
    let added = 0;

    while (estimateSetTotalPrice(next) < floor && next.length < args.maxItems) {
      const cand =
        pickFrom(pool, false) ??
        (wideFallback
          ? pickFrom(full, false) ?? pickFrom(pool, true) ?? pickFrom(full, true)
          : undefined);
      if (!cand) break;
      args.ledger.reserve(cand);
      next.push(cand);
      setIds.add(cand.id);
      if (cand.category) usedCats.add(cand.category);
      usedFams.add(familyForType(detectConceptProductType(cand)));
      added++;
    }

    if (added) {
      this.logger.log(
        `Budget floor top-up: +${added} позиц. (сумма ${Math.round(estimateSetTotalPrice(set))} → ` +
          `${Math.round(estimateSetTotalPrice(next))} ₽, floor ${Math.round(floor)})`,
      );
    }
    return next;
  }

  /**
   * #4 СВЯЗНОСТЬ ЗАГОЛОВКА И СОСТАВА: для концепции с ЯВНОЙ темой заголовка требует ≥ceil(size/2)
   * позиций В ТЕМЕ (scoreConceptCoherence>0). Свопает худшие нейтральные/оф-темные не-mandatory на
   * on-theme аналоги из пула. Консервативно: только при наличии on-theme замены; набор не роняет.
   * Концепцию без явной темы (все coherence=0) не трогает.
   */
  private enforceTitleCoherence(
    set: CatalogProduct[],
    pool: CatalogProduct[],
    ctx: ShortlistContext,
    args: SelectConceptArgs,
  ): CatalogProduct[] {
    const title = ctx.conceptTitle;
    // По теме ЗАГОЛОВКА (не composition идеатора): для «Тёплые воспоминания» composition мог
    // упоминать блокнот/ручку (office), из-за чего ручка ошибочно считалась «в теме». Пользователь
    // жалуется на несоответствие НАЗВАНИЯ составу — сверяем именно с названием.
    const cohOf = (p: CatalogProduct) => scoreConceptCoherence(p, title, undefined);
    // Тема выражена, только если ХОТЯ БЫ один товар пула даёт ненулевой coherence по этой теме.
    const themedPool = pool.some((p) => cohOf(p) > 0);
    if (!themedPool) return set;
    const need = Math.max(1, Math.ceil(set.length / 2));
    if (set.filter((p) => cohOf(p) > 0).length >= need) return set;

    const relCtx = buildBriefRelevanceContext(args.brief, args.brandColors);
    const mandatory = expandMandatorySet(args.mandatoryTypes);
    const cap = args.budgetPerSet ?? 0;
    let next = set.slice();
    const guard = need + 1;
    for (let it = 0; it < guard && next.filter((p) => cohOf(p) > 0).length < need; it++) {
      const setIds = new Set(next.map((p) => p.id));
      const outIdx = next
        .map((p, i) => ({ p, i }))
        .filter((x) => !mandatory.has(detectConceptProductType(x.p)) && cohOf(x.p) <= 0)
        .sort(
          (a, b) =>
            cohOf(a.p) - cohOf(b.p) ||
            scoreBriefRelevanceWithContext(a.p, relCtx) - scoreBriefRelevanceWithContext(b.p, relCtx),
        )[0]?.i;
      if (outIdx == null) break;
      const outP = next[outIdx];
      const rest = next.filter((_, j) => j !== outIdx);
      const usedCats = new Set(rest.map((p) => p.category).filter(Boolean));
      const usedFams = new Set(rest.map((p) => familyForType(detectConceptProductType(p))));
      const totalWithout = rest.reduce((s, x) => s + (x.price ?? 0), 0);
      const repl = pool
        .filter((p) => !setIds.has(p.id) && args.ledger.canUse(p) && cohOf(p) > 0)
        .filter((p) => !usedCats.has(p.category) && !usedFams.has(familyForType(detectConceptProductType(p))))
        .filter((p) => cap <= 0 || totalWithout + (p.price ?? 0) <= cap)
        .filter((p) => scoreBriefRelevanceWithContext(p, relCtx) >= -20)
        .sort((a, b) => scoreBriefRelevanceWithContext(b, relCtx) - scoreBriefRelevanceWithContext(a, relCtx))[0];
      if (!repl) break; // нет on-theme замены — набор не роняем
      next = next.slice();
      next[outIdx] = repl;
      args.ledger.release(outP);
      args.ledger.reserve(repl);
      this.logger.log(`Title coherence: ${outP.name.slice(0, 20)} → ${repl.name.slice(0, 24)} (в теме «${(title ?? '').slice(0, 18)}»)`);
    }
    return next;
  }

  /**
   * #2 КВОТА ПАЛИТРЫ: ≥ceil(min×0.5) цвето-критичных позиций должны быть в ФИРМЕННОМ цвете.
   * Свопает худшую по релевантности не-mandatory цвето-критичную позицию НЕ в палитре на
   * палитровый аналог из пула (тот же тип ИЛИ новая категория/семейство, в рамках cap).
   */
  private enforceBrandPaletteQuota(
    set: CatalogProduct[],
    pool: CatalogProduct[],
    _ctx: ShortlistContext,
    args: SelectConceptArgs,
  ): CatalogProduct[] {
    const brand = args.brandColors ?? [];
    if (!brand.length || set.length === 0) return set;
    if (set.filter((p) => isColorCriticalProduct(p)).length === 0) return set; // красить нечего
    const required = Math.max(1, Math.ceil(Math.min(set.length, Math.max(1, args.minItems)) * 0.5));
    const inPalette = (p: CatalogProduct) => matchesBrandColors(p, brand);
    if (set.filter(inPalette).length >= required) return set;

    const relCtx = buildBriefRelevanceContext(args.brief, brand);
    const mandatory = expandMandatorySet(args.mandatoryTypes);
    const cap = args.budgetPerSet ?? 0;
    let next = set.slice();
    const guard = required + 2;
    for (let it = 0; it < guard && next.filter(inPalette).length < required; it++) {
      const setIds = new Set(next.map((p) => p.id));
      const outIdx = next
        .map((p, i) => ({ p, i }))
        .filter(
          (x) =>
            !mandatory.has(detectConceptProductType(x.p)) &&
            isColorCriticalProduct(x.p) &&
            !inPalette(x.p),
        )
        .sort((a, b) => scoreBriefRelevanceWithContext(a.p, relCtx) - scoreBriefRelevanceWithContext(b.p, relCtx))[0]?.i;
      if (outIdx == null) break;
      const outP = next[outIdx];
      const rest = next.filter((_, j) => j !== outIdx);
      const usedCats = new Set(rest.map((p) => p.category).filter(Boolean));
      const usedFams = new Set(rest.map((p) => familyForType(detectConceptProductType(p))));
      const totalWithout = rest.reduce((s, x) => s + (x.price ?? 0), 0);
      const outType = detectConceptProductType(outP);
      const repl = pool
        .filter((p) => !setIds.has(p.id) && args.ledger.canUse(p) && inPalette(p))
        .filter((p) => cap <= 0 || totalWithout + (p.price ?? 0) <= cap)
        .filter(
          (p) =>
            detectConceptProductType(p) === outType ||
            (!usedCats.has(p.category) && !usedFams.has(familyForType(detectConceptProductType(p)))),
        )
        .sort((a, b) => scoreBriefRelevanceWithContext(b, relCtx) - scoreBriefRelevanceWithContext(a, relCtx))[0];
      if (!repl) break;
      next = next.slice();
      next[outIdx] = repl;
      args.ledger.release(outP);
      args.ledger.reserve(repl);
      this.logger.log(`Palette quota: ${outP.name.slice(0, 22)} → ${repl.name.slice(0, 26)} (фирм. цвет)`);
    }
    return next;
  }

  /** Заменяет/выбрасывает единственную ЯВНО off-theme позицию набора (rel < floor). */
  private trimOffTheme(
    set: CatalogProduct[],
    pool: CatalogProduct[],
    _ctx: ShortlistContext,
    args: SelectConceptArgs,
  ): CatalogProduct[] {
    // Флор — реальный minItems запроса, не хардкод 3: набор с minItems=5 не должен урониться до 4.
    const floor = Math.max(1, args.minItems);
    if (set.length <= floor) return set; // нет запаса на дроп без замены — не роняем ниже floor
    const relCtx = buildBriefRelevanceContext(args.brief, args.brandColors);
    const mandatory = expandMandatorySet(args.mandatoryTypes);
    const OFF_FLOOR = -20; // ниже — «явно не по брифу» (reject-правила дают −120…−220)
    const scored = set.map((p, i) => ({
      p, i,
      rel: scoreBriefRelevanceWithContext(p, relCtx),
      mand: mandatory.has(detectConceptProductType(p)),
    }));
    const worst = scored.filter((s) => !s.mand).sort((a, b) => a.rel - b.rel)[0];
    if (!worst || worst.rel >= OFF_FLOOR) return set; // ничего явно off-theme — не трогаем
    const setIds = new Set(set.map((p) => p.id));
    const rest = set.filter((_, j) => j !== worst.i);
    const usedCats = new Set(rest.map((p) => p.category).filter(Boolean));
    const usedFams = new Set(rest.map((p) => familyForType(detectConceptProductType(p))));
    const cap = args.budgetPerSet ?? 0;
    const totalWithout = rest.reduce((s, x) => s + (x.price ?? 0), 0);
    // Замена: лучший on-theme из пула (rel заметно выше worst), не дубль кат/семейства, в cap.
    const repl = pool
      .filter((p) => !setIds.has(p.id) && args.ledger.canUse(p))
      .filter((p) => !usedCats.has(p.category) && !usedFams.has(familyForType(detectConceptProductType(p))))
      .filter((p) => cap <= 0 || totalWithout + (p.price ?? 0) <= cap)
      .map((p) => ({ p, rel: scoreBriefRelevanceWithContext(p, relCtx) }))
      .filter((x) => x.rel >= 0 && x.rel > worst.rel + 30)
      .sort((a, b) => b.rel - a.rel)[0];
    if (repl) {
      const next = set.slice();
      next[worst.i] = repl.p;
      args.ledger.release(worst.p);
      args.ledger.reserve(repl.p);
      this.logger.log(`Off-theme trim: ${worst.p.name.slice(0, 24)} (rel ${worst.rel}) → ${repl.p.name.slice(0, 28)} (rel ${Math.round(repl.rel)})`);
      return next;
    }
    if (set.length > floor) {
      args.ledger.release(worst.p);
      this.logger.log(`Off-theme drop: ${worst.p.name.slice(0, 28)} (rel ${worst.rel})`);
      return rest;
    }
    return set;
  }

  /** Гарантирует ≥1 профессиональную «якорную» позицию (namePositive архетипа) в наборе. */
  private ensureProfessionHero(
    set: CatalogProduct[],
    pool: CatalogProduct[],
    ctx: ShortlistContext,
    args: SelectConceptArgs,
  ): CatalogProduct[] {
    const np = ctx.archetype?.namePositive;
    if (!np || set.length < 3) return set;
    const nameOf = (p: CatalogProduct) => `${p.name} ${p.description ?? ''}`;
    if (set.some((p) => np.test(nameOf(p)))) return set; // якорь уже есть
    const cap = args.budgetPerSet ?? 0;
    const setIds = new Set(set.map((p) => p.id));
    const mandatory = expandMandatorySet(args.mandatoryTypes);
    const usedCats = new Set(set.map((p) => p.category).filter(Boolean));
    const usedFams = new Set(set.map((p) => familyForType(detectConceptProductType(p))));
    const relCtx = buildBriefRelevanceContext(args.brief, args.brandColors);
    // кандидаты-герои: namePositive, не в наборе, валидны, достойная цена, не дубль кат/семейства.
    const heroes = pool
      .filter((p) => !setIds.has(p.id) && np.test(nameOf(p)))
      .filter((p) => (p.price ?? 0) >= Math.max(150, cap * 0.08) && (p.stockAvailable ?? 0) > 0)
      .filter((p) => args.ledger.canUse(p))
      .filter((p) => !usedCats.has(p.category) && !usedFams.has(familyForType(detectConceptProductType(p))))
      .sort((a, b) => scoreBriefRelevanceWithContext(b, relCtx) - scoreBriefRelevanceWithContext(a, relCtx));
    if (!heroes.length) return set;
    // выбрасываем слабейшую НЕ-mandatory позицию, чей выброс освобождает место под героя в cap.
    const removable = set
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => !mandatory.has(detectConceptProductType(p)))
      .sort((a, b) => scoreBriefRelevanceWithContext(a.p, relCtx) - scoreBriefRelevanceWithContext(b.p, relCtx));
    for (const { p: weak, i } of removable) {
      const rest = set.filter((_, j) => j !== i);
      const totalWithout = set.reduce((s, x, j) => s + (j === i ? 0 : x.price ?? 0), 0);
      // hero не должен создавать функциональный дубль с остатком набора (зонт+дождевик, две
      // зарядки) — composition-opt такое не пропустил бы, а hero идёт последним и раньше не проверял.
      const hero = heroes.find(
        (h) => (cap <= 0 || totalWithout + (h.price ?? 0) <= cap) && !isFunctionallyRedundant(h, rest),
      );
      if (!hero) continue;
      const next = set.slice();
      next[i] = hero;
      args.ledger.release(weak);
      args.ledger.reserve(hero);
      this.logger.log(`Profession-hero: ${weak.name.slice(0, 24)} → ${hero.name.slice(0, 30)} (архетип ${ctx.archetype?.id})`);
      return next;
    }
    return set;
  }
}

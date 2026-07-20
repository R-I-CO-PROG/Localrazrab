import type { CatalogProduct } from './catalog.util';
import { filterCatalogByBlacklist } from './catalog.util';
import { filterOutForbidden } from './catalog-forbidden-match.util';
import {
  filterCatalogByBriefBuckets,
  normalizeBriefAllowedBuckets,
  productMatchesAllowedBucket,
} from '../../catalog/brief-category-buckets.util';
import { reconcileBriefConstraints } from '../../requests/brief-constraints.util';
import { resolveBudgetPerSet, maxUnitPriceForSet } from './set-budget.util';
import {
  detectConceptProductType,
  detectMandatoryConceptTypesFromBrief,
  mandatoryTypeAliases,
} from './concept-diversity.util';
import { scoreBrandColorMatch, ensureBriefColorProducts } from './catalog-color-match.util';
import {
  filterCatalogByNameConstraints,
  ensureMandatoryBriefProducts,
} from './catalog-name-match.util';
import { reserveMandatoryCandidates } from './mandatory-type-load.util';
import { scoreBriefRelevance } from './catalog-brief-relevance.util';
import {
  extractProjectBriefProfile,
  scoreAllowedItemSoftMatch,
  scoreProjectCategorySoftMatch,
} from './project-brief-profile.util';
import {
  averageItemCount,
  resolveProductCountBounds,
} from './product-count-bounds.util';
import { normalizeCatalogProduct } from './product-normalization.util';
import { yieldEventLoop } from '../../common/yield-event-loop';
import { hasValidProductImage, isLowRelevanceJunk } from '../../concept/selection-constraints';
import { isCorporateSetFiller } from '../../concept/product-role.util';
import { buildBriefRelevanceContext, scoreBriefRelevanceWithContext } from './catalog-brief-relevance.util';

export function resolveTargetItemCount(input: CatalogFilterInput): number {
  return averageItemCount(
    resolveProductCountBounds({
      userPrompt: input.userPrompt,
      setItemCount: input.setItemCount,
      useProductCountLimit: input.useProductCountLimit,
      minProductsPerSet: input.minProductsPerSet,
      maxProductsPerSet: input.maxProductsPerSet,
    }),
  );
}

export interface CatalogFilterInput {
  userPrompt: string;
  projectCategory?: string | null;
  quantity?: number | null;
  budgetMin?: number | null;
  budgetMax?: number | null;
  /** Лимит стоимости одного набора, ₽ */
  budgetPerSet?: number | null;
  setItemCount?: number | null;
  useProductCountLimit?: boolean;
  minProductsPerSet?: number | null;
  maxProductsPerSet?: number | null;
  colors: string[];
  allowedItems: string[];
  forbiddenItems: string[];
  blacklistedProductIds?: string[];
  blacklistedSupplierIds?: string[];
  /**
   * Seed воспроизводимого ретривала. Задан → один и тот же бриф даёт один и тот же пул
   * (стабильные результаты, сравнение прогонов). Не задан → случайный ретривал (разнообразие).
   */
  retrievalSeed?: number | null;
}

const BRIEF_KEYWORDS = [
  'кружк',
  'чаш',
  'стакан',
  'ручк',
  'блокнот',
  'ежедневник',
  'термос',
  'бутыл',
  'сумк',
  'рюкзак',
  'шоппер',
  'футболк',
  'худи',
  'кепк',
  'очк',
  'панам',
  'powerbank',
  'заряд',
  'флеш',
  'usb',
  'welcome',
  'it',
  'tech',
  'эко',
  'eco',
  'премиум',
  'vip',
  'event',
  'конферен',
  'офис',
  'спорт',
  'зонт',
  'часы',
  'набор',
  'подар',
];

function normalizeText(text: unknown): string {
  return String(text ?? '').toLowerCase().replace(/ё/g, 'е');
}

function keywordScore(product: CatalogProduct, userPrompt: string): number {
  const name = normalizeText(product.name);
  const description = normalizeText(product.description ?? '');
  const categoryPath = normalizeText(product.subcategory ?? product.category ?? '');
  let score = 0;
  for (const kw of BRIEF_KEYWORDS) {
    if (
      normalizeText(userPrompt).includes(kw) &&
      (name.includes(kw) || description.includes(kw) || categoryPath.includes(kw))
    ) {
      score += 5;
    }
  }
  const tokens = normalizeText(userPrompt)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 4);
  for (const token of tokens) {
    if (name.includes(token)) score += 6;
    if (description.includes(token)) score += 1;
    if (categoryPath.includes(token)) score += 3;
  }
  return score;
}

export function scoreProductForBrief(product: CatalogProduct, input: CatalogFilterInput): number {
  let score = keywordScore(product, input.userPrompt);

  if (isCorporateSetFiller(product, input.userPrompt)) score -= 280;

  const profile = extractProjectBriefProfile({
    userPrompt: input.userPrompt,
    projectCategory: input.projectCategory,
    colors: input.colors,
    allowedItems: input.allowedItems,
    forbiddenItems: input.forbiddenItems,
  });

  const productType = detectConceptProductType(product);
  const mandatoryTypes = detectMandatoryConceptTypesFromBrief(input.userPrompt);
  if (mandatoryTypes.includes(productType)) score += 28;

  score += scoreBriefRelevance(product, input.userPrompt, input.colors);
  const colorBoost = input.colors?.length ? 4.5 : 1;
  score += scoreBrandColorMatch(product, input.colors) * colorBoost;
  score += scoreAllowedItemSoftMatch(
    product.name,
    product.description ?? '',
    profile.preferredCategories,
  );
  score += scoreProjectCategorySoftMatch(productType, input.projectCategory);

  const meta = normalizeCatalogProduct(product);
  if (profile.positioning === 'premium' && meta.priceTier === 'premium') score += 10;
  if (profile.positioning === 'premium' && meta.priceTier === 'budget') score -= 12;
  if (profile.seasonality === 'summer' && meta.isOutdoor) score += 8;
  if (profile.seasonality === 'winter' && meta.seasonality.includes('winter')) score += 8;

  const budgetPerSet =
    input.budgetPerSet ?? resolveBudgetPerSet(input.budgetMin, input.budgetMax);
  const itemCount = resolveTargetItemCount(input);

  if (budgetPerSet != null && budgetPerSet > 0) {
    if (product.price != null && product.price > 0) {
      if (product.price <= budgetPerSet) score += 5;
      else score -= 25;
      const avgSlot = Math.floor(budgetPerSet / itemCount);
      if (product.price <= avgSlot) score += 4;
      else if (product.price > avgSlot * 1.5) score -= 8;
    }
  } else {
    const maxPrice = input.budgetMax ?? input.budgetMin;
    if (maxPrice != null && product.price != null && product.price > 0) {
      if (product.price <= maxPrice) score += 5;
      else score -= 20;
    }
  }

  if (input.quantity != null && input.quantity > 0 && (product.stockAvailable ?? 0) > 0) {
    if ((product.stockAvailable ?? 0) >= input.quantity) score += 8;
    else score -= 15;
  }

  if ((product.stockAvailable ?? 0) > 500) score += 2;

  return score;
}

/**
 * Пороги тематической релевантности для strict-гейта. Вынесены из тела фильтра, чтобы
 * магические числа были в одном месте: tech-режим строгий (мерч не должен разбавляться
 * текстилем), eco умеренный, зимний уют/VIP мягкий, остальное — почти всё пропускаем.
 */
export const RELEVANCE_MIN_SCORE = {
  junkFloor: -70,
  tech: 75,
  eco: 38,
  softFloor: -20,
  default: -40,
} as const;

/** Жёсткие фильтры: категории, бюджет на позицию, остатки под тираж */
export function filterCatalogForRequest(
  catalog: CatalogProduct[],
  input: CatalogFilterInput,
): CatalogProduct[] {
  const logStage = (stage: string, count: number) => {
    if (count < 20) {
      console.warn(`[catalog-filter] pool ${count} after ${stage}`);
    }
  };

  const MIN_POOL = 20;

  catalog = catalog.filter((p) => {
    // Фикс-порога цены (было <50 ₽) больше НЕТ: дешёвые товары (значки, стикеры,
    // эконом-ручки) — легитимная часть наборов. От копеечного мусора защищает
    // junk-гейт <20 ₽ ниже и минимальная цена, выводимая из бюджета набора.
    if (isCorporateSetFiller(p, input.userPrompt)) return false;
    const type = detectConceptProductType(p);
    if (type === 'packaging' || type === 'cleaning_cloth' || type === 'towel') return false;
    const hay = normalizeText(`${p.name} ${p.description ?? ''} ${p.category ?? ''}`);
    if (/мешоч|салфетк|гостев\w*\s+полотен|войлок|микрофибр|упаковочн/i.test(hay)) return false;
    return true;
  });

  const budgetPerSetEarly =
    input.budgetPerSet ?? resolveBudgetPerSet(input.budgetMin, input.budgetMax);
  const itemCountEarly = resolveTargetItemCount(input);
  if (budgetPerSetEarly != null && budgetPerSetEarly > 0 && itemCountEarly > 0) {
    const budgetFloor = input.budgetMin ?? Math.round(budgetPerSetEarly * 0.6);
    const minUnitPrice = Math.max(
      budgetPerSetEarly < 1200 ? 60 : 80,
      Math.floor((budgetFloor / itemCountEarly) * (budgetPerSetEarly < 1200 ? 0.45 : 0.55)),
    );
    const priced = catalog.filter((p) => (p.price ?? 0) <= 0 || (p.price ?? 0) >= minUnitPrice);
    if (priced.length >= 20) catalog = priced;
  }

  const { allowedItems, forbiddenItems } = reconcileBriefConstraints(
    input.userPrompt,
    input.allowedItems,
    input.forbiddenItems,
  );

  const junkFiltered = catalog.filter((p) => {
    if ((p.price ?? 0) > 0 && (p.price ?? 0) < 20) return false;
    if ((p.name?.trim().length ?? 0) < 5) return false;
    // Некатегоризированный мусор каталога — не показываем в подборе
    if (p.category === '❓ Требует категории') return false;
    return true;
  });
  const baseCatalog = junkFiltered.length > 0 ? junkFiltered : catalog;

  let filtered = filterCatalogByBriefBuckets(baseCatalog, allowedItems, forbiddenItems);
  logStage('buckets', filtered.length);
  filtered = filterCatalogByNameConstraints(filtered, allowedItems, forbiddenItems, input.userPrompt);
  logStage('name_constraints', filtered.length);
  if (filtered.length < MIN_POOL) {
    // Пул мал → расширяем, СНИМАЯ whitelist allowedItems, но forbidden (явные запреты
    // пользователя) остаются ХАРД. Раньше здесь сбрасывали forbidden в [] — из-за чего
    // «нельзя пауэр банки» на IT-брифе давало набор из сплошь пауэр банков (прогон 22:04).
    filtered = filterCatalogByNameConstraints(baseCatalog, [], forbiddenItems, input.userPrompt);
    logStage('name_constraints_relaxed_allowed', filtered.length);
  }
  filtered = ensureMandatoryBriefProducts(baseCatalog, filtered, input.userPrompt);
  // Назван цвет — в пуле должны быть товары этого цвета. Иначе скоринг честно даёт золотому
  // товару +72, но выбрать его не может: тематический отбор принёс сувенирку любых цветов.
  // Источник добора — каталог БЕЗ ЗАПРЕЩЁННОГО: иначе «нельзя пауэрбанки» + «цвет синий»
  // втащили бы синий пауэрбанк мимо name-фильтра выше. Whitelist снимаем (это добор, не отбор).
  if ((input.colors ?? []).length) {
    const colorSeedSource = filterCatalogByNameConstraints(baseCatalog, [], forbiddenItems, input.userPrompt);
    filtered = ensureBriefColorProducts(colorSeedSource, filtered, input.colors ?? []);
    logStage('brief_color_seed', filtered.length);
  }
  filtered = filterCatalogByBlacklist(
    filtered,
    input.blacklistedProductIds ?? [],
    input.blacklistedSupplierIds ?? [],
  );

  // ОБЯЗАТЕЛЬНЫЕ типы брифа идут ОТДЕЛЬНЫМ КАНАЛОМ РЕЗЕРВА (reserveMandatoryCandidates в
  // конце функции), а не через льготы `|| isMandatoryType` в каждом гейте. Гейты ниже —
  // чистые: «нужен проектор» при остатке 0–6 или цене выше бюджета всё равно выживет,
  // потому что резерв доливает его после всех фильтров. Один резерв вместо N исключений.
  const tirage = input.quantity ?? 0;
  // НЕДОСТУПНЫЕ ТОВАРЫ (сток явно = 0) отсекаем ВСЕГДА, даже без тиража: 21% каталога имеет
  // stockAvailable=0 и раньше попадал в наборы на брифах без тиража (гейт срабатывал только при
  // tirage>0). null (сток неизвестен) считаем доступным. Гейт мягкий: применяем, только если
  // осталось достаточно (иначе на бедном каталоге не обнулить пул).
  const inStock = filtered.filter((p) => p.stockAvailable == null || p.stockAvailable > 0);
  if (inStock.length >= 8) filtered = inStock;
  if (tirage > 0) {
    const withStock = filtered.filter(
      (p) => p.stockAvailable != null && p.stockAvailable >= tirage,
    );
    if (withStock.length >= 4) filtered = withStock;
  }

  const withPrice = filtered.filter((p) => p.price != null && p.price > 0);
  if (withPrice.length >= 8) filtered = withPrice;

  const withImage = filtered.filter((p) => hasValidProductImage(p));
  if (withImage.length >= 4) filtered = withImage;

  const relevanceCtx = buildBriefRelevanceContext(input.userPrompt, input.colors);
  const fillerFree = filtered.filter((p) => !isCorporateSetFiller(p, input.userPrompt));
  if (fillerFree.length >= MIN_POOL) filtered = fillerFree;

  // IT/хакатон/мерч: ВСЕГДА вырезаем текстиль/банные/упаковку (не откатываемся к «грязному» пулу).
  const needsHardMerchPool =
    relevanceCtx.flags.tech ||
    /мерч|хакатон|hackathon|корпоративн\w*\s+подарк/i.test(normalizeText(input.userPrompt));
  if (needsHardMerchPool) {
    const techHardExclude = (p: CatalogProduct) => {
      if (isCorporateSetFiller(p, input.userPrompt)) return false;
      if (isLowRelevanceJunk(p, input.userPrompt)) return false;
      const hay = normalizeText(
        `${p.name} ${p.description ?? ''} ${p.subcategory ?? ''} ${p.category ?? ''}`,
      );
      return !/банн|туалетн|текстил|полотенц|салфет|мешоч|упаков|гостев|войлок|холодильник|cooler\s*bag|спортивн\w*\s+(?:набор|комплект)|sport\s*set|beginner|микрофибр/i.test(
        hay,
      );
    };
    const techMinPool = Math.max(MIN_POOL, itemCountEarly * 4);
    const techStrict = filtered.filter(
      (p) => techHardExclude(p) && scoreBriefRelevanceWithContext(p, relevanceCtx) > 60,
    );
    const techRelaxed = filtered.filter(
      (p) => techHardExclude(p) && scoreBriefRelevanceWithContext(p, relevanceCtx) > 25,
    );
    const techBare = filtered.filter(techHardExclude);
    if (techStrict.length >= techMinPool) filtered = techStrict;
    else if (techRelaxed.length >= Math.max(12, itemCountEarly * 3)) filtered = techRelaxed;
    else if (techBare.length >= Math.max(8, itemCountEarly * 2)) filtered = techBare;
    else {
      const techRescue = baseCatalog
        .filter(techHardExclude)
        .sort(
          (a, b) =>
            scoreBriefRelevanceWithContext(b, relevanceCtx) -
            scoreBriefRelevanceWithContext(a, relevanceCtx),
        )
        .slice(0, Math.max(MIN_POOL, 80));
      filtered = techRescue.length >= 4 ? techRescue : techBare;
    }
  }

  if (relevanceCtx.flags.eco) {
    const ecoHardExclude = (p: CatalogProduct) => {
      if (isCorporateSetFiller(p, input.userPrompt)) return false;
      return scoreBriefRelevanceWithContext(p, relevanceCtx) > 5;
    };
    const ecoStrict = filtered.filter((p) => ecoHardExclude(p) && scoreBriefRelevanceWithContext(p, relevanceCtx) > 25);
    const ecoRelaxed = filtered.filter(ecoHardExclude);
    if (ecoStrict.length >= MIN_POOL) filtered = ecoStrict;
    else if (ecoRelaxed.length >= 8) filtered = ecoRelaxed;
  }

  const junkFree = filtered.filter(
    (p) => scoreBriefRelevanceWithContext(p, relevanceCtx) > RELEVANCE_MIN_SCORE.junkFloor,
  );
  const strictMinScore = relevanceCtx.flags.tech
    ? RELEVANCE_MIN_SCORE.tech
    : relevanceCtx.flags.eco
      ? RELEVANCE_MIN_SCORE.eco
      : relevanceCtx.flags.cozyWinter || relevanceCtx.flags.jewelryVip
        ? RELEVANCE_MIN_SCORE.softFloor
        : RELEVANCE_MIN_SCORE.default;
  // ЯВНО РАЗРЕШЁННЫЕ брифом категории («можно: электроника, посуда») обходят тематический
  // порог: пользователь прямо их назвал — фильтр не вправе молча вырезать их из-за низкого
  // тематического скора (у tech-режима порог 75, а прямое совпадение категории даёт мало).
  const allowedBuckets = normalizeBriefAllowedBuckets(allowedItems);
  const isExplicitlyAllowed = (p: CatalogProduct): boolean =>
    allowedBuckets.length > 0 &&
    allowedBuckets.some((bucket) => productMatchesAllowedBucket(p, bucket));
  const strictJunkFree = filtered.filter((p) => {
    if (isCorporateSetFiller(p, input.userPrompt)) return false;
    const rel = scoreBriefRelevanceWithContext(p, relevanceCtx);
    // Разрешённая категория обходит ТЕМАТИЧЕСКИЙ порог (tech>75), но НЕ hard-reject:
    // universal_junk (разделочная доска/штопор, −170) и запрещённый цвет (−200) остаются
    // за бортом даже в явно разрешённой категории — их режет junk-порог.
    return (
      rel > strictMinScore ||
      (isExplicitlyAllowed(p) && rel > RELEVANCE_MIN_SCORE.junkFloor)
    );
  });
  if (strictJunkFree.length >= 8) filtered = strictJunkFree;
  else if (junkFree.length >= 8) filtered = junkFree;
  else if (junkFree.length >= MIN_POOL / 2) filtered = junkFree;
  logStage('relevance', filtered.length);

  const budgetPerSet =
    input.budgetPerSet ?? resolveBudgetPerSet(input.budgetMin, input.budgetMax);
  const itemCount = resolveTargetItemCount(input);

  if (budgetPerSet != null && budgetPerSet > 0) {
    const unitCap = maxUnitPriceForSet(budgetPerSet, itemCount);
    const byBudget = filtered.filter((p) => p.price == null || p.price <= budgetPerSet);
    if (byBudget.length >= 8) filtered = byBudget;

    const bySlot = filtered.filter((p) => p.price == null || p.price <= unitCap);
    if (bySlot.length >= 8) filtered = bySlot;
  } else {
    const maxItemPrice = input.budgetMax ?? input.budgetMin;
    if (maxItemPrice != null && maxItemPrice > 0) {
      const byBudget = filtered.filter((p) => p.price == null || p.price <= maxItemPrice);
      if (byBudget.length >= 8) filtered = byBudget;
    }
  }

  // ЕДИНЫЙ КАНАЛ РЕЗЕРВА: после ВСЕХ гейтов гарантируем присутствие каждого обязательного
  // типа брифа (до 8 валидных SKU из baseCatalog). Заменяет и льготы isMandatoryType в
  // гейтах, и точечную страховку missingMandatoryTypes — новые фильтры не должны про них помнить.
  // validBaseCatalog проходит ТОТ ЖЕ blacklist-гейт (товары И поставщики), что и основной
  // фильтр — иначе резерв доливал бы обязательный тип от заблокированного поставщика обратно.
  const validBaseCatalog = filterCatalogByBlacklist(
    baseCatalog.filter((p) => hasValidProductImage(p) && (p.price ?? 0) > 0),
    input.blacklistedProductIds ?? [],
    input.blacklistedSupplierIds ?? [],
  );
  filtered = reserveMandatoryCandidates(
    filtered,
    validBaseCatalog,
    input.userPrompt,
    input.blacklistedProductIds ?? [],
    8,
  );

  // ФИНАЛЬНАЯ ЗАЧИСТКА ЗАПРЕТОВ (P0): запрет пользователя — hard-инвариант пула. Резерв mandatory
  // и fallback тянут из baseCatalog в обход name-гейтов, поэтому в самом конце добиваем свободно-
  // текстовые запреты. Если это обнулит пул (запрет ⊇ весь пул) — оставляем как есть (пусть падёт
  // на fallback ниже), но НЕ возвращаем запрещённое.
  const result = filtered.length > 0 ? filtered : buildCatalogFallback(baseCatalog, input);
  const forbidClean = filterOutForbidden(result, forbiddenItems);
  return forbidClean.length > 0 ? forbidClean : result;
}

/** Не откатываемся к «грязному» baseCatalog — иначе в пул снова попадают мешочки/салфетки. */
function buildCatalogFallback(
  baseCatalog: CatalogProduct[],
  input: CatalogFilterInput,
): CatalogProduct[] {
  const fillerFree = baseCatalog.filter((p) => !isCorporateSetFiller(p, input.userPrompt));
  if (fillerFree.length >= 8) return fillerFree;

  const relevanceCtx = buildBriefRelevanceContext(input.userPrompt, input.colors);
  if (relevanceCtx.flags.tech) {
    const techBare = baseCatalog.filter((p) => {
      if (isCorporateSetFiller(p, input.userPrompt)) return false;
      const hay = normalizeText(
        `${p.name} ${p.description ?? ''} ${p.subcategory ?? ''} ${p.category ?? ''}`,
      );
      return !/банн|туалетн|текстил|полотенц|салфет|мешоч|упаков|гостев|войлок|холодильник|cooler\s*bag|спортивн\w*\s+(?:набор|комплект)|sport\s*set|beginner|микрофибр/i.test(hay);
    });
    if (techBare.length >= 4) return techBare;
    if (techBare.length > 0) return techBare;
    return fillerFree.length > 0 ? fillerFree : [];
  }

  if (fillerFree.length > 0) return fillerFree;

  const withImage = baseCatalog.filter(
    (p) => hasValidProductImage(p) && !isCorporateSetFiller(p, input.userPrompt),
  );
  if (withImage.length >= 4) return withImage.slice(0, Math.min(120, withImage.length));

  return fillerFree;
}

/** Сокращаем каталог до top-N кандидатов для LLM (полный каталог 2000+ SKU) */
export async function shortlistCatalogForLlm(
  catalog: CatalogProduct[],
  input: CatalogFilterInput,
  maxItems = 120,
): Promise<CatalogProduct[]> {
  if (catalog.length <= maxItems) return catalog;

  const scored = catalog
    .map((p) => ({ product: p, score: scoreProductForBrief(p, input) }))
    .sort((a, b) => b.score - a.score || (a.product.price ?? 0) - (b.product.price ?? 0));

  if (catalog.length > 2000) await yieldEventLoop();

  const top = scored.slice(0, maxItems * 2).map((s) => s.product);

  // Разнообразие типов товаров: не более ~15% шортлиста одного типа (ручка, powerbank, кружка…)
  const byType = new Map<string, number>();
  const typeCap = Math.max(5, Math.floor(maxItems * 0.15));
  const diversified: CatalogProduct[] = [];

  for (const p of top) {
    if (diversified.length >= maxItems) break;
    const type = detectConceptProductType(p);
    const n = byType.get(type) ?? 0;
    if (n >= typeCap) continue;
    diversified.push(p);
    byType.set(type, n + 1);
  }

  for (const p of top) {
    if (diversified.length >= maxItems) break;
    if (!diversified.some((x) => x.id === p.id)) diversified.push(p);
  }

  return diversified.slice(0, maxItems);
}

export { estimateSetTotalPrice } from './set-budget.util';

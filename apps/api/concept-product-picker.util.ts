import type { CatalogProduct } from './catalog.util';
import {
  indexCatalogByName,
  isVariantBlocked,
  pickBestColorVariant,
  productVariantKey,
} from './catalog-variant.util';
import {
  ConceptDiversityTracker,
  detectConceptProductType,
  typeConflictsInSet,
} from './concept-diversity.util';
import { indexCatalogByProductType } from './catalog-slot-picker.util';
import { scoreBriefRelevance } from './catalog-brief-relevance.util';
import { scoreBrandColorMatch } from './catalog-color-match.util';
import { hasValidProductImage } from '../../concept/selection-constraints';
import {
  estimateSetTotalPrice,
  targetSpendForSet,
  maxUnitPriceForSet,
} from './set-budget.util';
import type { CatalogFilterInput } from './catalog-filter.util';
import { scoreProductForBrief } from './catalog-filter.util';

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

function tokenize(text: string): string[] {
  return normalizeText(text)
    .split(/[^a-zа-я0-9]+/i)
    .filter((t) => t.length >= 3);
}

/** Нечёткое сопоставление названия от LLM с каталогом */
export function findCatalogMatchForItem(
  item: string,
  catalog: CatalogProduct[],
  blockedIds: Set<string>,
  blockedVariants: Set<string>,
  brandColors: string[] = [],
): CatalogProduct | null {
  const query = normalizeText(item);
  if (!query) return null;

  const byName = indexCatalogByName(catalog);
  const exact = (byName.get(query) ?? []).filter(
    (p) => !isVariantBlocked(p, blockedIds, blockedVariants),
  );
  if (exact.length) return pickBestColorVariant(exact, brandColors);

  const queryTokens = tokenize(query);
  let best: { product: CatalogProduct; score: number } | null = null;

  for (const product of catalog) {
    if (isVariantBlocked(product, blockedIds, blockedVariants)) continue;
    const name = normalizeText(product.name);
    const haystack = `${name} ${normalizeText(product.description ?? '')}`;
    let score = 0;

    if (name === query) score += 120;
    else if (name.includes(query) || query.includes(name)) score += 90;

    for (const token of queryTokens) {
      if (haystack.includes(token)) score += 18;
    }

    const nameTokens = tokenize(product.name);
    const overlap = queryTokens.filter((t) => nameTokens.some((n) => n.includes(t) || t.includes(n))).length;
    if (overlap > 0) score += overlap * 12;

    if (score > 0 && (!best || score > best.score)) {
      best = { product, score };
    }
  }

  return best && best.score >= 28 ? best.product : null;
}

const CONCEPT_THEME_KEYWORDS: Array<{ keys: RegExp; productMatch: (text: string) => boolean; weight: number }> = [
  { keys: /tech|it|digital|гаджет|офис|office/i, productMatch: (t) => /powerbank|заряд|флеш|usb|колонк|наушник|tech/i.test(t), weight: 35 },
  { keys: /welcome|онбординг|hr/i, productMatch: (t) => /welcome|блокнот|ручк|ежедневник|шоппер/i.test(t), weight: 30 },
  { keys: /эко|eco|green|природ/i, productMatch: (t) => /эко|бамбук|дерев|текстил|шоппер/i.test(t), weight: 30 },
  { keys: /премиум|premium|vip|luxury/i, productMatch: (t) => /кож|метал|premium|визитниц|термос/i.test(t), weight: 25 },
  { keys: /чай|coffee|кофе|напит/i, productMatch: (t) => /кружк|стакан|термокруж|термос|чайн/i.test(t), weight: 35 },
  { keys: /фестивал|festival|летн|summer|outdoor/i, productMatch: (t) => /футболк|кепк|панам|очк|шоппер|термос|бутылк/i.test(t), weight: 40 },
];

export function scoreProductForConcept(
  product: CatalogProduct,
  conceptTitle: string,
  conceptComposition: string,
  brief: string,
  conceptStyle = '',
  mandatoryTypes: string[] = [],
): number {
  const conceptText = normalizeText(`${conceptTitle} ${conceptComposition} ${conceptStyle}`);
  const briefText = normalizeText(brief);
  const productText = normalizeText(`${product.name} ${product.description ?? ''} ${product.subcategory ?? ''}`);

  let score = (product.stockAvailable ?? 0) * 0.01;

  for (const token of tokenize(conceptText)) {
    if (productText.includes(token)) score += 8;
  }
  for (const token of tokenize(briefText)) {
    if (productText.includes(token)) score += 4;
  }

  for (const theme of CONCEPT_THEME_KEYWORDS) {
    if (theme.keys.test(conceptText) || theme.keys.test(briefText)) {
      if (theme.productMatch(productText)) score += theme.weight;
    }
  }

  if (!hasValidProductImage(product)) {
    score -= 60;
  }

  const type = detectConceptProductType(product);
  if (type === 'socks' && !mandatoryTypes.includes('socks')) score -= 60;
  if (type === 'blanket' && !mandatoryTypes.includes('blanket')) score -= 60;

  return score;
}

export function resolveConceptProductSelection(input: {
  llmItems: string[];
  conceptTitle: string;
  conceptComposition: string;
  brief: string;
  catalog: CatalogProduct[];
  desiredCount: number;
  blockedIds: Set<string>;
  blockedVariants: Set<string>;
  brandColors?: string[];
}): CatalogProduct[] {
  const {
    llmItems,
    conceptTitle,
    conceptComposition,
    brief,
    catalog,
    desiredCount,
    blockedIds,
    blockedVariants,
    brandColors = [],
  } = input;

  const picked: CatalogProduct[] = [];
  const localTypes = new Set<string>();
  const localVariants = new Set<string>(blockedVariants);

  for (const item of llmItems) {
    if (typeof item !== 'string' || picked.length >= desiredCount) continue;
    const product = findCatalogMatchForItem(item, catalog, blockedIds, localVariants, brandColors);
    if (!product) continue;
    const type = detectConceptProductType(product);
    const vk = productVariantKey(product);
    if (typeConflictsInSet(localTypes, type) || localVariants.has(vk) || picked.some((p) => p.id === product.id)) continue;
    picked.push(product);
    localTypes.add(type);
    localVariants.add(vk);
  }

  return picked;
}

/** Дозаполняет набор: сначала строго по типам, потом ослабляет лимиты между концепциями — SKU не повторяются */
export function ensureConceptProducts(
  products: CatalogProduct[],
  catalog: CatalogProduct[],
  desiredCount: number,
  context: { title: string; composition: string; brief: string; style?: string },
  blockedIds: Set<string>,
  blockedVariants: Set<string>,
  tracker: ConceptDiversityTracker,
  seed: number,
  recordUsage: boolean,
  scoreFn?: (product: CatalogProduct) => number,
  mandatoryTypes: string[] = [],
): CatalogProduct[] {
  const mandatoryTypesSet = new Set(mandatoryTypes);
  const JUNK_TYPES = new Set([
    'socks',
    'blanket',
    'christmas_decor',
    'car_accessory',
    'keychain',
    'sticker',
    'lanyard',
  ]);
  const result: CatalogProduct[] = [];
  const localTypes = new Set<string>();
  const usedVariants = new Set<string>(blockedVariants);

  const addProduct = (product: CatalogProduct) => {
    const type = detectConceptProductType(product);
    const vk = productVariantKey(product);
    if (blockedIds.has(product.id)) return false;
    if (usedVariants.has(vk)) return false;
    if (result.some((p) => p.id === product.id)) return false;
    if (typeConflictsInSet(localTypes, type)) return false;
    result.push(product);
    localTypes.add(type);
    usedVariants.add(vk);
    return true;
  };

  for (const product of products) {
    addProduct(product);
  }

  const scoreProduct = (p: CatalogProduct): number => {
    let score =
      scoreFn?.(p) ??
      scoreProductForConcept(
        p,
        context.title,
        context.composition,
        context.brief,
        context.style,
        mandatoryTypes,
      );
    const type = detectConceptProductType(p);
    if (type === 'socks' && !mandatoryTypesSet.has('socks')) score -= 60;
    if (type === 'blanket' && !mandatoryTypesSet.has('blanket')) score -= 60;
    return score;
  };

  const JUNK_FILLER_TYPES = new Set([
    'socks',
    'christmas_decor',
    'car_accessory',
    'keychain',
    'sticker',
    'lanyard',
    'fitness',
    'raincoat',
    'notebook',
    'diary',
    'gift_set',
    'cap',
    'bucket_hat',
    'towel',
  ]);

  const cozyBrief = /уют|комфорт|тепл|hygge|зимн|благодарност/i.test(context.brief);
  const premiumBrief = /vip|премиум|premium|luxury|роскошн|ювелир|эксклюзив/i.test(context.brief);
  const techBrief = /it[\s-]|tech|конференц|разработчик/i.test(context.brief);
  const minRelevance = cozyBrief || premiumBrief || techBrief ? -25 : -55;

  const pickFromPool = (
    pool: CatalogProduct[],
    strictCrossConceptTypes: boolean,
  ): boolean => {
    const candidates = pool
      .filter((p) => {
        if (blockedIds.has(p.id) || usedVariants.has(productVariantKey(p))) return false;
        if (result.some((x) => x.id === p.id)) return false;
        const type = detectConceptProductType(p);
        if (scoreBriefRelevance(p, context.brief) < minRelevance) return false;
        if (JUNK_FILLER_TYPES.has(type) && !mandatoryTypesSet.has(type)) return false;
        if (JUNK_TYPES.has(type) && !mandatoryTypesSet.has(type)) return false;
        if (typeConflictsInSet(localTypes, type)) return false;
        if (strictCrossConceptTypes && !tracker.canUseType(type)) return false;
        return true;
      })
      .sort((a, b) => scoreProduct(b) - scoreProduct(a));

    if (!candidates.length) return false;
    const bestScore = scoreProduct(candidates[0]);
    const threshold = bestScore * 0.65;
    let topN = 1;
    for (let i = 1; i < Math.min(6, candidates.length); i++) {
      const s = scoreProduct(candidates[i]);
      if (s >= threshold) topN = i + 1;
      else break;
    }
    const idx = (Math.abs(seed) + result.length * 7) % topN;
    return addProduct(candidates[idx] ?? candidates[0]);
  };

  while (result.length < desiredCount) {
    if (pickFromPool(catalog, true)) continue;
    if (pickFromPool(catalog, false)) continue;
    break;
  }

  if (recordUsage && result.length > 0) {
    tracker.recordConceptTypes(result.map(detectConceptProductType));
  }

  return result.slice(0, desiredCount);
}

export interface UpgradeSetBudgetContext {
  title: string;
  composition: string;
  brief: string;
  style?: string;
  brandColors?: string[];
  filterInput?: CatalogFilterInput;
}

function scoreProductForUpgrade(
  product: CatalogProduct,
  ctx: UpgradeSetBudgetContext,
): number {
  let score = scoreProductForConcept(
    product,
    ctx.title,
    ctx.composition,
    ctx.brief,
    ctx.style,
  );
  score += scoreBriefRelevance(product, ctx.brief, ctx.brandColors ?? []);
  if (ctx.filterInput) score += scoreProductForBrief(product, ctx.filterInput) * 0.5;
  score += scoreBrandColorMatch(product, ctx.brandColors ?? []);
  return score;
}

/** Жадный апгрейд: подтягивает сумму набора к 85% бюджета, не превышая cap */
export function upgradeSetToTargetBudget(
  products: CatalogProduct[],
  catalog: CatalogProduct[],
  perSetBudget: number,
  ctx: UpgradeSetBudgetContext,
  typeIndex?: Map<string, CatalogProduct[]>,
  maxScoreDrop = 6,
): CatalogProduct[] {
  if (!products.length || perSetBudget <= 0) return products;

  const { floor, cap } = targetSpendForSet(perSetBudget);
  if (estimateSetTotalPrice(products) >= floor) return products;

  const index = typeIndex ?? indexCatalogByProductType(catalog);
  let result = [...products];
  const maxIterations = result.length * 12;

  for (let iter = 0; iter < maxIterations && estimateSetTotalPrice(result) < floor; iter++) {
    let best: {
      slotIdx: number;
      replacement: CatalogProduct;
      gain: number;
      efficiency: number;
    } | null = null;

    for (let slotIdx = 0; slotIdx < result.length; slotIdx++) {
      const current = result[slotIdx];
      const currentType = detectConceptProductType(current);
      const currentScore = scoreProductForUpgrade(current, ctx);
      const localTypes = new Set(
        result
          .map((p, i) => (i === slotIdx ? null : detectConceptProductType(p)))
          .filter(Boolean) as string[],
      );

      const pool = index.get(currentType) ?? catalog.filter((p) => detectConceptProductType(p) === currentType);
      const maxUnit = maxUnitPriceForSet(perSetBudget, result.length);

      for (const candidate of pool) {
        if (candidate.id === current.id) continue;
        if (result.some((p, i) => i !== slotIdx && p.id === candidate.id)) continue;
        if (typeConflictsInSet(localTypes, detectConceptProductType(candidate))) continue;
        const candPrice = candidate.price ?? 0;
        const curPrice = current.price ?? 0;
        if (candPrice <= curPrice) continue;
        if (candPrice > maxUnit) continue;

        const newTotal =
          estimateSetTotalPrice(result) - curPrice + candPrice;
        if (newTotal > cap) continue;

        const candScore = scoreProductForUpgrade(candidate, ctx);
        const maxDrop = /vip|премиум|premium|luxury|роскошн/i.test(ctx.brief) ? 12 : maxScoreDrop;
        if (candScore < currentScore - maxDrop) continue;

        const gain = candPrice - curPrice;
        const scoreDrop = Math.max(0, currentScore - candScore);
        const premiumBoost = /vip|премиум|premium|luxury/i.test(ctx.brief) ? candPrice * 0.02 : 0;
        const efficiency = (gain + premiumBoost) / (1 + scoreDrop);

        if (!best || efficiency > best.efficiency) {
          best = { slotIdx, replacement: candidate, gain, efficiency };
        }
      }
    }

    if (!best || best.gain <= 0) break;
    result[best.slotIdx] = best.replacement;
  }

  return result;
}

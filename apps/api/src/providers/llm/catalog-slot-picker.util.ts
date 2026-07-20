import type { CatalogProduct } from './catalog.util';
import { productVariantKey, isVariantBlocked } from './catalog-variant.util';
import {
  detectConceptProductType,
  typeConflictsInSet,
} from './concept-diversity.util';
import { scoreBriefRelevance } from './catalog-brief-relevance.util';
import { scoreBrandColorMatch, isColorCriticalProductType } from './catalog-color-match.util';
import { scoreProductForConcept } from './concept-product-picker.util';
import { scoreProductForBrief, type CatalogFilterInput } from './catalog-filter.util';
import {
  maxUnitPriceForSet,
  scorePriceFit,
  targetPriceForSlot,
} from './set-budget.util';
import { hasValidProductImage } from '../../concept/selection-constraints';
import { productMatchesNamedPosition } from '../../requests/named-positions.util';

function normalizeText(text: unknown): string {
  return String(text ?? '').toLowerCase().replace(/ё/g, 'е');
}

export interface ProductSlot {
  type: string;
  priority: 'must' | 'nice';
  notes?: string;
  /** Оригинальная подпись позиции из брифа (Декантер, Штоф…) */
  positionLabel?: string;
}

export interface SlotPickContext {
  brief: string;
  conceptTitle: string;
  conceptComposition: string;
  conceptStyle?: string;
  brandColors: string[];
  filterInput?: CatalogFilterInput;
  blockedIds: Set<string>;
  blockedVariants: Set<string>;
  seed: number;
  /** Типы из брифа — для штрафов «мусорных» филлеров */
  mandatoryTypes?: string[];
  /** Лимит бюджета одного набора (₽) */
  perSetBudget?: number | null;
  /** Верхняя граница бюджета набора (₽) — для min price floor */
  budgetMax?: number;
  /** Типы всех слотов набора — для распределения бюджета */
  slotTypes?: string[];
  desiredCount?: number;
  /** Не подбирать случайные замены для обязательных слотов */
  strictMandatory?: boolean;
  logMissing?: (message: string) => void;
}

/** Индекс всего каталога по типу товара */
export function indexCatalogByProductType(
  catalog: CatalogProduct[],
): Map<string, CatalogProduct[]> {
  const index = new Map<string, CatalogProduct[]>();
  for (const product of catalog) {
    const type = detectConceptProductType(product);
    const list = index.get(type) ?? [];
    list.push(product);
    index.set(type, list);
  }
  return index;
}

function scoreForSlot(
  product: CatalogProduct,
  slot: ProductSlot,
  ctx: SlotPickContext,
): number {
  let score = scoreBriefRelevance(product, ctx.brief, ctx.brandColors);

  // Минимальная цена: товар дешевле 2% от бюджета или 50₽ — сильный штраф
  const price = product.price ?? 0;
  const budgetMax = ctx.budgetMax ?? ctx.perSetBudget ?? ctx.filterInput?.budgetMax ?? 5000;
  const minPriceFloor = Math.max(50, budgetMax * 0.02);
  if (price > 0 && price < minPriceFloor) {
    score -= 200;
  }

  // Товар без изображения — штраф
  if (!hasValidProductImage(product)) {
    score -= 60;
  }

  score += scoreProductForConcept(
    product,
    ctx.conceptTitle,
    ctx.conceptComposition,
    ctx.brief,
    ctx.conceptStyle,
    ctx.mandatoryTypes ?? [],
  );
  if (ctx.filterInput) {
    score += scoreProductForBrief(product, ctx.filterInput) * 0.5;
  }
  if (slot.notes) {
    const notes = normalizeText(slot.notes);
    const text = `${product.name} ${product.description ?? ''}`.toLowerCase();
    if (notes.split(/\s+/).some((w) => w.length >= 4 && text.includes(w))) score += 20;
  }
  const positionLabel = slot.positionLabel ?? slot.notes;
  if (positionLabel) {
    if (productMatchesNamedPosition(product, positionLabel, slot.type)) score += 80;
    const labelTokens = normalizeText(positionLabel)
      .split(/\s+/)
      .filter((t) => t.length >= 3);
    const nameText = normalizeText(`${product.name} ${product.description ?? ''}`);
    const hits = labelTokens.filter((t) => nameText.includes(t)).length;
    score += hits * 25;
  }
  if (slot.priority === 'must') score += 10;
  const type = detectConceptProductType(product);
  const colorWeight = ctx.brandColors.length
    ? (isColorCriticalProductType(type) ? 4 : 1.5)
    : 1;
  score += scoreBrandColorMatch(product, ctx.brandColors) * colorWeight;
  if (type === 'other') score -= 100;
  if (type === 'keychain') score -= 120;
  if (type === 'socks' && !ctx.mandatoryTypes?.includes('socks')) score -= 60;
  if (type === 'blanket' && !ctx.mandatoryTypes?.includes('blanket')) score -= 60;

  if (ctx.perSetBudget != null && ctx.perSetBudget > 0) {
    const slotTypes =
      ctx.slotTypes?.length
        ? ctx.slotTypes
        : Array.from({ length: Math.max(1, ctx.desiredCount ?? 1) }, () => slot.type);
    const target = targetPriceForSlot(ctx.perSetBudget, slotTypes, slot.type);
    const maxUnit = maxUnitPriceForSet(ctx.perSetBudget, slotTypes.length);
    score += scorePriceFit(price, target, maxUnit);
  }

  return score;
}

export function pickProductForSlot(
  slot: ProductSlot,
  typeIndex: Map<string, CatalogProduct[]>,
  catalog: CatalogProduct[],
  localTypes: Set<string>,
  ctx: SlotPickContext,
): CatalogProduct | null {
  if (typeConflictsInSet(localTypes, slot.type)) return null;

  const pool = typeIndex.get(slot.type) ?? [];
  const searchPool = pool.length
    ? pool
    : catalog.filter((p) => detectConceptProductType(p) === slot.type);
  const candidates = searchPool
    .filter((p) => {
      if (isVariantBlocked(p, ctx.blockedIds, ctx.blockedVariants)) return false;
      if (pool.length && detectConceptProductType(p) !== slot.type) return false;
      if (typeConflictsInSet(localTypes, detectConceptProductType(p))) return false;
      return scoreBriefRelevance(p, ctx.brief, ctx.brandColors) > -80;
    })
    .sort((a, b) => scoreForSlot(b, slot, ctx) - scoreForSlot(a, slot, ctx));

  if (!candidates.length) return null;

  const bestScore = scoreForSlot(candidates[0], slot, ctx);
  const threshold = bestScore * 0.7;
  let topN = 1;
  for (let i = 1; i < Math.min(8, candidates.length); i++) {
    if (scoreForSlot(candidates[i], slot, ctx) >= threshold) topN = i + 1;
    else break;
  }
  const idx = (Math.abs(ctx.seed) + localTypes.size * 11) % topN;
  return candidates[idx] ?? candidates[0];
}

/** Подбор набора по слотам типов из полного каталога */
export function resolveConceptFromSlots(
  slots: ProductSlot[],
  catalog: CatalogProduct[],
  desiredCount: number,
  ctx: SlotPickContext,
  prebuiltTypeIndex?: Map<string, CatalogProduct[]>,
): CatalogProduct[] {
  const typeIndex = prebuiltTypeIndex ?? indexCatalogByProductType(catalog);
  const result: CatalogProduct[] = [];
  const localTypes = new Set<string>();
  const usedVariants = new Set(ctx.blockedVariants);
  const localBlockedIds = new Set(ctx.blockedIds);
  const missingMandatory: string[] = [];

  const ordered = [
    ...slots.filter((s) => s.priority === 'must'),
    ...slots.filter((s) => s.priority !== 'must'),
  ];

  const tryPick = (slot: ProductSlot, seed: number): boolean => {
    const product = pickProductForSlot(slot, typeIndex, catalog, localTypes, {
      ...ctx,
      blockedVariants: usedVariants,
      blockedIds: localBlockedIds,
      seed,
    });
    if (!product) {
      if (slot.priority === 'must') {
        missingMandatory.push(`${slot.type}${slot.positionLabel ? ` (${slot.positionLabel})` : ''}`);
      }
      return false;
    }
    result.push(product);
    localTypes.add(detectConceptProductType(product));
    usedVariants.add(productVariantKey(product));
    localBlockedIds.add(product.id);
    return true;
  };

  for (const slot of ordered) {
    if (result.length >= desiredCount) break;
    tryPick(slot, ctx.seed + result.length);
  }

  if (!ctx.strictMandatory) {
    for (let round = 0; round < 3 && result.length < desiredCount; round++) {
      for (const slot of ordered) {
        if (result.length >= desiredCount) break;
        if (typeConflictsInSet(localTypes, slot.type)) continue;
        tryPick(slot, ctx.seed + result.length * 13 + round * 7);
      }
    }
  }

  if (missingMandatory.length) {
    ctx.logMissing?.(`Missing mandatory slot SKU: ${missingMandatory.join(', ')}`);
  }

  return result.slice(0, desiredCount);
}

export function conceptTypeSignature(slots: ProductSlot[]): string {
  return [...slots.map((s) => s.type)].sort().join('|');
}

/** Первое осмысленное предложение из описания карточки товара (до ~140 симв.). */
function productCardBlurb(p: CatalogProduct): string {
  const raw = (p.description ?? '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  // Берём первое предложение; чистим служебный мусор (артикулы, размеры-таблицы).
  const sentence = raw.split(/(?<=[.!?])\s+/)[0] ?? raw;
  const clean = sentence.replace(/^[-—•\s]+/, '').trim();
  if (clean.length < 8) return '';
  return clean.length > 140 ? `${clean.slice(0, 137).trim()}…` : clean;
}

/**
 * Текст описания по фактически подобранным товарам. Тянет характеристики из карточек
 * (p.description), чтобы «Описание набора» было содержательным, а не голым списком имён.
 */
export function buildCompositionFromProducts(
  products: CatalogProduct[],
  style?: string,
  fallback = '',
): string {
  if (!products.length) return fallback;
  const stylePart = style?.trim() ? ` Стиль: ${style.trim()}.` : '';
  const lines = products
    .map((p) => {
      const blurb = productCardBlurb(p);
      const color = (p.colors ?? [])
        .map((c) => (typeof c === 'string' ? c : (c as { name?: string }).name ?? ''))
        .filter(Boolean)[0];
      const colorPart = color ? ` (${color})` : '';
      return blurb ? `• ${p.name}${colorPart} — ${blurb}` : `• ${p.name}${colorPart}`;
    })
    .join('\n');
  const lead =
    products.length === 1
      ? 'В набор вошёл товар:'
      : `Продуманный набор из ${products.length} позиций:`;
  return `${lead}\n${lines}${stylePart}`;
}

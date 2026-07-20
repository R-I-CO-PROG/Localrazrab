import { defaultItemCount, parseDesiredItemCount } from './parse-desired-count';
import { filterCatalogByBriefBuckets } from '../../catalog/brief-category-buckets.util';
import { filterOutForbidden } from './catalog-forbidden-match.util';
import {
  dedupeProductsByVariant,
  indexCatalogByName,
  pickBestColorVariant,
  productVariantKey,
} from './catalog-variant.util';
import { detectConceptProductType } from './concept-diversity.util';

export interface CatalogColor {
  name: string;
  hex?: string | null;
  code?: string | null;
}

export interface CatalogProduct {
  id: string;
  name: string;
  category: string;
  subcategory?: string | null;
  description?: string | null;
  sourceId?: string | null;
  externalId?: string | null;
  price?: number | null;
  currency?: string | null;
  stockAvailable?: number;
  colors?: CatalogColor[];
  silhouetteImageUrl: string;
  catalogImageUrl?: string | null;
  /** Resolved URL: catalogImageUrl → silhouetteImageUrl */
  imageUrl?: string | null;
  sourceUrl?: string | null;
  /** Габариты (см) для относительного масштаба на визуализации; null — нет данных */
  widthCm?: number | null;
  heightCm?: number | null;
  depthCm?: number | null;
  weightG?: number | null;
  /** Семантический fit к интенту аудитории (cos+ − cos−), проставляется из pgvector. */
  semanticFit?: number | null;
  /** Материал (LLM-тег по каталогу), стем-матчится напрямую в productMatchesMaterial. */
  material?: string | null;
  /** Ключевые характеристики (LLM-тег: soft touch, водостойкий, складной…). */
  characteristics?: string[];
}

export function filterCatalogByBlacklist(
  catalog: CatalogProduct[],
  productIds: string[] = [],
  supplierIds: string[] = [],
): CatalogProduct[] {
  if (!productIds.length && !supplierIds.length) return catalog;
  const blockedProducts = new Set(productIds);
  const blockedSuppliers = new Set(supplierIds);
  const filtered = catalog.filter((p) => {
    if (blockedProducts.has(p.id)) return false;
    if (p.sourceId && blockedSuppliers.has(p.sourceId)) return false;
    return true;
  });
  return filtered.length > 0 ? filtered : catalog;
}

const CLOTHING_NAME_PREFIXES = [
  'Футболка',
  'Поло',
  'Худи',
  'Свитшот',
  'Кепка',
  'Бини',
  'Носки',
];

export function isClothingProductName(name: string): boolean {
  const lower = name.toLowerCase();
  return CLOTHING_NAME_PREFIXES.some((prefix) => lower.startsWith(prefix.toLowerCase()));
}

const CLOTHING_PROMPT_KEYWORDS = [
  'одежд',
  'clothing',
  'apparel',
  'wear',
  'футболк',
  'tshirt',
  't-shirt',
  'худи',
  'hoodie',
  'свитшот',
  'кепк',
  'cap',
  'бини',
  'beanie',
  'поло',
  'polo',
  'носк',
  'шарф',
  'scarf',
  'мерч',
  'merch',
];

export function promptRequestsClothing(userPrompt: string): boolean {
  const text = userPrompt.toLowerCase();
  return CLOTHING_PROMPT_KEYWORDS.some((k) => text.includes(k));
}

const MUG_KEYWORDS = ['кружк', 'стакан', 'термокруж', 'термос', 'бамбуков'];

export function filterCatalogByConstraints(
  catalog: CatalogProduct[],
  allowedItems: string[],
  forbiddenItems: string[],
): CatalogProduct[] {
  const byBuckets = filterCatalogByBriefBuckets(catalog, allowedItems, forbiddenItems);
  // Категорийные бакеты не ловят свободнотекстовые запреты («пауэр банки», «колонки») — добиваем
  // универсальным матчером по имени/категории. Guard от полного обнуления пула широким паттерном.
  const cleaned = filterOutForbidden(byBuckets, forbiddenItems);
  return cleaned.length > 0 ? cleaned : byBuckets;
}

function isMugProduct(name: string): boolean {
  const lower = name.toLowerCase();
  return MUG_KEYWORDS.some((k) => lower.includes(k));
}

export function resolveLlmProductSelection(
  llmItems: string[],
  catalog: CatalogProduct[],
  userProductNames: string[],
  respectUserSelection: boolean,
  desiredCount?: number,
  /** Бриф явно указал число (напр. «1 бутылка») — не дополняем набор */
  strictCount = false,
  options?: {
    excludeVariantKeys?: Set<string>;
    brandColors?: string[];
  },
): CatalogProduct[] {
  const targetCount = desiredCount ?? defaultItemCount('');
  const byName = indexCatalogByName(catalog);
  const excludeVariants = options?.excludeVariantKeys ?? new Set<string>();
  const brandColors = options?.brandColors ?? [];

  if (userProductNames.length > 0) {
    const picked: CatalogProduct[] = [];
    const seenVariants = new Set<string>(excludeVariants);
    for (const name of userProductNames) {
      const candidates = byName.get(name.toLowerCase()) ?? [];
      const available = candidates.filter((p) => !seenVariants.has(productVariantKey(p)));
      if (available.length) {
        const product = pickBestColorVariant(available, brandColors);
        picked.push(product);
        seenVariants.add(productVariantKey(product));
      }
    }
    if (picked.length > 0) return dedupeProductsByVariant(picked).slice(0, targetCount);
  }

  const picked: CatalogProduct[] = [];
  const seenIds = new Set<string>();
  const seenVariants = new Set<string>(excludeVariants);

  for (const item of llmItems) {
    if (typeof item !== 'string') continue;
    const candidates = byName.get(item.trim().toLowerCase()) ?? [];
    const available = candidates.filter(
      (p) => !seenIds.has(p.id) && !seenVariants.has(productVariantKey(p)),
    );
    if (!available.length) continue;
    const product = pickBestColorVariant(available, brandColors);
    picked.push(product);
    seenIds.add(product.id);
    seenVariants.add(productVariantKey(product));
  }

  if (picked.length > 0) {
    let result = dedupeProductsByVariant(picked, excludeVariants);
    if (result.length >= targetCount) return result.slice(0, targetCount);
    if (strictCount) return result;
    const padded = [...result];
    const padVariants = new Set(result.map((p) => productVariantKey(p)));
    const padTypes = new Set(result.map((p) => detectConceptProductType(p)));
    for (const variant of excludeVariants) padVariants.add(variant);
    for (const product of catalog) {
      if (padded.length >= targetCount) break;
      const vk = productVariantKey(product);
      const type = detectConceptProductType(product);
      if (padVariants.has(vk) || padTypes.has(type) || padded.some((x) => x.id === product.id)) continue;
      padded.push(product);
      padVariants.add(vk);
      padTypes.add(type);
    }
    return padded.slice(0, targetCount);
  }

  return pickDefaultProducts(catalog, userProductNames, targetCount, options);
}

export function pickDefaultProducts(
  catalog: CatalogProduct[],
  hintNames: string[] = [],
  count = 4,
  options?: {
    excludeVariantKeys?: Set<string>;
    brandColors?: string[];
  },
): CatalogProduct[] {
  const byName = indexCatalogByName(catalog);
  const excludeVariants = options?.excludeVariantKeys ?? new Set<string>();
  const brandColors = options?.brandColors ?? [];
  const preferred = [
    ...hintNames,
    'Welcome Box',
    'Термокружка',
    'Блокнот A5',
    'Ручка шариковая',
    'Шоппер',
  ];

  const picked: CatalogProduct[] = [];
  const seenVariants = new Set<string>(excludeVariants);

  for (const name of preferred) {
    const candidates = byName.get(name.toLowerCase()) ?? [];
    const available = candidates.filter((p) => !seenVariants.has(productVariantKey(p)));
    if (available.length) {
      const product = pickBestColorVariant(available, brandColors);
      picked.push(product);
      seenVariants.add(productVariantKey(product));
    }
    if (picked.length >= count) break;
  }

  if (picked.length >= count) return picked.slice(0, count);
  for (const product of catalog) {
    const vk = productVariantKey(product);
    if (seenVariants.has(vk)) continue;
    picked.push(product);
    seenVariants.add(vk);
    if (picked.length >= count) break;
  }
  return picked.slice(0, count);
}

type KeywordRule = {
  keys: string[];
  matchName: (nameLower: string) => boolean;
};

const PRODUCT_KEYWORD_RULES: KeywordRule[] = [
  { keys: ['бутыл', 'bottle'], matchName: (n) => n.includes('бутыл') },
  { keys: ['термос', 'thermos'], matchName: (n) => n.includes('термос') },
  { keys: ['кружк', 'кофейн', 'mug', 'cup', 'стакан'], matchName: (n) => isMugProduct(n) },
  { keys: ['ручк', 'pen'], matchName: (n) => n.includes('ручк') },
  { keys: ['блокнот', 'notebook'], matchName: (n) => n.includes('блокнот') },
  { keys: ['шоппер', 'сумк', 'bag'], matchName: (n) => n.includes('шоппер') || n.includes('сумк') },
  { keys: ['powerbank', 'пауэр', 'заряд'], matchName: (n) => n.includes('powerbank') || n.includes('заряд') },
  { keys: ['флеш', 'usb', 'flash'], matchName: (n) => n.includes('флеш') || n.includes('usb') },
  { keys: ['welcome', 'велком'], matchName: (n) => n.includes('welcome') },
  { keys: ['бейдж', 'badge'], matchName: (n) => n.includes('ланьярд') },
  {
    keys: CLOTHING_PROMPT_KEYWORDS,
    matchName: (n) => isClothingProductName(n),
  },
];

function pickByKeywordRules(
  catalog: CatalogProduct[],
  text: string,
  count: number,
): CatalogProduct[] | null {
  for (const rule of PRODUCT_KEYWORD_RULES) {
    if (!rule.keys.some((k) => text.includes(k))) continue;
    const matched = catalog.filter((p) => rule.matchName(p.name.toLowerCase()));
    if (matched.length > 0) return matched.slice(0, count);
  }
  return null;
}

/** Stub: keyword-based pick from catalog when no API key */
export function stubPickProductsFromBrief(
  catalog: CatalogProduct[],
  userPrompt: string,
  category: string,
  desiredCount?: number,
): CatalogProduct[] {
  const count = desiredCount ?? defaultItemCount(userPrompt);
  const text = `${userPrompt} ${category}`.toLowerCase();

  const byKeywords = pickByKeywordRules(catalog, text, count);
  if (byKeywords) return byKeywords;

  if (promptRequestsClothing(userPrompt)) {
    const skater =
      text.includes('скейт') || text.includes('скеит') || text.includes('skater') || text.includes('street');
    const preferred = skater
      ? ['Футболка базовая', 'Худи', 'Кепка', 'Свитшот', 'Бини']
      : ['Футболка базовая', 'Худи', 'Кепка', 'Поло', 'Свитшот', 'Носки', 'Бини'];
    const clothing = pickByPreferredNames(
      catalog.filter((p) => isClothingProductName(p.name)),
      preferred,
      count,
    );
    if (clothing.length > 0) return clothing;
  }

  if (text.includes('кружк') || text.includes('кофейн') || text.includes('mug') || text.includes('cup')) {
    const mugs = catalog.filter((p) => isMugProduct(p.name));
    if (mugs.length >= count) return mugs.slice(0, count);
    if (mugs.length > 0) {
      const extra = catalog.filter((p) => !mugs.includes(p));
      return [...mugs, ...extra].slice(0, count);
    }
  }

  const rules: Array<{ keywords: string[]; names: string[] }> = [
    { keywords: ['welcome', 'онбординг', 'onboarding'], names: ['Welcome Box', 'Блокнот A5', 'Ручка шариковая', 'Термокружка'] },
    { keywords: ['it', 'tech', 'технолог'], names: ['Powerbank 5000 mAh', 'Флешка 32 ГБ', 'Блокнот A5', 'Термокружка'] },
    { keywords: ['эко', 'eco', 'green'], names: ['Шоппер', 'Бамбуковая кружка', 'Блокнот A5', 'Карандаш'] },
    { keywords: ['event', 'мероприят'], names: ['Шоппер', 'Бутылка стеклянная', 'Ланьярд', 'Блокнот A6'] },
    { keywords: ['премиум', 'premium', 'vip', 'роскош'], names: ['Welcome Box', 'Powerbank 10000 mAh', 'Ручка шариковая', 'Термос дорожный'] },
  ];

  const byName = new Map(catalog.map((p) => [p.name.toLowerCase(), p]));
  const seen = new Set<string>();
  const picked: CatalogProduct[] = [];

  for (const rule of rules) {
    if (!rule.keywords.some((k) => text.includes(k))) continue;
    for (const name of rule.names) {
      const product = byName.get(name.toLowerCase());
      if (product && !seen.has(product.id)) {
        picked.push(product);
        seen.add(product.id);
      }
    }
    if (picked.length >= count) return picked.slice(0, count);
  }

  return pickDefaultProducts(catalog, [], count);
}

function pickByPreferredNames(
  catalog: CatalogProduct[],
  names: string[],
  count: number,
): CatalogProduct[] {
  const byName = new Map(catalog.map((p) => [p.name.toLowerCase(), p]));
  const picked: CatalogProduct[] = [];
  const seen = new Set<string>();

  for (const name of names) {
    const product = byName.get(name.toLowerCase());
    if (product && !seen.has(product.id)) {
      picked.push(product);
      seen.add(product.id);
    }
    if (picked.length >= count) return picked.slice(0, count);
  }

  for (const product of catalog) {
    if (picked.length >= count) break;
    if (!seen.has(product.id)) {
      picked.push(product);
      seen.add(product.id);
    }
  }

  return picked.slice(0, count);
}

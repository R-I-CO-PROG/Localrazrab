import type { CatalogProduct } from './catalog.util';
import type { CatalogFilterInput } from './catalog-filter.util';
import { scoreProductForBrief, shortlistCatalogForLlm } from './catalog-filter.util';
import { scoreBrandColorMatch } from './catalog-color-match.util';
import {
  extractAttributesFromText,
  matchProductAttributes,
  formatAttributeMismatch,
  extractColorHintsFromText,
  HINT_COLOR_PATTERNS,
  COLOR_STEM_DISPLAY,
} from './product-attributes.util';

export { extractColorHintsFromText } from './product-attributes.util';
import {
  detectConceptProductType,
  detectMandatoryConceptTypesFromBrief,
} from './concept-diversity.util';
import { productVariantKey } from './catalog-variant.util';

/** Тип товара из hint → slug + паттерны в названии/описании SKU */
const PRODUCT_TYPE_RULES: Array<{
  slug: string;
  hintPatterns: string[];
  skuPatterns: RegExp;
  skuExclude?: RegExp;
}> = [
  {
    slug: 'sunglasses',
    hintPatterns: ['очк', 'sunglass', 'eyewear', 'солнцезащит'],
    skuPatterns: /(?:солнцезащитн?[а-я]*\s*)?очки(?:[а-я]*)?|sunglass|eyewear|солнцезащит/i,
    skuExclude: /кепк|бейсболк|панам|bucket|baseball|головн|сумочк|кошел|планшет/i,
  },
  {
    slug: 'cap',
    hintPatterns: ['кепк', 'бейсболк', 'cap'],
    skuPatterns: /кепк|бейсболк|baseball cap/i,
  },
  {
    slug: 'bucket_hat',
    hintPatterns: ['панам', 'bucket'],
    skuPatterns: /панам|bucket/i,
  },
  {
    slug: 'mug',
    hintPatterns: ['чаш', 'круж', 'cup', 'mug'],
    skuPatterns: /чаш|круж|стакан|mug|cup|термокруж/i,
  },
  {
    slug: 'pen',
    hintPatterns: ['ручк', 'pen'],
    skuPatterns: /ручк|pen|письм/i,
  },
  {
    slug: 'notebook',
    hintPatterns: ['блокнот', 'ежедневник', 'notebook'],
    skuPatterns: /блокнот|ежедневник|notebook|дневник/i,
  },
  {
    slug: 'backpack',
    hintPatterns: ['рюкзак', 'backpack'],
    skuPatterns: /рюкзак|backpack/i,
  },
  {
    slug: 'shopper',
    hintPatterns: ['шоппер', 'сумк', 'bag'],
    skuPatterns: /шоппер|сумк|bag|тоут/i,
  },
  {
    slug: 'thermos',
    hintPatterns: ['термос', 'бутыл', 'flask'],
    skuPatterns: /термос|бутыл|flask|пить/i,
  },
  {
    slug: 'tshirt',
    hintPatterns: ['футбол', 'худи', 'одежд', 'polo', 'оверсайз', 'мерч'],
    skuPatterns: /футбол|худи|polo|одежд|толстов|оверсайз/i,
  },
  {
    slug: 'raincoat',
    hintPatterns: ['дождевик', 'ветровк', 'raincoat'],
    skuPatterns: /дождевик|ветровк|raincoat|poncho/i,
  },
  {
    slug: 'blanket',
    hintPatterns: ['плед', 'полотен'],
    skuPatterns: /плед|полотен|towel|blanket/i,
  },
  {
    slug: 'powerbank',
    hintPatterns: ['powerbank', 'заряд', 'usb'],
    skuPatterns: /powerbank|power bank|заряд|usb|аккумулятор/i,
  },
  {
    slug: 'umbrella',
    hintPatterns: ['зонт'],
    skuPatterns: /зонт|umbrella/i,
  },
];

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/ё/g, 'е');
}

function productSearchText(product: CatalogProduct): string {
  return normalizeText(`${product.name} ${product.description ?? ''} ${product.subcategory ?? ''}`);
}

/** Правила типа товара из hint (чашка → кружки, не ручки) */
export function detectProductTypeRules(hint: string): RegExp[] {
  const t = normalizeText(hint);
  return PRODUCT_TYPE_RULES.filter((rule) =>
    rule.hintPatterns.some((p) => t.includes(p)),
  ).map((rule) => rule.skuPatterns);
}

function productMatchesTypeRule(product: CatalogProduct, rule: (typeof PRODUCT_TYPE_RULES)[number]): boolean {
  const text = productSearchText(product);
  if (!rule.skuPatterns.test(text)) return false;
  if (rule.skuExclude?.test(text)) return false;
  return true;
}

export function productMatchesHintType(product: CatalogProduct, hint: string): boolean {
  const t = normalizeText(hint);
  const rules = PRODUCT_TYPE_RULES.filter((rule) =>
    rule.hintPatterns.some((p) => t.includes(p)),
  );
  if (!rules.length) return true;
  return rules.some((rule) => productMatchesTypeRule(product, rule));
}

/** Типы из hint: brief + правила «добавить товар» (очки → sunglasses) */
export function detectProductTypesFromAddHint(hint: string): string[] {
  const fromBrief = detectMandatoryConceptTypesFromBrief(hint);
  if (fromBrief.length) return fromBrief;

  const t = normalizeText(hint);
  const slugs = PRODUCT_TYPE_RULES.filter((rule) =>
    rule.hintPatterns.some((p) => t.includes(p)),
  ).map((rule) => rule.slug);
  return [...new Set(slugs)];
}

export function hasExplicitProductTypeHint(hint: string): boolean {
  return detectProductTypesFromAddHint(hint).length > 0;
}

/**
 * Главный фильтр «добавить товар»: сначала ТИП/название, не цвет.
 * «очки» → только sunglasses, не кепка с синим цветом.
 */
export function productMatchesAddHint(product: CatalogProduct, hint: string): boolean {
  const types = detectProductTypesFromAddHint(hint);
  if (types.length) {
    return types.includes(detectConceptProductType(product));
  }

  const rules = detectProductTypeRules(hint);
  if (rules.length) {
    return productMatchesHintType(product, hint);
  }

  const tokens = normalizeText(hint)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 3);
  if (!tokens.length) return true;

  const text = productSearchText(product);
  return tokens.some((t) => text.includes(t));
}

/** Цвета: если в hint указан цвет — только он; иначе палитра проекта для мягкого буста */
export function resolveEffectiveAddColors(hint: string, projectColors: string[]): string[] {
  const hintColors = extractColorHintsFromText(hint);
  if (hintColors.length > 0) return hintColors;
  return projectColors.filter(Boolean);
}

function productColorText(product: CatalogProduct): string {
  return (product.colors ?? [])
    .map((c) => (typeof c === 'string' ? c : c.name ?? ''))
    .join(' ')
    .toLowerCase();
}

export function productMatchesHintColors(product: CatalogProduct, hintColorLabels: string[]): boolean {
  if (!hintColorLabels.length) return false;
  const colors = productColorText(product);
  return hintColorLabels.some((label) => colors.includes(label));
}

function scoreForAddHint(
  product: CatalogProduct,
  hint: string,
  base: CatalogFilterInput,
): number {
  if (!productMatchesAddHint(product, hint)) return -500;

  let score = scoreProductForBrief(product, { ...base, userPrompt: hint, allowedItems: [], forbiddenItems: [] });

  const hintNorm = normalizeText(hint);
  const name = normalizeText(product.name);
  if (name.includes(hintNorm) || hintNorm.split(/\s+/).some((t) => t.length >= 3 && name.includes(t))) {
    score += 40;
  }

  // Цвет — вторичный приоритет (мягкий буст, не фильтр)
  score += scoreBrandColorMatch(product, base.colors);

  const hintColors = extractColorHintsFromText(hint);
  if (hintColors.length && productMatchesHintColors(product, hintColors)) {
    score += 15;
  }

  return score;
}

/** Контекст набора для до-подбора: тираж и остаток бюджета (бюджет − уже лежащие товары). */
export interface AddSuggestContext {
  tirage?: number | null;
  remainingBudget?: number | null;
}

/**
 * Локальный top-N. Ярусы (лексикографически): тип → точность атрибутов («5000 мАч») →
 * цвет из запроса → остаток ≥ тираж → цена ≤ остаток бюджета → базовый скор.
 */
export function localSuggestProductsForAdd(
  catalog: CatalogProduct[],
  hint: string,
  input: CatalogFilterInput,
  count: number,
  excludeVariantKeys: Set<string>,
  ctx: AddSuggestContext = {},
): CatalogProduct[] {
  let pool = catalog.filter((p) => !excludeVariantKeys.has(productVariantKey(p)));

  const byHint = pool.filter((p) => productMatchesAddHint(p, hint));
  if (byHint.length > 0) pool = byHint;

  const requestedAttrs = extractAttributesFromText(hint);
  const hintColors = extractColorHintsFromText(hint);
  const tirage = ctx.tirage ?? 0;
  const remaining = ctx.remainingBudget ?? null;

  const scored = pool
    .map((product) => {
      const attrs = matchProductAttributes(requestedAttrs, product);
      return {
        product,
        attrExact: attrs.matched.length,
        attrScore: attrs.score,
        colorHit: !hintColors.length || productMatchesHintColors(product, hintColors) ? 1 : 0,
        stockOk: tirage <= 0 || (product.stockAvailable ?? 0) >= tirage ? 1 : 0,
        budgetOk: remaining == null || (product.price ?? 0) <= remaining ? 1 : 0,
        score: scoreForAddHint(product, hint, input),
      };
    })
    .filter((s) => s.score > 0)
    .sort(
      (a, b) =>
        b.attrExact - a.attrExact ||
        b.attrScore - a.attrScore ||
        b.colorHit - a.colorHit ||
        b.stockOk - a.stockOk ||
        b.budgetOk - a.budgetOk ||
        b.score - a.score ||
        (b.product.stockAvailable ?? 0) - (a.product.stockAvailable ?? 0),
    );

  const picked: CatalogProduct[] = [];
  const seenVariants = new Set<string>();

  for (const { product } of scored) {
    const vk = productVariantKey(product);
    if (seenVariants.has(vk)) continue;
    picked.push(product);
    seenVariants.add(vk);
    if (picked.length >= count) break;
  }

  return picked;
}

/** Фильтр только по тиражу — без категорий/запретов из исходного брифа */
export function filterCatalogForProductAdd(
  catalog: CatalogProduct[],
  quantity: number | null | undefined,
): CatalogProduct[] {
  const tirage = quantity ?? 0;
  if (tirage <= 0) return catalog;
  const withStock = catalog.filter((p) => (p.stockAvailable ?? 0) >= tirage);
  return withStock.length > 0 ? withStock : catalog;
}

/** Каталог-кандидаты для LLM: shortlist по hint (тип/название), цвет — мягкий буст */
export async function buildCatalogCandidatesForProductAdd(
  catalog: CatalogProduct[],
  hint: string,
  input: CatalogFilterInput,
  maxItems = 100,
): Promise<CatalogProduct[]> {
  let pool = catalog;

  const byHint = pool.filter((p) => productMatchesAddHint(p, hint));
  if (byHint.length > 0) pool = byHint;

  const slimInput: CatalogFilterInput = {
    ...input,
    userPrompt: hint,
    allowedItems: [],
    forbiddenItems: [],
    budgetMin: null,
    budgetMax: null,
  };

  return await shortlistCatalogForLlm(pool, slimInput, maxItems);
}

export function mergeHintColorsWithBrand(hint: string, brandColors: string[]): string[] {
  return resolveEffectiveAddColors(hint, brandColors);
}

export function parseProductAddReasons(composition: string): string[] {
  if (!composition?.trim()) return [];
  try {
    const parsed = JSON.parse(composition) as unknown;
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string')) return parsed;
  } catch {
    // single reason string
  }
  return [composition];
}

/**
 * Честные пометки отклонений кандидата от запроса и контекста набора:
 * «10000 мАч вместо 5000 мАч», «нет запрошенного цвета (синий)»,
 * «остаток 120 шт при тираже 300», «превышает остаток бюджета на 340 ₽».
 * Пустой список = кандидат полностью соответствует.
 */
export function buildAddSuggestionMismatches(
  product: CatalogProduct,
  hint: string,
  ctx: AddSuggestContext = {},
): string[] {
  const notes: string[] = [];

  const requested = extractAttributesFromText(hint);
  const attrs = matchProductAttributes(requested, product);
  notes.push(...attrs.mismatches.map(formatAttributeMismatch));

  const hintColors = extractColorHintsFromText(hint);
  if (hintColors.length && !productMatchesHintColors(product, hintColors)) {
    const names = hintColors.map((stem) => COLOR_STEM_DISPLAY[stem] ?? stem).join(', ');
    notes.push(`нет запрошенного цвета (${names})`);
  }

  const tirage = ctx.tirage ?? 0;
  const stock = product.stockAvailable ?? 0;
  if (tirage > 0 && stock < tirage) {
    notes.push(`остаток ${stock} шт при тираже ${tirage}`);
  }

  const remaining = ctx.remainingBudget;
  if (remaining != null && (product.price ?? 0) > remaining) {
    notes.push(`превышает остаток бюджета на ${Math.round((product.price ?? 0) - remaining)} ₽`);
  }

  return notes;
}

/**
 * Чистит запрос для SQL-поиска пула: цвета, единицы с числами и голые числа
 * убираются (иначе «синий» тянет тысячи нерелевантных SKU в срез из 800).
 * Если после чистки не осталось ничего — возвращает исходный текст.
 */
export function stripAttributeAndColorWords(text: string): string {
  let out = text;
  for (const attr of extractAttributesFromText(text)) {
    out = out.replace(attr.raw, ' ');
  }
  const words = out.split(/\s+/).filter((w) => {
    const t = normalizeText(w).replace(/[^\p{L}\p{N}]+/gu, '');
    if (!t) return false;
    if (/^\d+$/.test(t)) return false;
    if (HINT_COLOR_PATTERNS.some(({ patterns }) => patterns.some((p) => t.includes(p)))) {
      return false;
    }
    return true;
  });
  const cleaned = words
    .join(' ')
    .replace(/[,;]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length >= 2 ? cleaned : text;
}

/** Причина для UI — без ложных «это очки потому что синие» */
export function buildProductAddReason(
  product: CatalogProduct,
  hint: string,
  llmReason?: string,
): string {
  const name = product.name;
  const hintNorm = normalizeText(hint);
  const type = detectConceptProductType(product);

  if (llmReason && productMatchesAddHint(product, hint) && !/имеет цвет|#([0-9a-f]{3,8})/i.test(llmReason)) {
    return llmReason;
  }

  if (type === 'sunglasses' || /очк/i.test(name)) {
    return `Солнцезащитные очки из каталога — под запрос «${hint.trim()}».`;
  }

  if (name.toLowerCase().includes(hintNorm)) {
    return `Подходит под запрос «${hint.trim()}».`;
  }

  return `Подобрано по запросу «${hint.trim()}» из каталога.`;
}

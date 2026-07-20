import type { CatalogProduct } from './catalog.util';
import { productVariantKey } from './catalog-variant.util';
import {
  detectConceptProductType,
  detectMandatoryConceptTypesFromBrief,
  mandatoryTypeAliases,
  typeConflictsInSet,
} from './concept-diversity.util';
import { hasValidProductImage } from '../../concept/selection-constraints';

const MANDATORY_KEYWORD_MAP: Array<{ re: RegExp; keyword: string; slug: string }> = [
  { re: /термос|термостакан|термокруж/i, keyword: 'термос', slug: 'thermos' },
  { re: /плед/i, keyword: 'плед', slug: 'blanket' },
  { re: /полотен/i, keyword: 'полотенце', slug: 'towel' },
  { re: /кружк/i, keyword: 'кружка', slug: 'mug' },
  { re: /фартук/i, keyword: 'фартук', slug: 'apron' },
  { re: /календар/i, keyword: 'календарь', slug: 'calendar' },
  { re: /декантер/i, keyword: 'декантер', slug: 'decanter' },
  { re: /ступк/i, keyword: 'ступка', slug: 'mortar' },
  { re: /штоф/i, keyword: 'штоф', slug: 'flask' },
  { re: /шейкер/i, keyword: 'шейкер', slug: 'shaker' },
  { re: /проектор/i, keyword: 'проектор', slug: 'projector' },
  { re: /welcome\s*pack/i, keyword: 'welcome pack', slug: 'welcome_pack' },
];

/**
 * Извлекает из брифа конкретные товарные запросы.
 * Возвращает уникальные ключевые фразы (дедуплицированные по корню).
 */
export function extractProductKeywordsFromBrief(brief: string): string[] {
  const keywords: string[] = [];
  const lower = brief.toLowerCase();

  for (const { re, keyword } of MANDATORY_KEYWORD_MAP) {
    if (re.test(lower)) keywords.push(keyword);
  }

  const extractors = [
    /(?:такие?\s+как|например|включая|включить|включает|должн\w*\s+включать|нужн\w*|состоять\s+из)\s+([^.!?\n]{5,150})/gi,
    /обязательн\w*[^.!?]{0,120}/gi,
  ];

  for (const re of extractors) {
    for (const match of lower.matchAll(re)) {
      const content = (match[1] ?? match[0]).trim();
      const parts = content.split(/\s*[,;]\s*|\s+и\s+/);
      for (const part of parts) {
        const clean = part
          .trim()
          .replace(/^(?:элемент\w*|предмет\w*|товар\w*|уютн\w*|обязательн\w*|логотип\w*)\s+/i, '')
          .trim();
        if (clean.length >= 3 && clean.length <= 60) {
          keywords.push(clean);
        }
      }
    }
  }

  const mandatoryTypes = detectMandatoryConceptTypesFromBrief(brief);
  for (const slug of mandatoryTypes) {
    const map = MANDATORY_KEYWORD_MAP.find((m) => m.slug === slug);
    if (map) keywords.unshift(map.keyword);
  }

  const seen = new Set<string>();
  const unique = keywords.filter((k) => {
    const root = k.replace(/[аеёиоуыэюя]{1,4}$/i, '').toLowerCase();
    const key = root.length >= 3 ? root : k.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const mandatoryFirst = unique.filter((k) =>
    MANDATORY_KEYWORD_MAP.some((m) => m.keyword === k || m.re.test(k)),
  );
  const rest = unique.filter((k) => !mandatoryFirst.includes(k));
  return [...mandatoryFirst, ...rest];
}

/**
 * Ищет в каталоге товары по ключевым словам из брифа.
 * Возвращает не больше ОДНОГО товара на keyword,
 * и ВСЕ товары имеют РАЗНЫЕ типы (type families не конфликтуют).
 */
export function findProductsByBriefKeywords(
  keywords: string[],
  catalog: CatalogProduct[],
  blockedIds: Set<string>,
  blockedVariants: Set<string> = new Set(),
): CatalogProduct[] {
  const result: CatalogProduct[] = [];
  const usedTypes = new Set<string>();
  const usedIds = new Set<string>(blockedIds);
  const usedVariants = new Set<string>(blockedVariants);

  for (const keyword of keywords) {
    const tokens = keyword
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length >= 3);
    if (!tokens.length) continue;

    const mandatorySlug = MANDATORY_KEYWORD_MAP.find(
      (m) => m.keyword === keyword || m.re.test(keyword),
    )?.slug;
    const allowedTypes = mandatorySlug ? new Set(mandatoryTypeAliases(mandatorySlug)) : null;

    let bestProduct: CatalogProduct | null = null;
    let bestScore = 0;

    for (const product of catalog) {
      if (usedIds.has(product.id)) continue;
      if (usedVariants.has(productVariantKey(product))) continue;

      const name = (product.name ?? '').toLowerCase();
      const desc =
        `${name} ${product.subcategory ?? ''} ${product.category ?? ''} ${product.description ?? ''}`.toLowerCase();

      let score = 0;
      let nameHits = 0;
      for (const token of tokens) {
        if (name.includes(token)) {
          score += 15;
          nameHits++;
        } else if (desc.includes(token)) {
          score += 5;
        }
      }
      if (nameHits === tokens.length) score += 30;

      if (hasValidProductImage(product)) score += 10;

      const type = detectConceptProductType(product);
      if (allowedTypes && !allowedTypes.has(type)) continue;
      if (score <= 0) continue;
      if (typeConflictsInSet(usedTypes, type)) continue;

      if (score > bestScore) {
        bestScore = score;
        bestProduct = product;
      }
    }

    if (bestProduct) {
      result.push(bestProduct);
      usedIds.add(bestProduct.id);
      usedVariants.add(productVariantKey(bestProduct));
      usedTypes.add(detectConceptProductType(bestProduct));
    }
  }

  return result;
}

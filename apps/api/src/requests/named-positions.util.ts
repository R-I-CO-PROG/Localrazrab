import {
  BRIEF_ALLOWED_CATEGORIES,
  type BriefAllowedCategory,
} from './brief-options';
import { normalizeBriefAllowedBuckets } from '../catalog/brief-category-buckets.util';
import {
  CONCEPT_TYPE_DEFINITIONS,
  CATALOG_IDEATOR_TYPE_SLUGS,
  detectConceptProductType,
  type ConceptTypeDefinition,
} from '../providers/llm/concept-diversity.util';
import type { CatalogProduct } from '../providers/llm/catalog.util';
import {
  extractAttributesFromText,
  extractColorHintsFromText,
  COLOR_STEM_DISPLAY,
  type ProductAttribute,
} from '../providers/llm/product-attributes.util';

/** Явные позиции брифа → slug типа каталога */
export const NAMED_POSITION_SYNONYMS: Array<{
  slug: string;
  labels: RegExp[];
}> = [
  { slug: 'decanter', labels: [/декантер/i, /\bdecanter\b/i] },
  { slug: 'mortar', labels: [/ступк/i, /\bmortar\b/i, /pestle/i] },
  { slug: 'flask', labels: [/штоф/i, /\bflask\b/i, /графин/i, /carafe/i] },
  { slug: 'shaker', labels: [/шейкер/i, /\bshaker\b/i, /коктейльн\w*\s*шейкер/i] },
  { slug: 'projector', labels: [/проектор/i, /\bprojector\b/i] },
  { slug: 'welcome_pack', labels: [/welcome\s*pack/i, /велком\s*пак/i] },
];

export interface NamedPositionEntry {
  label: string;
  typeSlug: string;
}

function normalizeLabel(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

function isCategoryBucket(value: string): value is BriefAllowedCategory {
  return BRIEF_ALLOWED_CATEGORIES.includes(value as BriefAllowedCategory);
}

/** Разделить UI allowedItems на категории-бакеты и именованные позиции */
export function splitAllowedItemsMixed(items: string[]): {
  categories: BriefAllowedCategory[];
  namedItems: string[];
} {
  const categories: string[] = [];
  const namedItems: string[] = [];

  for (const raw of items) {
    const item = normalizeLabel(raw);
    if (!item) continue;
    if (isCategoryBucket(item)) {
      categories.push(item);
      continue;
    }
    const normalized = normalizeBriefAllowedBuckets([item]);
    if (normalized.length > 0) {
      categories.push(...normalized);
      continue;
    }
    namedItems.push(item);
  }

  return {
    categories: [...new Set(categories)] as BriefAllowedCategory[],
    namedItems: [...new Set(namedItems)],
  };
}

function matchNamedPositionLabel(fragment: string): NamedPositionEntry | null {
  const clean = normalizeLabel(fragment);
  if (clean.length < 2) return null;

  for (const entry of NAMED_POSITION_SYNONYMS) {
    if (entry.labels.some((re) => re.test(clean))) {
      return { label: clean, typeSlug: entry.slug };
    }
  }

  for (const def of CONCEPT_TYPE_DEFINITIONS) {
    if (!CATALOG_IDEATOR_TYPE_SLUGS.includes(def.slug)) continue;
    if (def.briefMandatory.some((re) => re.test(clean)) || def.matchProduct(clean)) {
      return { label: clean, typeSlug: def.slug };
    }
  }

  return null;
}

function extractListSegment(text: string): string[] {
  const segments: string[] = [];
  const triggers = [
    /(?:из\s+тех\s+позиц\w*|позици\w*\s*(?:что|котор\w*)\s*(?:я\s*)?(?:назов\w*|перечисл\w*|укаж\w*))[:\s-]*([^.!\n]{5,200})/i,
    /(?:назов\w*|перечисл\w*|укаж\w*)\s*(?:позици\w*|товар\w*)[:\s-]*([^.!\n]{5,200})/i,
    /(?:нужн\w*|обязательн\w*|в\s+набор\w*|включ\w*|состо\w*\s+из|такие?\s+как|например)[:\s-]*([^.!\n]{5,200})/i,
  ];

  for (const re of triggers) {
    const match = text.match(re);
    if (match?.[1]) segments.push(match[1]);
  }

  const quoted = [...text.matchAll(/[«"']([^«"'\n]{2,40})[»"']/g)].map((m) => m[1]);
  segments.push(...quoted);

  const parts: string[] = [];
  for (const segment of segments) {
    for (const chunk of segment.split(/\s*[,;]\s*|\s+и\s+/)) {
      const clean = chunk
        .trim()
        .replace(/^[-–—•*\d.)]+\s*/, '')
        .replace(/\s*(?:и\s+)?(?:ещё|еще|также|а\s+также)\s*$/i, '')
        .trim();
      if (clean.length >= 2 && clean.length <= 50) parts.push(clean);
    }
  }
  return parts;
}

/** Именованные позиции из текста брифа (оригинальные подписи) */
export function parseNamedPositionsFromBrief(text: string): string[] {
  const found: NamedPositionEntry[] = [];
  const seenLabels = new Set<string>();

  for (const fragment of extractListSegment(text)) {
    const matched = matchNamedPositionLabel(fragment);
    if (!matched) continue;
    const key = matched.label.toLowerCase();
    if (seenLabels.has(key)) continue;
    seenLabels.add(key);
    found.push(matched);
  }

  const lower = text.toLowerCase();
  for (const entry of NAMED_POSITION_SYNONYMS) {
    for (const re of entry.labels) {
      if (!re.test(lower)) continue;
      const label = entry.slug.replace(/_/g, ' ');
      const key = label.toLowerCase();
      if (seenLabels.has(key)) continue;
      seenLabels.add(key);
      found.push({ label, typeSlug: entry.slug });
      break;
    }
  }

  for (const def of CONCEPT_TYPE_DEFINITIONS) {
    if (!CATALOG_IDEATOR_TYPE_SLUGS.includes(def.slug)) continue;
    if (!def.briefMandatory.some((re) => re.test(text))) continue;
    const label = def.labelRu;
    const key = label.toLowerCase();
    if (seenLabels.has(key)) continue;
    seenLabels.add(key);
    found.push({ label, typeSlug: def.slug });
  }

  return found.map((f) => f.label);
}

/** Slug типов для именованных позиций (порядок сохраняется, без дублей) */
export function resolveNamedPositionTypes(
  labels: string[],
  brief = '',
): string[] {
  const types: string[] = [];
  const seen = new Set<string>();

  for (const label of labels) {
    const matched = matchNamedPositionLabel(label);
    if (matched && !seen.has(matched.typeSlug)) {
      seen.add(matched.typeSlug);
      types.push(matched.typeSlug);
    }
  }

  if (brief.trim()) {
    for (const fragment of extractListSegment(brief)) {
      const matched = matchNamedPositionLabel(fragment);
      if (matched && !seen.has(matched.typeSlug)) {
        seen.add(matched.typeSlug);
        types.push(matched.typeSlug);
      }
    }
    for (const entry of NAMED_POSITION_SYNONYMS) {
      if (entry.labels.some((re) => re.test(brief)) && !seen.has(entry.slug)) {
        seen.add(entry.slug);
        types.push(entry.slug);
      }
    }
  }

  return types;
}

export function resolveNamedItemsForBrief(
  brief: string,
  uiAllowedItems: string[] = [],
): { namedItems: string[]; namedTypes: string[]; categoryBuckets: BriefAllowedCategory[] } {
  const { categories, namedItems: uiNamed } = splitAllowedItemsMixed(uiAllowedItems);
  const fromBrief = parseNamedPositionsFromBrief(brief);
  const namedItems = [...new Set([...uiNamed, ...fromBrief])];
  const namedTypes = resolveNamedPositionTypes(namedItems, brief);
  return { namedItems, namedTypes, categoryBuckets: categories };
}

export function isDirectedBriefMode(namedTypes: string[]): boolean {
  return namedTypes.length > 0;
}

/**
 * Эксклюзивный режим: набор должен состоять ТОЛЬКО из названных позиций.
 * Только при явных формулировках; «можно / можете предложить / приветствуется»
 * — это разрешённые категории, а НЕ ограничение состава.
 */
export function isExclusiveBriefMode(brief: string, namedTypes: string[]): boolean {
  if (namedTypes.length === 0) return false;
  // \b/\w в JS не работают с кириллицей — границы через [а-яё].
  return /(?<![а-яё])только(?![а-яё])\s+(?:эти|следующ|перечисл|вот\s+эти|из\s+перечисл|из\s+того)|строго\s+(?:по\s+списку|эти|перечисл)|ровно\s+эти|исключительно\s+(?:эти|перечисл)|из\s+тех\s+позиц[а-яё]*\s+(?:что|котор)|нужны\s+именно\s+эти/i.test(
    brief,
  );
}

export function productMatchesNamedPosition(
  product: CatalogProduct,
  label: string,
  typeSlug: string,
): boolean {
  const text = `${product.name ?? ''} ${product.description ?? ''}`.toLowerCase();
  const tokens = label
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 3);
  const nameHits = tokens.filter((t) => text.includes(t)).length;
  if (nameHits >= Math.max(1, tokens.length)) return true;
  return detectConceptProductType(product) === typeSlug;
}

export function namedPositionDefinition(slug: string): ConceptTypeDefinition | undefined {
  return CONCEPT_TYPE_DEFINITIONS.find((d) => d.slug === slug);
}

/** Спецификация именованной позиции: атрибуты («5000 мАч») и цвет самой позиции. */
export interface NamedPositionSpec {
  label: string;
  attributes: ProductAttribute[];
  /** Прилагательные («синий») — совместимы с productMatchesRequestedColorFamily. */
  colors: string[];
}

function mergeSpecFromText(spec: NamedPositionSpec, text: string): void {
  for (const attr of extractAttributesFromText(text)) {
    if (!spec.attributes.some((a) => a.kind === attr.kind)) spec.attributes.push(attr);
  }
  for (const stem of extractColorHintsFromText(text)) {
    const display = COLOR_STEM_DISPLAY[stem] ?? stem;
    if (!spec.colors.includes(display)) spec.colors.push(display);
  }
}

const MODIFIER_FILLER_WORDS = new Set([
  'цвет', 'цвета', 'цветом', 'оттенок', 'оттенка', 'оттенком',
  'на', 'в', 'с', 'до', 'от', 'обязательно', 'желательно', 'лучше',
]);

/**
 * Фрагмент-«хвост» позиции («синий», «синего цвета», «на 5000 мАч»)?
 * Да, если после вычитания атрибутов/цветов/служебных слов ничего не остаётся —
 * тогда модификатор приклеивается к предыдущей позиции списка.
 */
function isPositionModifier(fragment: string): boolean {
  const attrs = extractAttributesFromText(fragment);
  const colorStems = extractColorHintsFromText(fragment);
  if (!attrs.length && !colorStems.length) return false;
  let rest = fragment;
  for (const attr of attrs) rest = rest.replace(attr.raw, ' ');
  const leftover = rest
    .toLowerCase()
    .replace(/ё/g, 'е')
    .split(/[^a-zа-я]+/)
    .filter(Boolean)
    .filter((w) => !colorStems.some((stem) => w.includes(stem)))
    .filter((w) => !MODIFIER_FILLER_WORDS.has(w));
  return leftover.length === 0;
}

/** Первое упоминание типа в тексте (индекс) или -1. */
function typeMentionIndex(text: string, def: ConceptTypeDefinition): number {
  let best = -1;
  for (const re of def.briefMandatory) {
    const m = text.match(re);
    if (m?.index != null && (best < 0 || m.index < best)) best = m.index;
  }
  return best;
}

/**
 * Спецификации именованных позиций из брифа: тип → атрибуты + цвет позиции.
 * Сначала фрагменты списков (модификаторы «, синий» клеятся к предыдущей позиции),
 * затем — окно вокруг упоминания типа в свободном тексте (до конца предложения
 * или до упоминания следующего типа).
 */
export function resolveNamedPositionSpecsForBrief(
  brief: string,
): Record<string, NamedPositionSpec> {
  const specs: Record<string, NamedPositionSpec> = {};
  if (!brief?.trim()) return specs;

  // 1) Фрагменты списков — точная привязка модификаторов к позиции.
  let lastSlug: string | null = null;
  for (const fragment of extractListSegment(brief)) {
    const matched = matchNamedPositionLabel(fragment);
    if (matched) {
      lastSlug = matched.typeSlug;
      const spec =
        specs[lastSlug] ?? { label: matched.label, attributes: [], colors: [] };
      mergeSpecFromText(spec, fragment);
      specs[lastSlug] = spec;
      continue;
    }
    if (lastSlug && isPositionModifier(fragment)) {
      mergeSpecFromText(specs[lastSlug], fragment);
      continue;
    }
    lastSlug = null; // посторонний фрагмент разрывает цепочку модификаторов
  }

  // 2) Позиции вне списочных триггеров — окно вокруг упоминания типа.
  const catalogDefs = CONCEPT_TYPE_DEFINITIONS.filter((d) =>
    CATALOG_IDEATOR_TYPE_SLUGS.includes(d.slug),
  );
  for (const def of catalogDefs) {
    const existing = specs[def.slug];
    if (existing && (existing.attributes.length || existing.colors.length)) continue;
    const start = typeMentionIndex(brief, def);
    if (start < 0) continue;

    let end = brief.length;
    const sentenceEnd = brief.slice(start).search(/[.!?\n]/);
    if (sentenceEnd >= 0) end = Math.min(end, start + sentenceEnd);
    for (const other of catalogDefs) {
      if (other.slug === def.slug) continue;
      const otherIdx = typeMentionIndex(brief, other);
      if (otherIdx > start && otherIdx < end) end = otherIdx;
    }

    const spec =
      existing ?? { label: def.labelRu, attributes: [], colors: [] };
    // ЛИДИРУЮЩИЙ цвет перед типом («белый повербанк»): окно вперёд его не ловит (start = индекс
    // типа). Берём до 2 непосредственно предшествующих слов и мёрджим, ТОЛЬКО если это цвет.
    const precTokens = brief.slice(0, start).trimEnd().split(/\s+/).slice(-2).join(' ');
    if (precTokens && extractColorHintsFromText(precTokens).length) {
      mergeSpecFromText(spec, precTokens);
    }
    mergeSpecFromText(spec, brief.slice(start, end));
    if (spec.attributes.length || spec.colors.length) specs[def.slug] = spec;
  }

  return specs;
}

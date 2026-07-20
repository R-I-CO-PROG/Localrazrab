import type { CatalogProduct } from './catalog.util';

/**
 * Числовые атрибуты позиции из свободного текста («5000 мАч», «300 мл», «32 ГБ»).
 * В БД товаров нет структурированных полей — извлекаем и из запроса, и из
 * name/description SKU, сравниваем численно.
 */
export type ProductAttributeKind =
  | 'capacity_mah'
  | 'volume_ml'
  | 'memory_gb'
  | 'power_w';

export interface ProductAttribute {
  kind: ProductAttributeKind;
  /** Нормализованное значение: мАч, мл, ГБ, Вт (литры → мл, ТБ → ГБ). */
  value: number;
  raw: string;
}

export interface AttributeMismatch {
  kind: ProductAttributeKind;
  requested: number;
  /** Ближайшее значение у SKU; null — атрибут в тексте товара не указан. */
  actual: number | null;
}

export interface AttributeMatchResult {
  matched: ProductAttribute[];
  mismatches: AttributeMismatch[];
  /** ~1 за точный атрибут, 0..0.5 за близкий, 0.25 за неизвестный. */
  score: number;
}

interface UnitPattern {
  kind: ProductAttributeKind;
  re: RegExp;
  /** множитель нормализации значения */
  factor: number;
}

// Порядок важен: «мл» до «л», иначе консервативные ranges не спасут слитные записи.
// Числа: «5 000», «10000», «0,5». Хвостовые lookahead отсекают «мачта», «литровый» ловим.
const UNIT_PATTERNS: UnitPattern[] = [
  {
    kind: 'capacity_mah',
    re: /(\d[\d\s ]*(?:[.,]\d+)?)\s*(?:m\s*ah|ма\s*[·.\-]?\s*ч)(?![a-zа-яё])/gi,
    factor: 1,
  },
  {
    kind: 'volume_ml',
    re: /(\d[\d\s ]*(?:[.,]\d+)?)\s*(?:мл|ml)(?![a-zа-яё])/gi,
    factor: 1,
  },
  {
    kind: 'volume_ml',
    re: /(\d[\d\s ]*(?:[.,]\d+)?)\s*(?:литр[а-яё]*|(?<![a-zа-яё])[лl](?![a-zа-яё]))/gi,
    factor: 1000,
  },
  {
    kind: 'memory_gb',
    re: /(\d[\d\s ]*(?:[.,]\d+)?)\s*(?:тб|tb)(?![a-zа-яё])/gi,
    factor: 1024,
  },
  {
    kind: 'memory_gb',
    re: /(\d[\d\s ]*(?:[.,]\d+)?)\s*(?:гб|gb)(?![a-zа-яё])/gi,
    factor: 1,
  },
  {
    kind: 'power_w',
    re: /(\d[\d\s ]*(?:[.,]\d+)?)\s*(?:вт|ватт[а-яё]*|w)(?![a-zа-яё])/gi,
    factor: 1,
  },
];

function parseAttrNumber(raw: string): number | null {
  const compact = raw.replace(/[\s ]+/g, '');
  // «5.000» / «5,000» — разряды; «0,5» — десятичная дробь.
  const m = compact.match(/^(\d+)(?:[.,](\d+))?$/);
  if (!m) return null;
  const [, whole, frac] = m;
  if (frac == null) return Number(whole);
  if (frac.length === 3) return Number(whole + frac);
  const value = Number(`${whole}.${frac}`);
  return Number.isFinite(value) ? value : null;
}

/** Все числовые атрибуты из свободного текста (запрос менеджера или name+description SKU). */
export function extractAttributesFromText(text: string): ProductAttribute[] {
  if (!text?.trim()) return [];
  const found: ProductAttribute[] = [];
  const consumed: Array<[number, number]> = [];
  const overlaps = (start: number, end: number) =>
    consumed.some(([s, e]) => start < e && end > s);

  for (const { kind, re, factor } of UNIT_PATTERNS) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      if (overlaps(start, end)) continue;
      const parsed = parseAttrNumber(m[1]);
      if (parsed == null || parsed <= 0) continue;
      consumed.push([start, end]);
      found.push({ kind, value: Math.round(parsed * factor), raw: m[0].trim() });
    }
  }
  return found;
}

function productAttributeText(product: CatalogProduct): string {
  return `${product.name ?? ''} ${product.description ?? ''} ${product.subcategory ?? ''}`;
}

/** Точность сравнения: у поставщиков 5000 может быть записано как 5 200 «фактических». */
const EXACT_TOLERANCE = 0.05;

/**
 * Сравнение запрошенных атрибутов с атрибутами SKU.
 * Скоринг на ярус: точный (1) > близкий (0..0.5) > неизвестный (0.25) > далёкий (0).
 */
export function matchProductAttributes(
  requested: ProductAttribute[],
  product: CatalogProduct,
): AttributeMatchResult {
  if (!requested.length) return { matched: [], mismatches: [], score: 0 };

  const actual = extractAttributesFromText(productAttributeText(product));
  const matched: ProductAttribute[] = [];
  const mismatches: AttributeMismatch[] = [];
  let score = 0;

  for (const req of requested) {
    const sameKind = actual.filter((a) => a.kind === req.kind).map((a) => a.value);
    if (!sameKind.length) {
      mismatches.push({ kind: req.kind, requested: req.value, actual: null });
      score += 0.25;
      continue;
    }
    const closest = sameKind.reduce((best, v) =>
      Math.abs(v - req.value) < Math.abs(best - req.value) ? v : best,
    );
    if (Math.abs(closest - req.value) <= req.value * EXACT_TOLERANCE) {
      matched.push(req);
      score += 1;
      continue;
    }
    mismatches.push({ kind: req.kind, requested: req.value, actual: closest });
    score += Math.max(0, 1 - Math.abs(closest - req.value) / req.value) * 0.5;
  }

  return { matched, mismatches, score };
}

/** Цветовые ключевые слова свободного текста (запрос «добавить товар», фрагмент брифа) */
export const HINT_COLOR_PATTERNS: Array<{ label: string; patterns: string[] }> = [
  { label: 'сер', patterns: ['сер', 'grey', 'gray', 'графит', 'graphite'] },
  { label: 'син', patterns: ['син', 'blue', 'navy', 'кобальт'] },
  { label: 'бел', patterns: ['бел', 'white'] },
  { label: 'черн', patterns: ['черн', 'black'] },
  { label: 'красн', patterns: ['красн', 'red'] },
  { label: 'зелен', patterns: ['зелен', 'green'] },
  { label: 'фиолет', patterns: ['фиолет', 'purple', 'violet'] },
  { label: 'желт', patterns: ['желт', 'yellow'] },
  { label: 'оранж', patterns: ['оранж', 'orange'] },
  { label: 'крем', patterns: ['крем', 'beige', 'cream', 'экрю'] },
  { label: 'коричн', patterns: ['коричн', 'brown'] },
];

/** Стем цвета → прилагательное («син» → «синий») для пометок UI и цвето-матчинга */
export const COLOR_STEM_DISPLAY: Record<string, string> = {
  сер: 'серый',
  син: 'синий',
  бел: 'белый',
  черн: 'чёрный',
  красн: 'красный',
  зелен: 'зелёный',
  фиолет: 'фиолетовый',
  желт: 'жёлтый',
  оранж: 'оранжевый',
  крем: 'кремовый',
  коричн: 'коричневый',
};

/** Извлекает упомянутые в тексте цвета (стемы) для приоритета при подборе SKU */
export function extractColorHintsFromText(text: string): string[] {
  const t = (text ?? '').toLowerCase().replace(/ё/g, 'е');
  const found: string[] = [];
  for (const { label, patterns } of HINT_COLOR_PATTERNS) {
    if (patterns.some((p) => t.includes(p))) found.push(label);
  }
  return found;
}

const KIND_LABELS: Record<
  ProductAttributeKind,
  { unit: string; missingPhrase: string }
> = {
  capacity_mah: { unit: 'мАч', missingPhrase: 'ёмкость (мАч) не указана у товара' },
  volume_ml: { unit: 'мл', missingPhrase: 'объём (мл) не указан у товара' },
  memory_gb: { unit: 'ГБ', missingPhrase: 'память (ГБ) не указана у товара' },
  power_w: { unit: 'Вт', missingPhrase: 'мощность (Вт) не указана у товара' },
};

/** Человекочитаемая пометка отклонения для UI («10000 мАч вместо 5000 мАч»). */
export function formatAttributeMismatch(mismatch: AttributeMismatch): string {
  const { unit, missingPhrase } = KIND_LABELS[mismatch.kind];
  if (mismatch.actual == null) return missingPhrase;
  return `${mismatch.actual} ${unit} вместо ${mismatch.requested} ${unit}`;
}

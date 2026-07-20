/**
 * Габариты товара (см) и вес (г) — для правильного ОТНОСИТЕЛЬНОГО масштаба на визуализации:
 * кружка (~10 см) должна быть заметно меньше рюкзака (~45 см), а не наоборот.
 *
 * Источники (build-time парсинг сырых фидов):
 *  - Midocean: <dimensions>27x22x40 см</dimensions>, <net_weight>2.678</net_weight> (кг)
 *  - Oasis: attributes[] {name:"Размер товара (см)", value:"25 х 33 х 4"}, {name:"Вес", value:"1570"} (г)
 *  - Art24: <attr_460_key name="Размер товара">23.5cm/10cm/18cm</attr_460_key>, вес (кг)
 *  - Описания (~12.6%): «Высота 15 см», «Диаметр купола: 110 см», «Размер: 10×20 см»
 */

export interface ProductDimensions {
  widthCm?: number;
  heightCm?: number;
  depthCm?: number;
  weightG?: number;
}

function toNumber(raw: string): number | null {
  const n = Number(raw.replace(',', '.').trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** «мм»/«mm» → см; всё остальное считаем сантиметрами. */
function normalizeToCm(value: number, unitHint: string): number {
  if (/мм|(?<![a-zа-я])mm/i.test(unitHint)) return value / 10;
  return value;
}

/**
 * Парс строки размеров: «27x22x40 см», «25 х 33 х 4», «23.5cm/10cm/18cm», «10×20 см»,
 * «34 x 7 x 7 см». Разделители: x / х / × / *. Возвращает до трёх измерений в см.
 */
export function parseDimensionsString(raw: string): ProductDimensions {
  if (!raw?.trim()) return {};
  const unit = raw;
  // числа с десятичной частью, разделённые x/х/×/*/«/»/слэшем
  const parts = raw
    .replace(/см|cm|мм|mm/gi, ' ')
    .split(/\s*[x×х*/]\s*/i)
    .map((p) => toNumber(p))
    .filter((n): n is number => n != null)
    .map((n) => normalizeToCm(n, unit));

  if (!parts.length) return {};
  const [a, b, c] = parts;
  const out: ProductDimensions = {};
  if (a != null) out.widthCm = round1(a);
  if (b != null) out.heightCm = round1(b);
  if (c != null) out.depthCm = round1(c);
  return out;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Вес → граммы. unit: 'kg' (Midocean/Art24) | 'g' (Oasis) | 'auto' (эвристика). */
export function parseWeightToGrams(raw: string | number, unit: 'kg' | 'g' | 'auto' = 'auto'): number | null {
  const value = typeof raw === 'number' ? raw : toNumber(String(raw));
  if (value == null) return null;
  if (unit === 'kg') return Math.round(value * 1000);
  if (unit === 'g') return Math.round(value);
  // auto: дробное или < 100 → скорее кг (0.148, 2.678); иначе граммы (1570)
  if (value < 100 || !Number.isInteger(value)) return Math.round(value * 1000);
  return Math.round(value);
}

const TEXT_DIM_LABELS: Array<{ re: RegExp; key: keyof ProductDimensions }> = [
  { re: /(?:высот[аеы]|height)\D{0,12}(\d[\d.,]*)\s*см/i, key: 'heightCm' },
  { re: /(?:ширин[аеы]|width)\D{0,12}(\d[\d.,]*)\s*см/i, key: 'widthCm' },
  { re: /(?:длин[аеы]|глубин[аеы]|length|depth)\D{0,12}(\d[\d.,]*)\s*см/i, key: 'depthCm' },
  { re: /(?:диаметр|diameter|ø)\D{0,12}(\d[\d.,]*)\s*см/i, key: 'widthCm' },
];

/** Парс габаритов из свободного текста описания (Высота/Ширина/Диаметр/«Размер: WxH»). */
export function parseDimensionsFromText(text: string): ProductDimensions {
  if (!text?.trim()) return {};
  // Сначала явная строка «Размер (товара): 10 x 20 x 5 см»
  const sizeMatch = text.match(/размер[а-я\s()]*:?\s*(\d[\d.,]*\s*[x×х*/]\s*\d[\d.,]*(?:\s*[x×х*/]\s*\d[\d.,]*)?)\s*см/i);
  if (sizeMatch) {
    const parsed = parseDimensionsString(sizeMatch[1]);
    if (parsed.widthCm) return parsed;
  }
  const out: ProductDimensions = {};
  for (const { re, key } of TEXT_DIM_LABELS) {
    const m = text.match(re);
    if (m) {
      const v = toNumber(m[1]);
      if (v != null && out[key] == null) out[key] = round1(v);
    }
  }
  return out;
}

/** Самое длинное измерение (см) — главный сигнал относительного масштаба. */
export function longestDimensionCm(d: ProductDimensions): number | null {
  const vals = [d.widthCm, d.heightCm, d.depthCm].filter((v): v is number => v != null && v > 0);
  return vals.length ? Math.max(...vals) : null;
}

export function hasDimensions(d: ProductDimensions): boolean {
  return d.widthCm != null || d.heightCm != null || d.depthCm != null;
}

export type SizeClass = 'tiny' | 'small' | 'medium' | 'large' | 'oversized';

/** Класс размера по самому длинному измерению (см). */
export function sizeClassFromCm(cm: number): SizeClass {
  if (cm <= 8) return 'tiny';
  if (cm <= 20) return 'small';
  if (cm <= 40) return 'medium';
  if (cm <= 70) return 'large';
  return 'oversized';
}

/**
 * Типовой размер (самое длинное измерение, см) по типу товара — fallback, когда габаритов
 * в данных нет. Числа — реалистичные ориентиры для правильных пропорций на картинке.
 */
const TYPICAL_LONGEST_CM: Record<string, number> = {
  keychain: 6, pen: 14, sunglasses: 15, mug: 12, flask: 22, thermos: 26, bottle: 25,
  notebook: 21, diary: 21, powerbank: 14, flash: 6, cap: 20, bucket_hat: 30,
  socks: 25, tshirt: 70, hoodie: 75, shopper: 40, bag: 40, backpack: 45,
  umbrella: 90, blanket: 150, towel: 100, apron: 80, projector: 20, speaker: 15,
  raincoat: 70, mortar: 14, decanter: 30, shaker: 25, tea_set: 30, calendar: 30,
  suitcase: 55, multitool: 12, wallet: 12, candle: 12, cup: 12,
};

export function typicalLongestCmForType(typeSlug: string): number | null {
  return TYPICAL_LONGEST_CM[typeSlug] ?? null;
}

export interface ResolvedSize {
  longestCm: number;
  sizeClass: SizeClass;
  source: 'catalog' | 'type';
}

/**
 * Итоговый размер для промпта: реальные габариты каталога → иначе типовой по типу →
 * иначе null (тип неизвестен и данных нет).
 */
export function resolveProductSizeCm(
  dims: ProductDimensions,
  typeSlug: string,
): ResolvedSize | null {
  const fromCatalog = longestDimensionCm(dims);
  if (fromCatalog != null) {
    return { longestCm: fromCatalog, sizeClass: sizeClassFromCm(fromCatalog), source: 'catalog' };
  }
  const typical = typicalLongestCmForType(typeSlug);
  if (typical != null) {
    return { longestCm: typical, sizeClass: sizeClassFromCm(typical), source: 'type' };
  }
  return null;
}

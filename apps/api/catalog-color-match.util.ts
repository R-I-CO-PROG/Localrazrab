import type { CatalogProduct } from './catalog.util';
import { detectConceptProductType } from './concept-diversity.util';
import {
  FORBIDDEN_TONE_BRIGHT,
  FORBIDDEN_TONE_COOL,
  FORBIDDEN_TONE_NEON,
  FORBIDDEN_TONE_WARM,
} from '../../requests/brief-color-palette.util';

const NAME_COLOR_RULES: Array<{ re: RegExp; rgb: [number, number, number]; neutral?: boolean }> = [
  { re: /\bбел\w*|white\b/i, rgb: [245, 245, 245], neutral: true },
  { re: /\bчерн\w*|black\b/i, rgb: [26, 26, 26], neutral: true },
  { re: /\bсер\w*|grey|gray|графит/i, rgb: [156, 163, 175], neutral: true },
  { re: /\bжелт\w*|yellow|золот|gold|янтар|amber|лимон/i, rgb: [251, 191, 36] },
  { re: /\bоранж\w*|orange|мандарин|персик/i, rgb: [249, 115, 22] },
  { re: /\bкрасн\w*|red|бордов|maroon/i, rgb: [239, 68, 68] },
  { re: /\bсин\w*|blue|navy|кобальт|темно-син/i, rgb: [37, 99, 235] },
  { re: /\bголуб\w*|небесн|sky\s*blue|azure|бирюз/i, rgb: [56, 189, 248] },
  { re: /\bзелен\w*|green|изумруд|олив/i, rgb: [34, 197, 94] },
  { re: /\bфиолет\w*|purple|violet|сиренев|лаванд/i, rgb: [124, 92, 252] },
  { re: /\bрозов\w*|pink|фукси/i, rgb: [236, 72, 153] },
  { re: /\bкоричн\w*|brown|шоколад/i, rgb: [146, 64, 14] },
  { re: /\bбеж\w*|beige|крем|экрю|cream/i, rgb: [245, 230, 200], neutral: true },
];

function normalizeText(text: unknown): string {
  return String(text ?? '').toLowerCase().replace(/ё/g, 'е');
}

function normalizeHex(hex: string): string | null {
  const raw = hex.replace('#', '').trim().toLowerCase();
  if (!/^[0-9a-f]{3}([0-9a-f]{3})?$/i.test(raw)) return null;
  const full =
    raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw.padStart(6, '0').slice(0, 6);
  return `#${full}`;
}

function hexToRgb(hex: string): [number, number, number] | null {
  const norm = normalizeHex(hex);
  if (!norm) return null;
  const h = norm.slice(1);
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function colorLabel(color: unknown): string {
  if (typeof color === 'string') return color;
  if (color && typeof color === 'object') {
    const c = color as { name?: unknown; hex?: unknown };
    if (typeof c.name === 'string') return c.name;
    if (typeof c.hex === 'string') return c.hex;
  }
  return '';
}

export function productColorNames(product: CatalogProduct): string[] {
  const fromField = (product.colors ?? []).map(colorLabel).map(normalizeText).filter(Boolean);
  const fromName = normalizeText(product.name);
  return [...fromField, fromName];
}

function isNeutralRgb([r, g, b]: [number, number, number]): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const spread = max - min;
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  return spread < 28 && (lum > 210 || lum < 45);
}

function rgbDistance(a: [number, number, number], b: [number, number, number]): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11);
}

function inferRgbFromText(text: string): [number, number, number] | null {
  for (const rule of NAME_COLOR_RULES) {
    if (rule.re.test(text)) return rule.rgb;
  }
  const hexMatch = text.match(/#([0-9a-f]{3,8})\b/i);
  if (hexMatch) return hexToRgb(`#${hexMatch[1]}`);
  return null;
}

/** Доминирующий RGB товара: hex из каталога или цвет из названия */
export function inferProductRgb(product: CatalogProduct): [number, number, number] | null {
  for (const c of product.colors ?? []) {
    const label = colorLabel(c);
    const fromHex = hexToRgb(label);
    if (fromHex && !isNeutralRgb(fromHex)) return fromHex;
    if (c && typeof c === 'object' && typeof (c as { hex?: string }).hex === 'string') {
      const h = hexToRgb((c as { hex: string }).hex);
      if (h && !isNeutralRgb(h)) return h;
    }
    const fromName = inferRgbFromText(label);
    if (fromName && !isNeutralRgb(fromName)) return fromName;
  }

  const nameRgb = inferRgbFromText(product.name);
  if (nameRgb) return nameRgb;

  const descRgb = inferRgbFromText(product.description ?? '');
  return descRgb;
}

function parseBrandRgbs(brandColors: string[]): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (const color of brandColors) {
    const raw = typeof color === 'string' ? color : (color as { hex?: string }).hex ?? '';
    const rgb = hexToRgb(raw);
    if (rgb) out.push(rgb);
  }
  return out;
}

function minBrandDistance(
  productRgb: [number, number, number],
  brandRgbs: [number, number, number][],
): number {
  let best = Infinity;
  for (const brand of brandRgbs) {
    best = Math.min(best, rgbDistance(productRgb, brand));
  }
  return best;
}

export function isColorCriticalProductType(type: string): boolean {
  return COLOR_CRITICAL_TYPES.has(type);
}

const COLOR_CRITICAL_TYPES = new Set([
  'tshirt',
  'hoodie',
  'cap',
  'bucket_hat',
  'raincoat',
  'shopper',
  'bag',
  'backpack',
  'blanket',
  'umbrella',
  'notebook',
  'mug',
  'bottle',
  'thermos',
]);

export function isColorCriticalProduct(product: CatalogProduct): boolean {
  const type = detectConceptProductType(product);
  if (isColorCriticalProductType(type)) return true;
  const name = normalizeText(product.name);
  return /футболк|худи|свитшот|поло|кепк|панам|дождевик|ветровк|оверсайз|шоппер|рюкзак|зонт|блокнот|ежедневник|кружк|термос|бутылк/i.test(
    name,
  );
}

/** Совпадение SKU с фирменными цветами брифа (RGB + название) */
export function scoreBrandColorMatch(product: CatalogProduct, brandColors: string[]): number {
  if (!brandColors.length) return 0;

  const brandRgbs = parseBrandRgbs(brandColors);
  if (!brandRgbs.length) return 0;

  const critical = isColorCriticalProduct(product);
  const productRgb = inferProductRgb(product);

  if (!productRgb) return critical ? -35 : -18;

  if (isNeutralRgb(productRgb)) {
    return critical ? 6 : 12;
  }

  const dist = minBrandDistance(productRgb, brandRgbs);

  if (dist < 48) return critical ? 95 : 78;
  if (dist < 78) return critical ? 72 : 58;
  if (dist < 105) return critical ? 28 : 22;
  if (dist < 140) return critical ? -18 : -12;
  if (dist < 185) return critical ? -48 : -38;
  return critical ? -72 : -55;
}

function rgbToHue([r, g, b]: [number, number, number]): number {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  if (d === 0) return 0;
  let h = 0;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  h = Math.round(h * 60);
  if (h < 0) h += 360;
  return h;
}

function rgbToHsv(rgb: [number, number, number]): { h: number; s: number; v: number } {
  const [r, g, b] = rgb;
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  const v = max;
  const s = max === 0 ? 0 : d / max;
  const h = rgbToHue(rgb);
  return { h, s: s * 100, v: v * 100 };
}

export type ColorToneClass = {
  warmth: 'warm' | 'cool' | 'neutral';
  intensity: 'bright' | 'neon' | 'pastel' | 'muted' | 'dark';
};

export function classifyColorTone(rgb: [number, number, number]): ColorToneClass {
  const { h, s, v } = rgbToHsv(rgb);
  let warmth: ColorToneClass['warmth'] = 'neutral';
  if (s < 12 || isNeutralRgb(rgb)) warmth = 'neutral';
  else if (isWarmToneRgb(rgb)) warmth = 'warm';
  else if (isCoolToneRgb(rgb)) warmth = 'cool';

  let intensity: ColorToneClass['intensity'] = 'muted';
  if (v < 28) intensity = 'dark';
  else if (s >= 72 && v >= 68) intensity = 'neon';
  else if (s >= 52 && v >= 58) intensity = 'bright';
  else if (s <= 35 && v >= 72) intensity = 'pastel';
  else if (s >= 18) intensity = 'muted';

  if (warmth === 'neutral' && v < 45) intensity = 'dark';
  return { warmth, intensity };
}

export function isNeonToneRgb(rgb: [number, number, number]): boolean {
  return classifyColorTone(rgb).intensity === 'neon';
}

export function isBrightToneRgb(rgb: [number, number, number]): boolean {
  const tone = classifyColorTone(rgb);
  return tone.intensity === 'bright' || tone.intensity === 'neon';
}

export function isPastelToneRgb(rgb: [number, number, number]): boolean {
  return classifyColorTone(rgb).intensity === 'pastel';
}

function productTextHaystack(product: CatalogProduct): string {
  return normalizeText(`${product.name} ${product.description ?? ''}`);
}

function textMatchesColorHint(text: string, hint: string): boolean {
  if (hint === FORBIDDEN_TONE_BRIGHT) {
    return /ярк|неон|neon|кислот|фукси|fuchsia|fluoresc/i.test(text);
  }
  if (hint === FORBIDDEN_TONE_NEON) {
    return /неон|neon|кислот|фукси|fuchsia|fluoresc/i.test(text);
  }
  if (hint === FORBIDDEN_TONE_WARM) {
    return /красн|оранж|желт|золот|терракот|бордов|коричн|беж|крем/i.test(text);
  }
  if (hint === FORBIDDEN_TONE_COOL) {
    return /син|голуб|бирюз|фиолет|индиго|сер|grey|gray/i.test(text);
  }
  return text.includes(hint);
}

function rgbMatchesForbiddenHint(rgb: [number, number, number], hint: string): boolean {
  const tone = classifyColorTone(rgb);
  if (hint === FORBIDDEN_TONE_BRIGHT) return tone.intensity === 'bright' || tone.intensity === 'neon';
  if (hint === FORBIDDEN_TONE_NEON) return tone.intensity === 'neon';
  if (hint === FORBIDDEN_TONE_WARM) return tone.warmth === 'warm' && tone.intensity !== 'dark';
  if (hint === FORBIDDEN_TONE_COOL) return tone.warmth === 'cool';

  for (const rule of NAME_COLOR_RULES) {
    if (!rule.re.test(hint) && !hint.startsWith(rule.re.source.slice(1, 6))) continue;
    if (rgbDistance(rgb, rule.rgb) < 62) return true;
  }

  const fromHint = inferRgbFromText(hint);
  if (fromHint && rgbDistance(rgb, fromHint) < 55) return true;
  return false;
}

/** Жёсткая проверка: товар содержит запрещённый цвет */
export function productHasForbiddenColor(
  product: CatalogProduct,
  forbiddenHints: string[],
): boolean {
  if (!forbiddenHints.length) return false;
  const text = productTextHaystack(product);
  for (const hint of forbiddenHints) {
    if (textMatchesColorHint(text, hint)) return true;
    for (const name of productColorNames(product)) {
      if (textMatchesColorHint(name, hint)) return true;
    }
    const rgb = inferProductRgb(product);
    if (rgb && rgbMatchesForbiddenHint(rgb, hint)) return true;
  }
  return false;
}

/** Бонус за allowed, штраф за нейтральный, дисквалификация через productHasForbiddenColor */
export function scoreBriefPaletteMatch(
  product: CatalogProduct,
  allowedColors: string[],
  forbiddenHints: string[],
): number {
  if (productHasForbiddenColor(product, forbiddenHints)) return -200;

  const rgb = inferProductRgb(product);
  if (!rgb) return allowedColors.length ? -12 : 0;

  if (allowedColors.length) {
    const brandScore = scoreBrandColorMatch(product, allowedColors);
    if (brandScore >= 45) return brandScore + 20;
    if (isNeutralRgb(rgb)) return -18;
    if (brandScore < -25) return brandScore - 30;
    return brandScore;
  }

  return 0;
}

export function isWarmToneRgb(rgb: [number, number, number]): boolean {
  const [r, g, b] = rgb;
  const hue = rgbToHue(rgb);
  const sat = Math.max(r, g, b) - Math.min(r, g, b);
  if (sat < 18) return r >= g && r >= b && r > 120;
  return (hue >= 0 && hue <= 65) || (hue >= 330 && hue <= 360) || (hue >= 350);
}

export function isCoolToneRgb(rgb: [number, number, number]): boolean {
  const hue = rgbToHue(rgb);
  const sat = Math.max(rgb[0], rgb[1], rgb[2]) - Math.min(rgb[0], rgb[1], rgb[2]);
  if (sat < 18) return rgb[2] > rgb[0] + 10;
  return hue >= 170 && hue <= 280;
}

/** Бонус/штраф за тёплый/холодный тон при брифе «тёплые гаммы» */
export function scoreWarmthTone(product: CatalogProduct, brief: string): number {
  if (!/тепл[а-яё]*\s+цвет|тепл[а-яё]*\s+гамм|warm\s+color|уютн[а-яё]*\s+тон/i.test(brief.toLowerCase().replace(/ё/g, 'е'))) {
    return 0;
  }
  const rgb = inferProductRgb(product);
  if (!rgb || isNeutralRgb(rgb)) return -8;
  if (isWarmToneRgb(rgb)) return 55;
  if (isCoolToneRgb(rgb)) return -65;
  return 0;
}

export function buildBrandColorScoreFn(
  brandColors: string[],
): (product: CatalogProduct) => number {
  if (!brandColors.length) return () => 0;
  return (product) => scoreBrandColorMatch(product, brandColors) * 2.8;
}

export function matchesBrandColors(product: CatalogProduct, brandColors: string[]): boolean {
  return scoreBrandColorMatch(product, brandColors) > 10;
}

const CONFLICTING_COLOR_GROUPS: Array<{ briefKey: RegExp; productKey: RegExp; label: string }> = [
  { briefKey: /син|blue|navy|голуб/i, productKey: /красн|red|бордов|оранж|orange|желт|yellow|розов|pink/i, label: 'red_vs_blue_brief' },
  { briefKey: /сер|grey|gray|графит|silver|серебр/i, productKey: /красн|red|оранж|orange|желт|yellow|розов|pink|зелен|green/i, label: 'bright_vs_gray_brief' },
  { briefKey: /красн|red/i, productKey: /син|blue|navy|голуб|зелен|green|желт|yellow/i, label: 'non_red_vs_red_brief' },
  { briefKey: /зелен|green/i, productKey: /красн|red|син|blue|желт|yellow|оранж/i, label: 'non_green_vs_green_brief' },
  { briefKey: /оранж|orange/i, productKey: /син|blue|черн|black|сер|grey|gray|молочн/i, label: 'dark_vs_orange_brief' },
];

const EARTH_TONE_BRIEF = /натуральн|землист|earth|beige|беж|коричн|олив/i;
const DARK_COLOR_BAN = /запрет\s+на\s+темн|без\s+темн|не\s+темн/i;

function briefSpecifiesPalette(brief: string, brandColors: string[]): boolean {
  return brandColors.length >= 1 || /цвет[а-я]*\s*[—\-:]/i.test(brief);
}

/** Жёсткий конфликт цвета товара с палитрой брифа */
export function productConflictsBriefPalette(
  product: CatalogProduct,
  brandColors: string[],
  brief: string,
  forbiddenHints: string[] = [],
): boolean {
  if (productHasForbiddenColor(product, forbiddenHints)) return true;
  if (!briefSpecifiesPalette(brief, brandColors)) return false;

  const text = normalizeText(`${product.name} ${product.description ?? ''}`);
  const briefNorm = normalizeText(brief);

  if (DARK_COLOR_BAN.test(briefNorm)) {
    if (/черн|black|темно[\s-]?син|navy|темно[\s-]?сер|dark/i.test(text)) return true;
  }

  if (EARTH_TONE_BRIEF.test(briefNorm)) {
    if (/красн|red|син|blue|navy|бел|white|розов|pink|фиолет/i.test(text)) return true;
  }

  if (brandColors.length >= 2 && scoreBrandColorMatch(product, brandColors) < -40) {
    return true;
  }

  for (const group of CONFLICTING_COLOR_GROUPS) {
    if (!group.briefKey.test(briefNorm)) continue;
    if (group.productKey.test(text)) return true;
    const rgb = inferProductRgb(product);
    if (rgb && brandColors.length) {
      const match = scoreBrandColorMatch(product, brandColors);
      if (match < -35) return true;
    }
  }

  return false;
}

/** Ближайший вариант цвета из каталога к фирменной палитре */
export function pickCatalogColorNameForBrand(
  product: CatalogProduct,
  brandColors: string[],
): string | undefined {
  if (!brandColors.length) return undefined;

  const brandRgbs = parseBrandRgbs(brandColors);
  if (!brandRgbs.length) return undefined;

  const candidates: Array<{ name: string; dist: number }> = [];

  for (const c of product.colors ?? []) {
    const name = colorLabel(c);
    if (!name || name.startsWith('#')) continue;
    const rgb =
      (typeof c === 'object' && (c as { hex?: string }).hex
        ? hexToRgb((c as { hex: string }).hex)
        : null) ?? inferRgbFromText(name);
    if (!rgb) continue;
    candidates.push({ name, dist: minBrandDistance(rgb, brandRgbs) });
  }

  if (!candidates.length) {
    const fromName = inferRgbFromText(product.name);
    if (fromName) {
      const dist = minBrandDistance(fromName, brandRgbs);
      if (dist < 120) {
        const match = NAME_COLOR_RULES.find((r) => r.re.test(product.name));
        if (match) {
          const label = product.name.match(match.re)?.[0];
          if (label) return label;
        }
      }
    }
    return undefined;
  }

  candidates.sort((a, b) => a.dist - b.dist);
  return candidates[0]?.dist < 150 ? candidates[0].name : undefined;
}

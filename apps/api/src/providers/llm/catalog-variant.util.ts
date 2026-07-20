import type { CatalogProduct } from './catalog.util';
import { scoreBrandColorMatch } from './catalog-color-match.util';
import { isCorporateSetFiller } from '../../concept/product-role.util';

/** Ключи наполнителей — после первого филлера в прогоне блокируем все между наборами. */
const CROSS_CONCEPT_FILLER_KEYS = new Set([
  'line:corp_filler',
  'line:cleaning_cloth',
  'line:gift_pouch',
  'line:guest_towel',
  'line:cooler_bag',
  'line:felt_case',
]);

const COLOR_TOKEN_RE =
  /\b(?:ч[её]рн\w*|бел\w*|сер\w*|красн\w*|син\w*|голуб\w*|зелен\w*|ж[её]лт\w*|оранж\w*|розов\w*|фиолет\w*|коричн\w*|бежев\w*|индиго|молочн\w*|бордов\w*|бордо|navy|grey|gray|white|black|blue|red|green|yellow|orange|pink|beige|cream)\b/giu;

const COLORS_ANY =
  /\b(?:черн\w*|бел\w*|сер\w*|красн\w*|син\w*|голуб\w*|зелен\w*|желт\w*|оранж\w*|розов\w*|фиолет\w*|коричн\w*|бежев\w*|индиго|молочн\w*|бордов\w*|бордо|прозрачн\w*|серебрист\w*|серебр\w*|золот\w*|navy|grey|gray|white|black|blue|red|green|yellow|orange|pink|beige|cream|silver|gold)\b/giu;

/** Частые линейки каталога — один ключ между наборами (Madras/PB030/термос в разных цветах). */
const KNOWN_PRODUCT_LINES = new Set([
  'madras',
  'pb030',
  'pb031',
  'pb032',
  'mo9203',
  'mo2764',
  'mo2765',
  'mo9204',
  'fab',
  'lavrik',
  'neat',
  'twinkle',
  'beginner',
  'superbag',
  'hygge',
  'revello',
  'metropol',
  'rivista',
  'camelbak',
  'contigo',
  'stanley',
  'thermos',
  'elbrus',
]);

/** Модель термоса/бутылки после ключевого слова — один ключ на линейку (Madras/PB030). */
const THERMOS_MODEL_RE =
  /(?:термос|бутыл|flask|bottle|tumbler|travel\s*mug)[^\p{L}\p{N}]{0,6}([a-z]{2,}[a-z0-9-]{0,12}|\d{3,}[a-z0-9-]*)/iu;

/** Канонические ключи «наполнителей» — разные названия, одна линейка (Neat/салфетка/мешочек). */
const CANONICAL_FILLER_LINE_KEYS: Array<{ pattern: RegExp; key: string }> = [
  {
    pattern:
      /(?:очищающ|чистящ|cleansing).*салфет|салфетк.*(?:микрофибр|очист|экран|чист)|(?:^|\s)neat(?:\s|$)|микрофибр.*(?:салфет|полотен)/i,
    key: 'line:cleaning_cloth',
  },
  {
    pattern: /мешоч|подарочн\w*\s+(?:меш|сумк|упаков)|gift\s*bag|упаковочн/i,
    key: 'line:gift_pouch',
  },
  {
    pattern: /гостев\w*\s+полотен|(?:^|\s)полотен(?:це|ца|ье)(?:\s|$)/i,
    key: 'line:guest_towel',
  },
  {
    pattern: /сумк[аи][\s-]*холодильник|cooler\s*bag|изотерм\w*\s+сумк/i,
    key: 'line:cooler_bag',
  },
];

function canonicalFillerLineKeys(text: string): string[] {
  const keys: string[] = [];
  for (const { pattern, key } of CANONICAL_FILLER_LINE_KEYS) {
    if (pattern.test(text)) keys.push(key);
  }
  return keys;
}

/** Безымянные хиты каталога — один ключ между наборами (сумка для ноутбука, A7, Elbrus…). */
const GENERIC_CATALOG_LINE_PATTERNS: Array<{ pattern: RegExp; key: string }> = [
  { pattern: /сумк\w*\s+для\s+ноутбук|laptop\s*bag|notebook\s*bag|сумк\w*\s+ноутбук|ноутбук.*сумк/i, key: 'line:laptop_bag' },
  { pattern: /блокнот\s+a7|ежедневник\s+a7|notebook\s*a7|блокнот\s+а7|a7.*(?:блокнот|ежедневник|ручк)/i, key: 'line:notebook_a7' },
  { pattern: /блокнот\s+a5|ежедневник\s+a5|notebook\s*a5|блокнот\s+а5|a5.*(?:блокнот|ежедневник)/i, key: 'line:notebook_a5' },
  {
    pattern: /блокнот\s+a7\s+с\s+ручк|ежедневник\s+a7\s+с\s+ручк|набор\s+a7|notebook\s*a7\s+with\s+pen/i,
    key: 'line:notebook_a7_pen',
  },
  {
    pattern: /стальн\w*\s+кружк\w*\s+elbrus|elbrus.*кружк|кружк\w*\s+elbrus|877410/i,
    key: 'line:elbrus_mug',
  },
  { pattern: /стальн\w*\s+кружк|кружк\w*\s+стальн|steel\s*mug|double\s*wall.*mug/i, key: 'line:steel_mug' },
  { pattern: /шоппер\s+140|shopper\s*140|mo9424/i, key: 'line:shopper_140' },
  { pattern: /спортивн\w*\s+бутылк|sport\s*bottle|mo9203|mo9204/i, key: 'line:sport_bottle' },
  { pattern: /гостев\w*\s+полотен|mo2764|mo2765|tualetnye-prinadlezhnosti/i, key: 'line:guest_towel' },
  { pattern: /термос\s+madras|madras.*термос|\bmadras\b|madras\s+\d/i, key: 'line:thermos_madras' },
  { pattern: /\bpb030\b|pb030.*терм|терм.*pb030|\bpb031\b|\bpb032\b|\bpb033\b/i, key: 'line:thermos_pb030' },
  // ШИРОКИЙ catch-all: ВСЕ пауэрбанки/внешние аккумуляторы → один межнаборный ключ, чтобы
  // разные повербанки не повторялись во всех 5 наборах. Прежний паттерн ловил мало (\w не матчит
  // кириллицу в «внешн\w*аккумулятор», нет «повербанк»/«аккумулятор»/«мАч»).
  { pattern: /power\s*bank|powerbank|пауэр[\s-]*банк|павер[\s-]*банк|повербанк|аккумулятор|внешн[а-я]*\s*аккумул|портативн[а-я]*\s*зарядн|зарядн[а-я]*\s*устройств|(?<![а-яё])мач(?![а-яё])|(?<![a-z])mah(?![a-z])/i, key: 'line:powerbank' },
  // Все беспроводные колонки → один межнаборный ключ (не повторять «колонку» в каждом наборе).
  { pattern: /(?<![а-я])колонк|bluetooth[\s-]*колонк|портативн[а-я]*\s*колонк|беспроводн[а-я]*\s*колонк|(?<![а-я])спикер|аудиосистем/i, key: 'line:speaker' },
  { pattern: /ручк\w*\s+metropol|metropol.*ручк|\bmetropol\b/i, key: 'line:pen_metropol' },
  { pattern: /ручк\w*\s+revello|revello.*ручк|\brevello\b/i, key: 'line:pen_revello' },
  { pattern: /чехол\s+из\s+войлок|войлок.*чехол|felt\s*case/i, key: 'line:felt_case' },
  { pattern: /ручк\w*\s+rivista|rivista.*ручк|\brivista\b/i, key: 'line:pen_rivista' },
  { pattern: /термокружк|thermos\s*mug|travel\s*mug/i, key: 'line:thermos_mug' },
  { pattern: /блокнот.*ручк|ежедневник.*ручк|набор\s+a7|notebook.*with\s+pen/i, key: 'line:notebook_pen_set' },
  { pattern: /^(?:полотенц|гостев\w*\s+полотен)/i, key: 'line:guest_towel' },
  { pattern: /^(?:салфетк|очищающ|чистящ)/i, key: 'line:cleaning_cloth' },
  { pattern: /^(?:мешоч|подарочн\w*\s+меш)/i, key: 'line:gift_pouch' },
];

function genericCatalogLineKeys(text: string): string[] {
  const keys: string[] = [];
  for (const { pattern, key } of GENERIC_CATALOG_LINE_PATTERNS) {
    if (pattern.test(text)) keys.push(key);
  }
  return keys;
}

function stripLineKeySourcePrefix(key: string): string {
  const idx = key.indexOf('::');
  return idx >= 0 ? key.slice(idx + 2) : key;
}

function normalizeLineKeyToken(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/-{1,2}\d{2,4}-\d{1,3}$/, '')
    .replace(/-\d{1,3}$/, '')
    .replace(/[-_](?:bl|wh|rd|blu|gr|gy|bk|or|yl|pk|pp|nv|bg|br)\d*$/i, '');
}

function extractSkuToken(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const ext = normalizeLineKeyToken(raw.trim());
  if (/^[a-z]{1,6}\d{3,}[a-z0-9-]*$/i.test(ext) && ext.length >= 5) return ext;
  const skuMatch =
    raw.match(/\b([A-Za-z]{1,4}\d{3,}[A-Za-z0-9-]*)\b/) ??
    raw.match(/\b(mo\d{3,}[a-z0-9-]*)\b/i);
  if (!skuMatch) return null;
  const token = normalizeLineKeyToken(skuMatch[1]);
  return token.length >= 4 ? token : null;
}

function extractSkuFromExternalId(externalId: string | null | undefined): string | null {
  return extractSkuToken(externalId);
}

function extractSkuFromSourceUrl(sourceUrl: string | null | undefined): string | null {
  if (!sourceUrl?.trim()) return null;
  const pathMatch = sourceUrl.match(/\/(mo\d{3,}[a-z0-9-]*)\.html/i);
  if (pathMatch) return normalizeLineKeyToken(pathMatch[1]);
  return extractSkuToken(sourceUrl);
}

/** Сильный ключ «линейки» — имя без цветов и пунктуации (Madras/PB030 в разных цветах = один ключ). */
export function productLineKeyFromName(name: string): string {
  const raw = name.trim();
  const lower = raw.toLowerCase();

  // Артикулы вида PB030, MO9203, mo2764-65 — один ключ на линейку.
  const skuMatch =
    raw.match(/\b([A-Za-z]{1,4}\d{3,}[A-Za-z0-9-]*)\b/) ??
    raw.match(/\b(mo\d{3,}[a-z0-9-]*)\b/i);
  if (skuMatch) {
    return skuMatch[1]
      .toLowerCase()
      .replace(/-{1,2}\d{2,4}-\d{1,3}$/, '')
      .replace(/-\d{1,3}$/, '')
      .replace(/[-_](?:bl|wh|rd|blu|gr|gy|bk|or|yl|pk|pp|nv|bg|br)\d*$/i, '');
  }

  // Брендовые имена в кавычках («Neat», "Lavrik") — линейка.
  const quoted = raw.match(/[«"']([^»"']{2,24})[»"']/);
  if (quoted) {
    const q = quoted[1].trim().toLowerCase().replace(/\s+/g, ' ');
    if (q.length >= 3) return q;
  }

  const thermosModel = lower.match(THERMOS_MODEL_RE);
  if (thermosModel) {
    const model = thermosModel[1]
      .toLowerCase()
      .replace(/[-_](?:bl|wh|rd|blu|gr|gy|bk|or|yl|pk|pp|nv|bg|br)\d*$/i, '');
    if (model.length >= 3) return model;
  }

  const lowerTokens = lower
    .replace(COLORS_ANY, ' ')
    .replace(/[«»"'(),.\/+\-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  for (const token of lowerTokens) {
    if (KNOWN_PRODUCT_LINES.has(token)) return token;
  }

  // Известные линейки по токену (термос Madras, рюкзак Fab…).
  const tokenLine = lower
    .replace(COLORS_ANY, ' ')
    .replace(/[«»"'(),.\/+\-]/g, ' ')
    .split(/\s+/)
    .find((t) => /^[a-z]{4,12}$/.test(t) && !/термос|бутыл|кружк|ручк|сумк|рюкзак|полотен|салфет|мешоч|спортив|подароч|гостев|стакан|блокнот|ежедневник/.test(t));
  if (tokenLine && tokenLine.length >= 4) return tokenLine;

  return lower
    .replace(COLORS_ANY, ' ')
    .replace(/[«»"'(),.\/+\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function productLineKey(product: CatalogProduct): string {
  const fillerKeys = canonicalFillerLineKeys(
    `${product.name ?? ''} ${product.description ?? ''} ${product.category ?? ''}`,
  );
  if (fillerKeys.length === 1) return fillerKeys[0];
  if (fillerKeys.length > 1) return fillerKeys.sort((a, b) => a.length - b.length)[0];

  const nameKey = stripLineKeySourcePrefix(productLineKeyFromName(product.name));
  const extKey = extractSkuFromExternalId(product.externalId);
  const urlKey = extractSkuFromSourceUrl(product.sourceUrl);
  const candidates = [extKey, urlKey, nameKey].filter(Boolean) as string[];

  for (const c of candidates) {
    const bare = stripLineKeySourcePrefix(c);
    if (/^(?:mo|pb|fab)\d/i.test(bare) || KNOWN_PRODUCT_LINES.has(bare)) {
      return bare;
    }
  }

  if (extKey && nameKey.length >= 4) {
    if (extKey.includes(nameKey) || nameKey.includes(extKey)) return extKey.length <= nameKey.length ? extKey : nameKey;
  }

  const best = candidates.sort((a, b) => a.length - b.length)[0];
  if (best && best.length >= 3) return best;
  return nameKey.length >= 4 ? nameKey : product.name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Все ключи линейки для блокировки между наборами (SKU + имя + канон. наполнители). */
export function crossConceptLineKeys(product: CatalogProduct, brief = ''): string[] {
  const haystack = `${product.name ?? ''} ${product.description ?? ''} ${product.category ?? ''} ${product.subcategory ?? ''} ${product.externalId ?? ''} ${product.sourceUrl ?? ''}`;
  const keys = new Set<string>();
  keys.add(productLineKey(product));
  keys.add(stripLineKeySourcePrefix(productLineKeyFromName(product.name)));
  for (const ck of canonicalFillerLineKeys(haystack)) {
    keys.add(ck);
  }
  for (const gk of genericCatalogLineKeys(haystack)) {
    keys.add(gk);
  }
  if (isCorporateSetFiller(product, brief)) {
    keys.add('line:corp_filler');
    for (const fk of CROSS_CONCEPT_FILLER_KEYS) keys.add(fk);
  }
  // Роль/тип как запасной ключ — один термос/блокнот/сумка между наборами (не только по SKU).
  const hayLower = haystack.toLowerCase();
  if (/термос|thermos/i.test(hayLower) && !keys.has('line:thermos_madras') && !keys.has('line:thermos_pb030')) {
    const model = hayLower.match(/\b(madras|pb0\d{2}|fab|contigo|stanley)\b/);
    keys.add(model ? `line:thermos_${model[1]}` : 'line:thermos_generic');
  }
  if (/блокнот|ежедневник|notebook/i.test(hayLower) && /\ba7\b|а7/i.test(hayLower)) {
    keys.add('line:notebook_a7');
  }
  return [...keys].filter((k) => k.length >= 3);
}

function productHasFillerLineKey(product: CatalogProduct): boolean {
  if (isCorporateSetFiller(product)) return true;
  return crossConceptLineKeys(product).some((lk) => CROSS_CONCEPT_FILLER_KEYS.has(lk));
}

function stripColorTokens(name: string): string {
  let result = name.trim();
  // Цвет в конце может идти после запятой ИЛИ тире (", Серый" / " - Ярко-синий").
  // Допускаем составные оттенки («темно-синий», «ярко синий») и пару цветов.
  const trailingColor =
    /[,\-–—]\s*(?:(?:светло|темно|тёмно|ярко|нежно|глубоко)[\s-]?)?(?:ч[её]рн[а-яё]*|бел[а-яё]*|сер[а-яё]*|красн[а-яё]*|син[а-яё]*|голуб[а-яё]*|зелен[а-яё]*|ж[её]лт[а-яё]*|оранж[а-яё]*|розов[а-яё]*|фиолет[а-яё]*|коричн[а-яё]*|бежев[а-яё]*|индиго|молочн[а-яё]*|бордов[а-яё]*|бордо|нейви|navy|олив[а-яё]*|бирюз[а-яё]*|серебр[а-яё]*|золот[а-яё]*|grey|gray|white|black|blue|red|green|yellow|orange|pink|beige|cream|silver|gold)\s*$/iu;
  while (trailingColor.test(result)) {
    result = result.replace(trailingColor, '');
  }
  return result.replace(/\s+/g, ' ').trim();
}

/** Ключ базовой «модели» по названию (без варианта цвета) — для дедупа base-dup. */
export function productBaseNameKey(product: CatalogProduct): string {
  return normalizeBaseName(product.name);
}

function normalizeBaseName(name: string): string {
  return stripColorTokens(name.trim().toLowerCase().replace(/\s+/g, ' '));
}

/** Ключ «модели» — один SKU-артикул, без варианта цвета */
export function productVariantKey(product: CatalogProduct): string {
  const nameKey = normalizeBaseName(product.name);

  if (product.externalId) {
    const base = product.externalId
      .toLowerCase()
      .replace(/-{1,2}\d{2,4}-\d{1,3}$/, '')
      .replace(/-\d{1,3}$/, '')
      .replace(/[-_](?:bl|wh|rd|blu|gr|gy|bk|or|yl|pk|pp|nv|bg|br)\d*$/i, '');
    if (base.length >= 8 && base !== product.externalId.toLowerCase()) {
      return `${product.sourceId ?? 'cat'}::${base}`;
    }
  }

  return nameKey.length >= 6 ? nameKey : product.name.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function indexCatalogByName(catalog: CatalogProduct[]): Map<string, CatalogProduct[]> {
  const map = new Map<string, CatalogProduct[]>();
  for (const p of catalog) {
    const key = p.name.trim().toLowerCase();
    const list = map.get(key) ?? [];
    list.push(p);
    map.set(key, list);
  }
  return map;
}

export function pickBestColorVariant(
  candidates: CatalogProduct[],
  brandColors: string[] = [],
): CatalogProduct {
  if (candidates.length <= 1) return candidates[0];

  const scored = candidates.map((p) => ({
    product: p,
    score:
      brandColors.length > 0
        ? scoreBrandColorMatch(p, brandColors) * 1_000 + (p.stockAvailable ?? 0) / 100
        : (p.stockAvailable ?? 0) + scoreBrandColorMatch(p, brandColors),
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored[0].product;
}

export function dedupeProductsByVariant(
  products: CatalogProduct[],
  excludeVariantKeys: Set<string> = new Set(),
): CatalogProduct[] {
  const seen = new Set<string>(excludeVariantKeys);
  const result: CatalogProduct[] = [];

  for (const p of products) {
    const key = productVariantKey(p);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(p);
  }

  return result;
}

export function upgradeToBrandColorVariants(
  products: CatalogProduct[],
  catalog: CatalogProduct[],
  brandColors: string[] = [],
): CatalogProduct[] {
  if (!brandColors.length || !products.length) return products;

  const variantGroups = new Map<string, CatalogProduct[]>();
  for (const p of catalog) {
    const vk = productVariantKey(p);
    const list = variantGroups.get(vk) ?? [];
    list.push(p);
    variantGroups.set(vk, list);
  }

  return products.map((p) => {
    const group = variantGroups.get(productVariantKey(p));
    if (!group || group.length <= 1) return p;
    return pickBestColorVariant(group, brandColors);
  });
}

export function isVariantBlocked(
  product: CatalogProduct,
  blockedIds: Set<string>,
  blockedVariants: Set<string>,
): boolean {
  if (blockedIds.has(product.id)) return true;
  const vk = productVariantKey(product);
  if (blockedVariants.has(vk)) return true;
  const lineKey = productLineKey(product);
  if (lineKey.length >= 3 && blockedVariants.has(lineKey)) return true;
  if (blockedVariants.has('line:corp_filler') && productHasFillerLineKey(product)) return true;
  return crossConceptLineKeys(product).some((lk) => blockedVariants.has(lk));
}

/** Регистрирует SKU + variant + productLineKey для блокировки между наборами (Madras/PB030/термос). */
export function registerCrossConceptBlock(
  product: CatalogProduct,
  blockedIds: Set<string>,
  blockedVariants: Set<string>,
): void {
  blockedIds.add(product.id);
  blockedVariants.add(productVariantKey(product));
  const lineKey = productLineKey(product);
  if (lineKey.length >= 3) blockedVariants.add(lineKey);
  for (const lk of crossConceptLineKeys(product)) {
    blockedVariants.add(lk);
  }
  if (productHasFillerLineKey(product)) {
    for (const fk of CROSS_CONCEPT_FILLER_KEYS) blockedVariants.add(fk);
  }
  // Блокируем всю линейку термоса/бутылки между наборами (Madras/PB030/sport bottle).
  for (const lk of crossConceptLineKeys(product)) {
    if (lk.startsWith('line:thermos_') || lk === 'line:sport_bottle' || lk === 'line:thermos_mug') {
      blockedVariants.add(lk);
    }
  }
}

export function isCrossConceptBlocked(
  product: CatalogProduct,
  blockedIds: Set<string>,
  blockedVariants: Set<string>,
): boolean {
  return isVariantBlocked(product, blockedIds, blockedVariants);
}

/** Блокировка линейки товара между наборами (Madras/PB030/термос/полотенце…). */
export function isCrossConceptLineBlocked(
  product: CatalogProduct,
  blockedLineKeys: Set<string>,
  brief = '',
): boolean {
  if (!blockedLineKeys.size) return false;
  if (blockedLineKeys.has('line:corp_filler') && productHasFillerLineKey(product)) return true;
  return crossConceptLineKeys(product, brief).some((lk) => blockedLineKeys.has(lk));
}

/** Регистрирует line-key в отдельном множестве (не смешивать с variant keys). */
export function registerCrossConceptLineKeys(
  product: CatalogProduct,
  blockedLineKeys: Set<string>,
  brief = '',
): void {
  for (const lk of crossConceptLineKeys(product, brief)) {
    if (lk.length >= 3) blockedLineKeys.add(lk);
  }
  if (productHasFillerLineKey(product)) {
    for (const fk of CROSS_CONCEPT_FILLER_KEYS) blockedLineKeys.add(fk);
  }
}

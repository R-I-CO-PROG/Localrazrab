import type { CatalogProduct } from './catalog.util';
import { productVariantKey } from './catalog-variant.util';
import { detectProductRole } from '../../concept/product-role.util';

export const MANDATORY_TYPE_MAX_CONCEPTS = 5;
/** Необязательный тип — максимум в 1 концепции из 5 */
export const OPTIONAL_TYPE_MAX_CONCEPTS = 1;

export interface ConceptTypeDefinition {
  slug: string;
  labelRu: string;
  briefMandatory: RegExp[];
  matchProduct: (text: string) => boolean;
}

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/ё/g, 'е');
}

function productSearchText(product: CatalogProduct): string {
  return normalizeText(`${product.name} ${product.description ?? ''} ${product.subcategory ?? ''}`);
}

/** Типы товаров для правил разнообразия (порядок: более специфичные — раньше) */
export const CONCEPT_TYPE_DEFINITIONS: ConceptTypeDefinition[] = [
  {
    slug: 'welcome_pack',
    labelRu: 'welcome pack',
    briefMandatory: [/welcome\s*pack|велком/i],
    matchProduct: (t) => /welcome\s*pack|велком\s*пак|simple\s*kit/i.test(t),
  },
  {
    slug: 'gift_set',
    labelRu: 'подарочный набор',
    briefMandatory: [/подарочн\w*\s+набор/i],
    matchProduct: (t) =>
      /подарочн[а-яё]*\s+набор|gift\s*set|superbag\s*bubble|dreamy\s*hygge|cozy\s*hygge/i.test(t),
  },
  {
    slug: 'scarf',
    labelRu: 'шарф',
    briefMandatory: [/шарф/i],
    matchProduct: (t) => /шарф|scarf/i.test(t),
  },
  {
    slug: 'tshirt',
    labelRu: 'футболка',
    briefMandatory: [
      /(?:нужн|ищем|обязательн|хотим|требу|вход).{0,30}(?:футболк|оверсайз|мерч)/i,
      /футболк[а-я]*\b/i,
      /оверсайз/i,
      /\bмерч\b/i,
    ],
    matchProduct: (t) => /футболк|tshirt|t-shirt|oversize|оверсайз/i.test(t) && !/поло/i.test(t),
  },
  {
    slug: 'hoodie',
    labelRu: 'худи',
    briefMandatory: [/(?:нужн|ищем|обязательн|хотим).{0,25}худи/i, /худи[а-я]*\b/i, /свитшот/i],
    matchProduct: (t) => /худи|hoodie|свитшот/i.test(t),
  },
  {
    slug: 'cap',
    labelRu: 'кепка',
    briefMandatory: [/(?:нужн|ищем|обязательн|хотим).{0,25}кепк/i, /кепк[а-я]*\b/i, /бейсболк/i],
    matchProduct: (t) => /кепк|бейсболк|baseball cap/i.test(t) && !/панам|bucket/i.test(t),
  },
  {
    slug: 'bucket_hat',
    labelRu: 'панама',
    briefMandatory: [/(?:нужн|ищем|обязательн|хотим).{0,25}панам/i, /панам[а-я]*\b/i, /bucket/i],
    matchProduct: (t) => /панам|bucket/i.test(t),
  },
  {
    slug: 'sunglasses',
    labelRu: 'очки',
    briefMandatory: [
      /(?:нужн|ищем|обязательн|хотим).{0,30}(?:очк|солнцезащит)/i,
      /солнцезащитн[а-я]*\s*очк/i,
      /(?:^|[^\p{L}\p{N}])очки(?:[^\p{L}\p{N}]|$)/iu,
    ],
    matchProduct: (t) =>
      (/солнцезащит|sunglass|eyewear/i.test(t) ||
        /(?:^|[^\p{L}\p{N}])очки(?:[а-я]*)(?:[^\p{L}\p{N}]|$)/iu.test(t)) &&
      !/очистител|линз|кепк|бейсболк|панам|bucket|сумочк|кошел/i.test(t),
  },
  {
    slug: 'raincoat',
    labelRu: 'дождевик',
    briefMandatory: [/(?:нужн|ищем|обязательн|хотим).{0,25}дождевик/i, /дождевик[а-я]*\b/i, /ветровк/i],
    matchProduct: (t) => /дождевик|ветровк|raincoat|poncho/i.test(t),
  },
  {
    slug: 'tea_set',
    labelRu: 'чайная пара',
    briefMandatory: [/(?:нужн|ищем|обязательн|хотим|требу).{0,25}чайн[а-я]*\s*пар/i, /чайн[а-я]*\s*пар[аыу]?\b/i],
    matchProduct: (t) => /чайн[а-я]*\s*пар/i.test(t),
  },
  {
    slug: 'thermos_mug',
    labelRu: 'термокружка',
    briefMandatory: [/(?:нужн|ищем|обязательн|хотим).{0,25}термокруж/i, /термокруж[а-я]*\b/i],
    matchProduct: (t) => /термокруж/i.test(t),
  },
  {
    slug: 'thermos',
    labelRu: 'термос',
    briefMandatory: [/(?:нужн|ищем|обязательн|хотим|требу).{0,25}термос/i, /термос[аыуов]?\b/i],
    matchProduct: (t) => /термос/i.test(t) && !/термокруж/i.test(t),
  },
  {
    slug: 'bottle',
    labelRu: 'бутылка',
    briefMandatory: [/(?:нужн|ищем|обязательн|хотим).{0,25}бутыл/i, /бутыл[а-я]*\b/i],
    matchProduct: (t) => /бутыл/i.test(t),
  },
  {
    slug: 'mug',
    labelRu: 'кружка',
    briefMandatory: [/круж[а-яё]*/i],
    matchProduct: (t) => /круж|mug\b/i.test(t) && !/термокруж/i.test(t),
  },
  {
    slug: 'diary',
    labelRu: 'ежедневник',
    briefMandatory: [/(?:нужн|ищем|обязательн|хотим).{0,25}ежедневник/i, /ежедневник[а-я]*\b/i],
    matchProduct: (t) => /ежедневник/i.test(t),
  },
  {
    slug: 'notebook',
    labelRu: 'блокнот',
    briefMandatory: [/(?:нужн|ищем|обязательн|хотим).{0,25}блокнот/i, /блокнот[а-я]*\b/i],
    matchProduct: (t) => /блокнот/i.test(t) && !/ежедневник/i.test(t),
  },
  {
    slug: 'backpack',
    labelRu: 'рюкзак',
    briefMandatory: [/(?:нужн|ищем|обязательн|хотим).{0,25}рюкзак/i, /рюкзак[а-я]*\b/i],
    matchProduct: (t) => /рюкзак|backpack/i.test(t),
  },
  {
    slug: 'shopper',
    labelRu: 'шоппер',
    briefMandatory: [/(?:нужн|ищем|обязательн|хотим).{0,25}шоппер/i, /шоппер[а-я]*\b/i],
    matchProduct: (t) => /шоппер/i.test(t),
  },
  {
    slug: 'bag',
    labelRu: 'сумка',
    briefMandatory: [/(?:нужн|ищем|обязательн|хотим).{0,25}сумк/i, /сумк[а-я]*\b/i],
    matchProduct: (t) => /сумк|тоут|tote/i.test(t) && !/рюкзак|шоппер|блокнот|пенал/i.test(t),
  },
  {
    slug: 'speaker',
    labelRu: 'колонка',
    briefMandatory: [/(?:нужн|ищем|обязательн|хотим).{0,25}колонк/i, /колонк[а-я]*\b/i],
    matchProduct: (t) => /колонк|speaker|bluetooth/i.test(t),
  },
  {
    slug: 'blanket',
    labelRu: 'плед',
    briefMandatory: [/плед[а-яё]*/i],
    matchProduct: (t) => /плед|blanket|fleece.*плед/i.test(t) && !/спальн/i.test(t),
  },
  {
    slug: 'powerbank',
    labelRu: 'пауэрбанк',
    briefMandatory: [
      /(?:нужн|ищем|обязательн|хотим).{0,25}(?:powerbank|пауэр|заряд|аккумулятор)/i,
      /powerbank|пауэрбанк|аккумулятор[а-я]*\b/i,
    ],
    matchProduct: (t) =>
      /powerbank|power bank|пауэр|зарядн|аккумулятор|\bмач\b|\bmah\b/i.test(t),
  },
  {
    slug: 'pen',
    labelRu: 'ручка',
    briefMandatory: [/(?:нужн|ищем|обязательн|хотим).{0,25}ручк/i, /ручк[а-я]*\b/i],
    matchProduct: (t) => /ручк|pen/i.test(t) && !/powerbank/i.test(t),
  },
  {
    slug: 'flash_drive',
    labelRu: 'флешка',
    briefMandatory: [/флешк|флэшк|usb/i],
    matchProduct: (t) => /флешк|флэшк|flash.*drive|usb.*drive/i.test(t),
  },
  {
    slug: 'umbrella',
    labelRu: 'зонт',
    briefMandatory: [/(?:нужн|ищем|обязательн|хотим).{0,25}зонт/i, /зонт[а-я]*\b/i],
    matchProduct: (t) => /зонт/i.test(t),
  },
  {
    slug: 'watch',
    labelRu: 'часы',
    briefMandatory: [/(?:нужн|ищем|обязательн|хотим).{0,25}час/i, /час[а-я]*\b/i],
    matchProduct: (t) => /час/i.test(t) && !/powerbank/i.test(t),
  },
  {
    slug: 'welcome_box',
    labelRu: 'welcome box',
    briefMandatory: [/welcome\s*box/i, /велком\s*бокс/i],
    matchProduct: (t) => /welcome\s*box|велком/i.test(t),
  },
  {
    slug: 'keychain',
    labelRu: 'брелок',
    briefMandatory: [/брелок|обвес/i],
    matchProduct: (t) => /брелок|обвес|keychain/i.test(t),
  },
  {
    slug: 'towel',
    labelRu: 'полотенце',
    briefMandatory: [/полотен[а-я]*/i],
    matchProduct: (t) => /полотен|towel/i.test(t),
  },
  {
    slug: 'apron',
    labelRu: 'фартук',
    briefMandatory: [/фартук[а-я]*/i],
    matchProduct: (t) => /фартук|apron/i.test(t),
  },
  {
    slug: 'calendar',
    labelRu: 'календарь',
    briefMandatory: [/календар[а-я]*/i],
    matchProduct: (t) => /календар|calendar/i.test(t),
  },
  {
    slug: 'sticker',
    labelRu: 'стикер',
    briefMandatory: [/стикер[а-я]*/i, /наклейк[а-я]*/i],
    matchProduct: (t) => /стикер|наклейк|sticker/i.test(t),
  },
  {
    slug: 'multitool',
    labelRu: 'мультитул',
    briefMandatory: [/мультитул|multi.?tool/i],
    matchProduct: (t) => /мультитул|multi.?tool/i.test(t),
  },
  {
    slug: 'socks',
    labelRu: 'носки',
    briefMandatory: [/носк[а-я]*/i],
    matchProduct: (t) => /носк|socks/i.test(t) && !/ручк/i.test(t),
  },
  {
    slug: 'lanyard',
    labelRu: 'ланьярд',
    briefMandatory: [/ланъярд|ланьярд|бейдж|lanyard/i],
    matchProduct: (t) => /ланьярд|бейдж|lanyard/i.test(t),
  },
  {
    slug: 'cosmetic_bag',
    labelRu: 'косметичка',
    briefMandatory: [/косметич/i],
    matchProduct: (t) => /косметич/i.test(t),
  },
  {
    slug: 'candle',
    labelRu: 'свеча',
    briefMandatory: [/свеч[а-яё]*/i, /аромат[а-яё]*\s*свеч/i],
    matchProduct: (t) => /свеч|candle|аромат.*свеч/i.test(t),
  },
  {
    slug: 'fitness',
    labelRu: 'фитнес',
    briefMandatory: [/фитнес.*резинк|резинк.*фитнес|фитнес.*набор/i],
    matchProduct: (t) => /фитнес|fitness|резинк.*спорт/i.test(t),
  },
  {
    slug: 'stress_ball',
    labelRu: 'антистресс',
    briefMandatory: [/антистресс/i, /мяч.*антистресс|антистресс.*мяч/i],
    matchProduct: (t) => /антистресс|stress.*ball|squeeze/i.test(t),
  },
  {
    slug: 'christmas_decor',
    labelRu: 'новогодний декор',
    briefMandatory: [/ёлочн|елочн|новогод/i],
    matchProduct: (t) => /ёлочн|елочн|новогод|christmas|игрушк.*ёлк/i.test(t),
  },
  {
    slug: 'car_accessory',
    labelRu: 'автоаксессуар',
    briefMandatory: [/авто|машин|car\b/i],
    matchProduct: (t) => /шторк|авто|car\b|салон авто|подголовник/i.test(t),
  },
];

export function conceptTypeLabel(slug: string): string {
  return CONCEPT_TYPE_DEFINITIONS.find((d) => d.slug === slug)?.labelRu ?? slug;
}

export function productSlotsSignature(slots: Array<{ type: string }>): string {
  return [...slots.map((s) => s.type)].sort().join('|');
}

export function normalizeThemeAxis(axis: string | undefined | null): string {
  return String(axis ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

/** Подкатегория каталога → тип (точнее, чем только category) */
const SUBCATEGORY_TYPE_HINTS: Array<{ patterns: RegExp; slug: string }> = [
  { patterns: /плед|blanket|fleece/i, slug: 'blanket' },
  { patterns: /свеч|candle/i, slug: 'candle' },
  { patterns: /полотен|towel/i, slug: 'towel' },
  { patterns: /круж|mug\b/i, slug: 'mug' },
  { patterns: /фитнес|fitness|резинк/i, slug: 'fitness' },
  { patterns: /антистресс|squeeze|stress/i, slug: 'stress_ball' },
  { patterns: /календар|calendar/i, slug: 'calendar' },
  { patterns: /фартук|apron/i, slug: 'apron' },
  { patterns: /термостакан|термокруж/i, slug: 'tumbler' },
  { patterns: /шариков|роллер|перьев|ручк/i, slug: 'pen' },
  { patterns: /карандаш|маркер/i, slug: 'pencil' },
  { patterns: /футболк|оверсайз/i, slug: 'tshirt' },
  { patterns: /худи|свитшот/i, slug: 'hoodie' },
  { patterns: /кепк|бейсболк/i, slug: 'cap' },
  { patterns: /панам|bucket/i, slug: 'bucket_hat' },
  { patterns: /солнцезащит|sunglass|eyewear|(?:^|[^\p{L}\p{N}])очки/iu, slug: 'sunglasses' },
  { patterns: /дождевик|ветровк/i, slug: 'raincoat' },
  { patterns: /косметич/i, slug: 'cosmetic_bag' },
  { patterns: /ёлочн|елочн|новогод/i, slug: 'christmas_decor' },
  { patterns: /шторк|авто|car\b/i, slug: 'car_accessory' },
  { patterns: /термокруж/i, slug: 'thermos_mug' },
  { patterns: /термос/i, slug: 'thermos' },
  { patterns: /бутыл/i, slug: 'bottle' },
  { patterns: /круж|стакан|чайн[а-я]*\s*пар/i, slug: 'mug' },
  { patterns: /ежедневник/i, slug: 'diary' },
  { patterns: /блокнот/i, slug: 'notebook' },
  { patterns: /power\s*bank|пауэр|аккумулятор|зарядн|wireless\s*charg/i, slug: 'powerbank' },
  { patterns: /флеш|usb|flash/i, slug: 'flash_drive' },
  { patterns: /колонк|speaker|наушник/i, slug: 'speaker' },
  { patterns: /рюкзак/i, slug: 'backpack' },
  { patterns: /шоппер/i, slug: 'shopper' },
  { patterns: /сумк|тоут/i, slug: 'bag' },
  { patterns: /зонт/i, slug: 'umbrella' },
  { patterns: /ланьярд|бейдж/i, slug: 'lanyard' },
  { patterns: /брелок|обвес|keychain/i, slug: 'keychain' },
  { patterns: /визитниц/i, slug: 'cardholder' },
  { patterns: /стакан|cup\b/i, slug: 'tumbler' },
  { patterns: /мультитул|multi.?tool|набор инструмент/i, slug: 'multitool' },
  { patterns: /стикер|наклейк|sticker/i, slug: 'sticker' },
  { patterns: /носк|socks/i, slug: 'socks' },
  { patterns: /подушк|pillow|cushion/i, slug: 'other' },
  { patterns: /контейнер|lunch.?box|ланч/i, slug: 'other' },
  { patterns: /набор для заметок|sticky|стикер/i, slug: 'notebook' },
  { patterns: /портплед|garment bag|чехол для костюм/i, slug: 'bag' },
];

export function detectConceptProductType(product: CatalogProduct): string {
  const nameNorm = normalizeText(product.name ?? '');
  const primary = detectPrimaryTypeFromName(nameNorm);
  if (primary) return primary;

  const role = detectProductRole(product);
  if (role.legacyType !== 'other') return role.legacyType;

  const text = productSearchText(product);
  const sub = normalizeText(product.subcategory ?? '');
  for (const hint of SUBCATEGORY_TYPE_HINTS) {
    if (hint.patterns.test(sub) || hint.patterns.test(text)) return hint.slug;
  }
  return 'other';
}

/** Приоритет по существительному-носителю в названии (плед в сумке → blanket, не bag) */
export function detectPrimaryTypeFromName(nameNorm: string): string | null {
  const n = nameNorm.trim();
  if (!n) return null;

  if (
    /^плед|плед[-\s]|плед\s+для|плед[-\s]подуш|флисовый\s+плед/i.test(n) ||
    (/плед|blanket|fleece/i.test(n) && !/портплед|portfolio/i.test(n))
  ) {
    return 'blanket';
  }
  if (/^блокнот|блокнот\s/i.test(n) || (/блокнот/i.test(n) && !/ежедневник/i.test(n))) {
    return 'notebook';
  }
  if (/ежедневник/i.test(n)) return 'diary';
  if (/термокруж/i.test(n)) return 'thermos_mug';
  if (/термостакан/i.test(n)) return 'tumbler';
  if (/термос/i.test(n)) return 'thermos';
  if (/^рюкзак/i.test(n)) return 'backpack';
  if (/^шоппер/i.test(n)) return 'shopper';
  if (/^сумк/i.test(n) && !/плед|блокнот/i.test(n)) return 'bag';

  return null;
}

/** Типы, удовлетворяющие mandatory slug (термос включает термокружку/термостакан) */
export function mandatoryTypeAliases(slug: string): string[] {
  switch (slug) {
    case 'thermos':
      return ['thermos', 'thermos_mug', 'tumbler'];
    case 'blanket':
      return ['blanket'];
    case 'mug':
      return ['mug', 'thermos_mug'];
    default:
      return [slug];
  }
}

export function hasMandatoryTypeInProducts(
  products: Array<{ name?: string } & CatalogProduct>,
  mandatorySlug: string,
): boolean {
  const aliases = new Set(mandatoryTypeAliases(mandatorySlug));
  return products.some((p) => aliases.has(detectConceptProductType(p as CatalogProduct)));
}

function extractExplicitMandatoryTypesFromBrief(brief: string): string[] {
  const text = normalizeText(brief);
  const found = new Set<string>();

  const sections = [
    text.match(/обязательн\w*[^.!?]{0,160}/i)?.[0] ?? '',
    text.match(/должн\w*\s+(?:быть|включать|содержать|состоять)[^.!?]{0,160}/i)?.[0] ?? '',
    text.match(/(?:такие?\s+как|включая|включить)\s+[^.!?]{0,120}/i)?.[0] ?? '',
  ].join(' ');

  const keywordMap: Array<{ re: RegExp; slug: string }> = [
    { re: /термос|термостакан|термокруж/i, slug: 'thermos' },
    { re: /плед/i, slug: 'blanket' },
    { re: /кружк/i, slug: 'mug' },
    { re: /полотен/i, slug: 'towel' },
    { re: /фартук/i, slug: 'apron' },
    { re: /календар/i, slug: 'calendar' },
  ];

  for (const { re, slug } of keywordMap) {
    if (re.test(sections) || re.test(text)) found.add(slug);
  }

  return [...found];
}

/** Семейства взаимоисключающих типов внутри одного набора */
const TYPE_FAMILIES: Record<string, string> = {
  // Carry
  bag: 'carry',
  shopper: 'carry',
  backpack: 'carry',
  // Headwear
  cap: 'headwear',
  bucket_hat: 'headwear',
  bandana: 'headwear',
  beanie: 'headwear',
  // Apparel
  tshirt: 'apparel',
  hoodie: 'apparel',
  raincoat: 'apparel',
  // Drinkware — максимум 1 на концепцию (кружка/бутылка/фляга/термос/стакан)
  bottle: 'drinkware',
  tumbler: 'drinkware',
  mug: 'drinkware',
  thermos: 'drinkware',
  thermos_mug: 'drinkware',
  tea_set: 'drinkware',
  // Stationery
  notebook: 'stationery',
  planner: 'stationery',
  diary: 'stationery',
  // Writing
  pen: 'writing',
  pencil: 'writing',
  // Textile accessories
  towel: 'textile_acc',
  apron: 'textile_acc',
  socks: 'textile_acc',
  // Уникальные семейства — один экземпляр на набор
  blanket: 'blanket_family',
  candle: 'candle_family',
  fitness: 'fitness_family',
  stress_ball: 'stress_ball_family',
  calendar: 'calendar_family',
  flash_drive: 'flash_drive_family',
  flash: 'flash_drive_family',
};

export function getProductTypeFamily(type: string): string {
  return TYPE_FAMILIES[type] ?? `unique:${type}`;
}

export function typeConflictsInSet(localTypes: Set<string>, candidateType: string): boolean {
  if (localTypes.has(candidateType)) return true;
  const family = getProductTypeFamily(candidateType);
  for (const existing of localTypes) {
    if (getProductTypeFamily(existing) === family) return true;
  }
  return false;
}

export const CATALOG_IDEATOR_TYPE_SLUGS = CONCEPT_TYPE_DEFINITIONS.map((d) => d.slug).filter(
  (s) => !['christmas_decor', 'car_accessory', 'keychain'].includes(s),
);

export function detectMandatoryConceptTypesFromBrief(brief: string): string[] {
  const text = normalizeText(brief);
  const altGroups = detectAlternativeTypeGroupsFromBrief(brief);
  const altOnly = new Set(altGroups.flat());
  const found = new Set<string>(extractExplicitMandatoryTypesFromBrief(brief));

  for (const def of CONCEPT_TYPE_DEFINITIONS) {
    const matched = def.briefMandatory.some((re) => re.test(text));
    if (!matched) continue;
    if (altOnly.has(def.slug) && !isTypeRequiredWithAnd(brief, def.slug)) continue;
    found.add(def.slug);
  }

  if (/обязательн\w*/i.test(brief) && /термос/i.test(text) && /плед/i.test(text)) {
    found.add('thermos');
    found.add('blanket');
  }

  return [...found];
}

/** Типы из сегмента «или A, или B» — в набор входит ровно один */
export function detectAlternativeTypeGroupsFromBrief(brief: string): string[][] {
  const text = brief.replace(/\s+/g, ' ').trim();
  if (!text) return [];

  const groups: string[][] = [];
  const seen = new Set<string>();

  const multiOrPattern =
    /(?:^|[\s,;.])(?:или\s+([^,;.\n]+?))(?:,\s*или\s+([^,;.\n]+?))+/gi;
  let match: RegExpExecArray | null;
  while ((match = multiOrPattern.exec(text)) !== null) {
    const segment = match[0];
    const types = typesFromBriefSegment(segment);
    if (types.length >= 2) {
      const key = [...types].sort().join('|');
      if (!seen.has(key)) {
        seen.add(key);
        groups.push(types);
      }
    }
  }

  const binaryOrPattern = /([^,;.\n]{2,60}?)\s+или\s+([^,;.\n]{2,60}?)(?=[,;.\n]|$)/gi;
  while ((match = binaryOrPattern.exec(text)) !== null) {
    const left = match[1].trim();
    const right = match[2].trim();
    if (/\bили\b/i.test(left) || /\bили\b/i.test(right)) continue;
    const types = [
      ...typesFromBriefSegment(left),
      ...typesFromBriefSegment(right),
    ];
    const unique = [...new Set(types)];
    if (unique.length >= 2) {
      const key = [...unique].sort().join('|');
      if (!seen.has(key)) {
        seen.add(key);
        groups.push(unique);
      }
    }
  }

  return groups;
}

function typesFromBriefSegment(segment: string): string[] {
  const norm = normalizeText(segment);
  const found: string[] = [];
  for (const def of CONCEPT_TYPE_DEFINITIONS) {
    if (def.briefMandatory.some((re) => re.test(norm)) || def.matchProduct(norm)) {
      if (!found.includes(def.slug)) found.push(def.slug);
    }
  }
  return found.filter((s) => CATALOG_IDEATOR_TYPE_SLUGS.includes(s));
}

function isTypeRequiredWithAnd(brief: string, slug: string): boolean {
  const def = CONCEPT_TYPE_DEFINITIONS.find((d) => d.slug === slug);
  if (!def) return false;
  const label = def.labelRu;
  const patterns = [
    new RegExp(`(?:и|а также|плюс|ещё|еще)\\s+[^,;.\n]{0,40}${label}`, 'i'),
    new RegExp(`${label}[^,;.\n]{0,40}\\s+и\\s+`, 'i'),
    new RegExp(`(?:нужн\\w*|обязательн\\w*|требу\\w*)[^,;.\n]{0,30}${label}`, 'i'),
  ];
  return patterns.some((re) => re.test(brief));
}

/** По одному типу из каждой альтернативной группы для концепции (вариация между 5 наборами) */
export function pickAlternativeTypesForConcept(
  groups: string[][],
  conceptIndex: number,
): string[] {
  const picked: string[] = [];
  for (let gi = 0; gi < groups.length; gi++) {
    const group = groups[gi].filter((t) => CATALOG_IDEATOR_TYPE_SLUGS.includes(t));
    if (!group.length) continue;
    const idx = (conceptIndex + gi * 2) % group.length;
    picked.push(group[idx]);
  }
  return picked;
}

export class ConceptDiversityTracker {
  private readonly usage = new Map<string, number>();

  constructor(private readonly mandatoryTypes: ReadonlySet<string>) {}

  canUseType(type: string): boolean {
    const used = this.usage.get(type) ?? 0;
    const limit = this.mandatoryTypes.has(type)
      ? MANDATORY_TYPE_MAX_CONCEPTS
      : OPTIONAL_TYPE_MAX_CONCEPTS;
    return used < limit;
  }

  recordConceptTypes(types: Iterable<string>): void {
    const seen = new Set<string>();
    for (const type of types) {
      if (seen.has(type)) continue;
      seen.add(type);
      this.usage.set(type, (this.usage.get(type) ?? 0) + 1);
    }
  }

  usageCount(type: string): number {
    return this.usage.get(type) ?? 0;
  }
}

function isProductSelectable(
  product: CatalogProduct,
  localTypes: Set<string>,
  tracker: ConceptDiversityTracker,
  blockedIds: Set<string>,
  blockedVariants: Set<string>,
  picked: CatalogProduct[],
): boolean {
  if (blockedIds.has(product.id)) return false;
  const vk = productVariantKey(product);
  if (blockedVariants.has(vk)) return false;
  if (picked.some((p) => p.id === product.id)) return false;
  const type = detectConceptProductType(product);
  if (typeConflictsInSet(localTypes, type)) return false;
  if (!tracker.canUseType(type)) return false;
  return true;
}

/** Подбор замены или дополнения с учётом типов в наборе и между концепциями */
export function pickDiverseProduct(
  catalog: CatalogProduct[],
  localTypes: Set<string>,
  tracker: ConceptDiversityTracker,
  blockedIds: Set<string>,
  blockedVariants: Set<string>,
  picked: CatalogProduct[],
  seed: number,
  scoreFn?: (product: CatalogProduct) => number,
): CatalogProduct | null {
  const pool = catalog
    .filter((p) =>
      isProductSelectable(p, localTypes, tracker, blockedIds, blockedVariants, picked),
    )
    .sort((a, b) => (scoreFn?.(b) ?? 0) - (scoreFn?.(a) ?? 0));

  if (!pool.length) return null;

  const top = pool.slice(0, Math.min(8, pool.length));
  const start = Math.abs(seed) % top.length;
  for (let i = 0; i < top.length; i++) {
    const product = top[(start + i) % top.length];
    if (isProductSelectable(product, localTypes, tracker, blockedIds, blockedVariants, picked)) {
      return product;
    }
  }
  return null;
}

/** Нормализует набор: без повторов типов внутри, с лимитами между концепциями */
export function enforceConceptSetDiversity(
  products: CatalogProduct[],
  catalog: CatalogProduct[],
  desiredCount: number,
  tracker: ConceptDiversityTracker,
  blockedIds: Set<string>,
  blockedVariants: Set<string>,
  seed: number,
  recordUsage = true,
  scoreFn?: (product: CatalogProduct) => number,
): CatalogProduct[] {
  const result: CatalogProduct[] = [];
  const localTypes = new Set<string>();

  for (const product of products) {
    const type = detectConceptProductType(product);
    const vk = productVariantKey(product);
    const valid =
      !typeConflictsInSet(localTypes, type) &&
      tracker.canUseType(type) &&
      !blockedIds.has(product.id) &&
      !blockedVariants.has(vk);

    if (valid) {
      result.push(product);
      localTypes.add(type);
      continue;
    }

    const replacement = pickDiverseProduct(
      catalog,
      localTypes,
      tracker,
      blockedIds,
      blockedVariants,
      result,
      seed + result.length,
      scoreFn,
    );
    if (replacement) {
      result.push(replacement);
      localTypes.add(detectConceptProductType(replacement));
    }
  }

  while (result.length < desiredCount) {
    const extra = pickDiverseProduct(
      catalog,
      localTypes,
      tracker,
      blockedIds,
      blockedVariants,
      result,
      seed + result.length * 7,
      scoreFn,
    );
    if (!extra) break;
    result.push(extra);
    localTypes.add(detectConceptProductType(extra));
  }

  if (recordUsage) {
    tracker.recordConceptTypes(result.map(detectConceptProductType));
  }
  return result.slice(0, desiredCount);
}
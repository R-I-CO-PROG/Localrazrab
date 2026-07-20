/**
 * Единый источник истины о типах товаров.
 *
 * Раньше тип/роль/семейство товара определялись в ТРЁХ разных местах с разными
 * правилами (detectConceptProductType, detectProductRole, три карты семейств).
 * Они расходились — например «футболка» и «худи» в одном гейте конфликтовали,
 * а в другом нет. Теперь всё выводится из одной таблицы TYPE_META и одного
 * детектора detectTypeSlug().
 */
import type { CatalogProduct } from '../providers/llm/catalog.util';

/** Грубая роль — для оценки разнообразия набора и лимита «прочих» товаров. */
export type ProductRole =
  | 'notebook'
  | 'pen'
  | 'writing'
  | 'drinkware'
  | 'powerbank'
  | 'tech_accessory'
  | 'bag'
  | 'headwear'
  | 'apparel'
  | 'gift_set'
  | 'welcome_pack'
  | 'food_drink'
  | 'home'
  | 'office'
  | 'packaging'
  | 'scarf'
  | 'socks'
  | 'towel'
  | 'other';

export interface ProductTypeMeta {
  /** Грубая роль. */
  role: ProductRole;
  /**
   * Семейство для правила «не больше одного на набор».
   * Товары одного семейства взаимоисключающи (кружка/бутылка/термос = drinkware).
   * Уникальные типы получают семейство `unique:<slug>`.
   */
  family: string;
  /** Вес при распределении бюджета набора по слотам. */
  budgetWeight: number;
  wearable?: boolean;
  tech?: boolean;
  office?: boolean;
  giftBundle?: boolean;
  /**
   * Крупногабаритный предмет — физически НЕ помещается в ложемент подарочной коробки
   * (чемодан/зонт-трость/большой рюкзак). На фото ставится РЯДОМ с коробкой, а не внутрь.
   */
  oversized?: boolean;
}

const UNIQUE = (slug: string) => `unique:${slug}`;

/**
 * Метаданные по каждому slug, который может вернуть detectTypeSlug().
 * family задаётся явно только когда тип входит в общее семейство;
 * иначе — уникальное семейство (один экземпляр на набор).
 */
export const TYPE_META: Record<string, ProductTypeMeta> = {
  // — Подарочные наборы (взаимоисключающи) —
  welcome_pack: { role: 'welcome_pack', family: 'bundle', budgetWeight: 2.2, giftBundle: true },
  welcome_box: { role: 'welcome_pack', family: 'bundle', budgetWeight: 2.2, giftBundle: true },
  gift_set: { role: 'gift_set', family: 'bundle', budgetWeight: 2.2, giftBundle: true },

  // — Нишевые гаджеты (честные типы вместо свалки в tech_accessory/other): улучшает
  //   role-дедуп и даёт контекст-гейту точную классификацию. Каждый — своё семейство. —
  flashlight: { role: 'other', family: 'unique:flashlight', budgetWeight: 0.8 },
  // Частые «прочие» — свои семейства, чтобы не повторялись во всех 5 наборах.
  headphones: { role: 'tech_accessory', family: 'unique:headphones', budgetWeight: 1.6, tech: true },
  folder: { role: 'office', family: 'unique:folder', budgetWeight: 1.1, office: true },
  clipboard: { role: 'office', family: 'unique:clipboard', budgetWeight: 0.9, office: true },
  organizer: { role: 'office', family: 'unique:organizer', budgetWeight: 1.0, office: true },
  phone_stand: { role: 'other', family: 'unique:phone_stand', budgetWeight: 0.8 },
  tool: { role: 'other', family: 'unique:tool', budgetWeight: 0.8 },
  car_holder: { role: 'other', family: 'unique:car_holder', budgetWeight: 0.7 },
  yoga_mat: { role: 'other', family: 'unique:yoga_mat', budgetWeight: 1.0 },
  mirror: { role: 'other', family: 'unique:mirror', budgetWeight: 0.7 },

  // — Напитки (одно «вместилище» на набор) —
  mug: { role: 'drinkware', family: 'drinkware', budgetWeight: 1.2 },
  bottle: { role: 'drinkware', family: 'drinkware', budgetWeight: 1.4 },
  thermos: { role: 'drinkware', family: 'drinkware', budgetWeight: 1.7 },
  thermos_mug: { role: 'drinkware', family: 'drinkware', budgetWeight: 1.3 },
  tumbler: { role: 'drinkware', family: 'drinkware', budgetWeight: 1.3 },
  tea_set: { role: 'drinkware', family: 'drinkware', budgetWeight: 1.5 },

  // — Барное (специфика, своё семейство, не мешает обычной кружке) —
  decanter: { role: 'home', family: UNIQUE('decanter'), budgetWeight: 1.8 },
  flask: { role: 'home', family: UNIQUE('flask'), budgetWeight: 1.4 },
  shaker: { role: 'home', family: UNIQUE('shaker'), budgetWeight: 1.3 },
  mortar: { role: 'home', family: UNIQUE('mortar'), budgetWeight: 1.4 },

  // — Переноска (одна сумка/рюкзак/чемодан на набор) —
  bag: { role: 'bag', family: 'carry', budgetWeight: 1.8 },
  shopper: { role: 'bag', family: 'carry', budgetWeight: 1.6 },
  backpack: { role: 'bag', family: 'carry', budgetWeight: 2.2, oversized: true },
  // Чемодан/дорожная сумка — крупногабарит, семейство carry (не сочетать с рюкзаком/сумкой).
  suitcase: { role: 'bag', family: 'carry', budgetWeight: 2.8, oversized: true },

  // — Головные уборы (одна шапка/кепка) —
  cap: { role: 'headwear', family: 'headwear', budgetWeight: 1.4, wearable: true },
  bucket_hat: { role: 'headwear', family: 'headwear', budgetWeight: 1.4, wearable: true },
  beanie: { role: 'headwear', family: 'headwear', budgetWeight: 1.4, wearable: true },
  bandana: { role: 'headwear', family: 'headwear', budgetWeight: 1.0, wearable: true },
  // Очки — НЕ конфликтуют с кепкой (своё семейство).
  sunglasses: { role: 'apparel', family: UNIQUE('sunglasses'), budgetWeight: 1.5, wearable: true },

  // — Одежда (футболка и худи МОГУТ быть в одном мерч-наборе → разные семейства) —
  tshirt: { role: 'apparel', family: UNIQUE('tshirt'), budgetWeight: 2.4, wearable: true },
  hoodie: { role: 'apparel', family: UNIQUE('hoodie'), budgetWeight: 2.6, wearable: true },
  raincoat: { role: 'apparel', family: UNIQUE('raincoat'), budgetWeight: 2.2, wearable: true },
  scarf: { role: 'scarf', family: UNIQUE('scarf'), budgetWeight: 1.4, wearable: true },
  socks: { role: 'socks', family: 'textile_acc', budgetWeight: 0.6, wearable: true },

  // — Канцелярия (один блокнот/ежедневник) + письменные (одна ручка) —
  notebook: { role: 'notebook', family: 'writing', budgetWeight: 1.3, office: true },
  diary: { role: 'writing', family: 'writing', budgetWeight: 1.5, office: true },
  pen: { role: 'pen', family: 'pen', budgetWeight: 0.55, office: true },
  pencil: { role: 'pen', family: 'pen', budgetWeight: 0.45, office: true },

  // — Техника —
  powerbank: { role: 'powerbank', family: 'powerbank', budgetWeight: 2.5, tech: true },
  flash: { role: 'tech_accessory', family: 'usb_storage', budgetWeight: 1.8, tech: true },
  flash_drive: { role: 'tech_accessory', family: 'usb_storage', budgetWeight: 1.8, tech: true },
  speaker: { role: 'tech_accessory', family: UNIQUE('speaker'), budgetWeight: 2.4, tech: true },
  projector: { role: 'tech_accessory', family: UNIQUE('projector'), budgetWeight: 2.6, tech: true },
  tech_accessory: { role: 'tech_accessory', family: UNIQUE('tech_accessory'), budgetWeight: 1.6, tech: true },
  watch: { role: 'tech_accessory', family: UNIQUE('watch'), budgetWeight: 2.0 },

  // — Текстиль/дом —
  // Полотенце — максимум одно на набор (иначе «полотенце+полотенце+полотенце»).
  towel: { role: 'towel', family: UNIQUE('towel'), budgetWeight: 1.0 },
  apron: { role: 'home', family: 'textile_acc', budgetWeight: 1.0 },
  blanket: { role: 'home', family: UNIQUE('blanket'), budgetWeight: 1.7 },
  pillow: { role: 'home', family: UNIQUE('pillow'), budgetWeight: 1.2 },
  candle: { role: 'home', family: UNIQUE('candle'), budgetWeight: 1.0 },
  cutting_board: { role: 'home', family: UNIQUE('cutting_board'), budgetWeight: 1.2 },
  cosmetic_bag: { role: 'office', family: UNIQUE('cosmetic_bag'), budgetWeight: 1.2 },

  // — Упаковка / филлер — не наполнение набора, а обёртка —
  packaging: { role: 'packaging', family: 'packaging', budgetWeight: 0.05 },
  cleaning_cloth: { role: 'packaging', family: 'packaging', budgetWeight: 0.05 },

  // — Прочее (каждое — своё уникальное семейство) —
  umbrella: { role: 'other', family: UNIQUE('umbrella'), budgetWeight: 1.6, oversized: true },
  calendar: { role: 'office', family: UNIQUE('calendar'), budgetWeight: 1.0, office: true },
  cardholder: { role: 'office', family: UNIQUE('cardholder'), budgetWeight: 1.0, office: true },
  lanyard: { role: 'office', family: UNIQUE('lanyard'), budgetWeight: 0.5 },
  keychain: { role: 'other', family: UNIQUE('keychain'), budgetWeight: 0.45 },
  sticker: { role: 'office', family: UNIQUE('sticker'), budgetWeight: 0.4 },
  multitool: { role: 'other', family: UNIQUE('multitool'), budgetWeight: 1.4 },
  fitness: { role: 'other', family: UNIQUE('fitness'), budgetWeight: 1.2 },
  // SLUG_RULES эмитит 'board_game' (настольные игры), но раньше здесь не было записи → тихо
  // проваливалось в DEFAULT_META (=other), теряя собственное семейство/variety-cap.
  board_game: { role: 'other', family: UNIQUE('board_game'), budgetWeight: 1.3 },
  stress_ball: { role: 'other', family: UNIQUE('stress_ball'), budgetWeight: 0.5 },
  christmas_decor: { role: 'home', family: UNIQUE('christmas_decor'), budgetWeight: 0.8 },
  car_accessory: { role: 'other', family: UNIQUE('car_accessory'), budgetWeight: 1.0 },
  other: { role: 'other', family: UNIQUE('other'), budgetWeight: 1.0 },
};

const DEFAULT_META: ProductTypeMeta = TYPE_META.other;

export function metaForType(slug: string): ProductTypeMeta {
  return TYPE_META[slug] ?? DEFAULT_META;
}

export function familyForType(slug: string): string {
  return metaForType(slug).family;
}

/**
 * КРУПНОЕ семейство для анти-повтора «зарядка/сумка/ручка/папка ВЕЗДЕ»: разные мелкие семейства
 * (плед/полотенце = «текстиль») человек воспринимает как одну группу. Немаппленные — сами себе.
 */
const COARSE_FAMILY: Record<string, string> = {
  drinkware: 'drink',
  carry: 'carry',
  pen: 'write',
  writing: 'paper', 'unique:folder': 'paper', 'unique:clipboard': 'paper', 'unique:calendar': 'paper', 'unique:cardholder': 'paper',
  powerbank: 'power',
  usb_storage: 'tech', 'unique:tech_accessory': 'tech', 'unique:headphones': 'tech', 'unique:speaker': 'tech', 'unique:watch': 'tech', 'unique:organizer': 'tech',
  'unique:blanket': 'textile', 'unique:towel': 'textile', 'unique:pillow': 'textile', textile_acc: 'textile', 'unique:scarf': 'textile',
  'unique:tshirt': 'apparel', 'unique:hoodie': 'apparel', 'unique:raincoat': 'apparel', headwear: 'apparel',
};
export function coarseFamilyOf(family: string): string {
  return COARSE_FAMILY[family] ?? family;
}
export function coarseFamilyForType(slug: string): string {
  return coarseFamilyOf(familyForType(slug));
}

export function roleForType(slug: string): ProductRole {
  return metaForType(slug).role;
}

export function budgetWeightForType(slug: string): number {
  return metaForType(slug).budgetWeight;
}

/** Крупногабаритный тип (чемодан/зонт-трость/большой рюкзак) — не помещается в ложемент. */
export function isOversizedType(slug: string): boolean {
  return metaForType(slug).oversized === true;
}

function normalizeText(text: unknown): string {
  return String(text ?? '').toLowerCase().replace(/ё/g, 'е');
}

function productSearchText(product: CatalogProduct): string {
  return normalizeText(`${product.name} ${product.description ?? ''} ${product.subcategory ?? ''}`);
}

function productHaystack(product: CatalogProduct): string {
  return normalizeText(
    `${product.name} ${product.description ?? ''} ${product.subcategory ?? ''} ${product.category ?? ''}`,
  );
}

/** Пишущая принадлежность. «ручек» — отдельно: беглая гласная, основа `ручк` его не ловит. */
const WRITING_ITEM_RE =
  /(?:ручк|ручек|роллер|шариков|перьев|карандаш|пишущ|канцеляр|(?<![а-яё])pen(?![а-яё]))/i;

/** Слаги пишущих принадлежностей — набор только из них остаётся ролью 'pen'. */
const WRITING_SLUGS = new Set(['pen', 'pencil']);

/**
 * Обёртка или сам бандл — не «предмет внутри набора». Признак берём из TYPE_META (семейство),
 * а не из списка слагов: иначе легко забыть филлер. Так `cleaning_cloth` (family `packaging`)
 * отсекается автоматически — без него «Набор: ручка и салфетка из микрофибры» переставал быть
 * ручкой и становился упаковкой, которую пост-гейты вычищают из набора.
 */
function isNonItemSlug(slug: string): boolean {
  if (slug === 'other') return true;
  const family = familyForType(slug);
  return family === 'packaging' || family === 'bundle';
}

/**
 * Упомянут ли в названии предмет, который не является пишущей принадлежностью.
 * Переиспользует SLUG_RULES как словарь «текст → предмет».
 *
 * ГРАНИЦА: словарь — только SLUG_RULES. Типы из SUBCATEGORY_TYPE_HINTS (брелок, визитница,
 * стикер, мультитул) здесь не видны, поэтому «Набор: ручка + брелок» останется ручкой. Частично
 * это подстраховано остаточным чёрным списком в ветке pen («часы», «зонт», «кофе»).
 */
function mentionsNonWritingItem(nameNorm: string): boolean {
  for (const rule of SLUG_RULES) {
    if (isNonItemSlug(rule.slug) || WRITING_SLUGS.has(rule.slug)) continue;
    if (rule.test(nameNorm)) return true;
  }
  return false;
}

/** Приоритет по существительному-носителю в названии (плед в сумке → blanket, не bag). */
export function detectPrimaryTypeFromName(nameNorm: string): string | null {
  const n = nameNorm.trim();
  if (!n) return null;

  // Пишущий НАБОР (ручка+роллер/карандаш, PEN&PEN, «набор из 2 ручек») — это РОЛЬ 'pen'
  // (семейство 'pen'), а не bundle. Иначе wouldDupeRole не ловит «две ручки» в наборе.
  //
  // Условие «не бандл» ПОЗИТИВНОЕ: в названии не упомянут ни один НЕпишущий предметный тип.
  // Прежде здесь стоял чёрный список вложений (плед|термос|кружка|сумка|часы|еда) — он
  // fail-open: «ежедневник», «блокнот», «аккумулятор», «флешка», «маска» в него не входили,
  // и готовый «Подарочный набор Рейн (ежедневник, ручка)» становился ручкой. На боевом
  // каталоге так ломались 111 из 1285 подарочных наборов: бандл занимал роль pen, не
  // опознавался как giftBundle и попадал ВНУТРЬ собираемого набора.
  // Чёрный список сохранён как дополнение — он ловит то, для чего нет правила в SLUG_RULES
  // («часы», «кофе»). См. gift-bundle-not-pen.spec.ts.
  if (
    /(?:набор|комплект|set|kit|pen\s*&\s*pen|pen&pen)/i.test(n) &&
    WRITING_ITEM_RE.test(n) &&
    !/(?:плед|термос|термокруж|кружк|стакан|бутыл|фляг|сумк|рюкзак|часы|чай|кофе|свеч|диффуз|косметич|зонт|повербанк|колонк)/i.test(n) &&
    !mentionsNonWritingItem(n)
  ) {
    return 'pen';
  }

  // Многосоставный подарочный набор — пусть классифицируется как gift_set,
  // а не по первому упомянутому вложению («набор с пледом и термокружкой»).
  if (/подарочн[а-яё]*\s+набор|gift\s*set|набор\s+[«"]/i.test(n)) return null;

  // Плед — только как товар-носитель, НЕ «подарочный набор с пледом».
  if (
    /^плед(?:[-\s]|$)|флисов[а-яё]*\s+плед/i.test(n) ||
    (/плед|blanket|fleece/i.test(n) && !/портплед|portfolio|набор|подарочн/i.test(n))
  ) {
    return 'blanket';
  }
  if (
    /^блокнот(?:[-\s]|$)/i.test(n) ||
    (/блокнот/i.test(n) && !/ежедневник|набор|подарочн/i.test(n))
  ) {
    return 'notebook';
  }
  if (/ежедневник/i.test(n)) return 'diary';
  if (/термокруж/i.test(n)) return 'thermos_mug';
  if (/термостакан/i.test(n)) return 'tumbler';
  if (/термос/i.test(n)) return 'thermos';
  if (/чемодан|suitcase|\bбагаж|luggage|дорожн[а-яё]*\s+сумк/i.test(n)) return 'suitcase';
  if (/^рюкзак/i.test(n)) return 'backpack';
  if (/^шоппер/i.test(n)) return 'shopper';
  if (/^сумк/i.test(n) && !/плед|блокнот/i.test(n)) return 'bag';

  return null;
}

/**
 * Правила распознавания по полному тексту, в порядке приоритета (специфичные — раньше).
 * Порт из прежних ROLE_RULES + SUBCATEGORY_TYPE_HINTS, объединённых в один список.
 */
const SLUG_RULES: Array<{ slug: string; test: (t: string) => boolean }> = [
  { slug: 'welcome_pack', test: (t) => /welcome\s*pack|велком\s*пак|simple\s*kit/i.test(t) },
  {
    // Упаковка — это ОБЁРТКА, не наполнение набора (отсекается в catalog-filter.util). Кириллица:
    // `[а-яё]*`, а не `\w*` (тот не матчит кириллицу). Ловим и «подарочная коробка», и «крышка-дно»/
    // «без ложемента» (сама коробка), НЕ трогая сумки/рюкзаки.
    slug: 'packaging',
    test: (t) =>
      (/мешоч|мешок\s+(?:из\s+)?(?:спанбонд|сатин|л[её]н|лент|organza|атлас)|подарочн[а-яё]*\s+(?:меш|упаков|пакет|короб)|коробк[а-яё]*\s+(?:для\s+)?подароч|(?:крышка[\s-]*дно|без\s+ложемент|с\s+ложемент)|(?:gift|подарочн)\s*bag|упаковочн|пакет\s+(?:из\s+)?(?:спанбонд|крафт)|зип.?pak|zip.?pak|коробк[аи]\s+(?:для\s+)?подар/i.test(
        t,
      )) && !/рюкзак|сумк|шоппер|backpack|тоут|tote/i.test(t),
  },
  {
    slug: 'cleaning_cloth',
    test: (t) =>
      /(?:очищающ|чистящ|cleansing|microfib).*салфет|салфетк.*(?:микрофибр|очист|экран|чист)|салфетка\s+(?:для|из)\s+микрофибр/i.test(
        t,
      ),
  },
  {
    slug: 'gift_set',
    test: (t) =>
      !/фитнес|fitness|спорт|cross|резинк|эспандер/i.test(t) &&
      !/набор\s+ключей|набор\s+инструмент/i.test(t) &&
      (/набор\s+(для|«|")/i.test(t) ||
        /комплект/i.test(t) ||
        /\bset\b|\bkit\b/i.test(t) ||
        /спортивный набор/i.test(t) ||
        /подарочн[а-яё]*\s+набор|gift\s*set|superbag\s*bubble|dreamy\s*hygge|cozy\s*hygge|тепл[а-яё]*\s+вечер|tea\s*time|набор\s+для\s+путешеств|набор\s+для\s+прогул|набор\s+warmth/i.test(t) ||
        /подарочные наборы|сеты/i.test(t) ||
        (/набор\s+[а-яёa-z]{3,}/i.test(t) &&
          /плед|термокруж|термос|свеч|диффузор|чай|hygge|comfort|shiny/i.test(t))),
  },
  { slug: 'scarf', test: (t) => /шарф|scarf/i.test(t) },
  { slug: 'socks', test: (t) => /носк|socks/i.test(t) && !/ручк/i.test(t) },
  { slug: 'towel', test: (t) => /полотенц|towel/i.test(t) && !/плед/i.test(t) },
  {
    slug: 'powerbank',
    // \bмач\b — МЁРТВЫЙ регекс: JS \w (и, следовательно, \b) не покрывает кириллицу, поэтому
    // граница слова никогда не срабатывает рядом с «мач» («5000 мАч» никогда не матчился).
    // Лукбихайнд/лукахед по кириллице — корректная замена.
    test: (t) => /power\s*bank|powerbank|пауэр[\s-]?банк|повер[\s-]?банк|пауэр|зарядн\w*\s+устрой|аккумулятор|(?<![а-яё])мач(?![а-яё])|\bmah\b/i.test(t),
  },
  // Нишевые гаджеты — ДО tech_accessory (иначе «держатель телефона» ушёл бы в tech_accessory,
  // а «коврик для йоги» в other). Имя авторитетнее категории-фолбэка.
  { slug: 'yoga_mat', test: (t) => /коврик/i.test(t) && /йог|фитнес|пилат|гимнаст/i.test(t) && !/для\s*мыш|придверн|прикроватн/i.test(t) },
  // tool: отвёртки/биты, но НЕ сувенирная «отвёртка-брелок» (это keychain).
  { slug: 'tool', test: (t) => /отв[её]рт|шуруповерт|(?:набор|комплект)\s*бит(?![а-яё])/i.test(t) && !/брелок|сувенир/i.test(t) },
  // car_holder: только явно автомобильный держатель (настольную подставку не крадём у tech_accessory).
  { slug: 'car_holder', test: (t) => /автодержател|автомобильн[а-яё]*\s*держател/i.test(t) },
  // flashlight: только НАСТОЯЩИЙ фонарик (тактический/налобный/с люменами), не «ручка/брелок/повербанк с фонариком» и не декоративный «фонарь».
  {
    slug: 'flashlight',
    test: (t) =>
      (/(?<![а-яё])фонарик|flashlight|налобн[а-яё]*\s*фонар|тактическ[а-яё]*\s*фонар|фонар[а-яё]*[\s,«»"]*(?:\d+\s*)?(?:лм\b|люмен|led\b)/i.test(t)) &&
      !/ручк|брелок|повер|power|кружк|термо|блокнот|сумк|садов|уличн|декоратив|ночник|гирлянд/i.test(t),
  },
  { slug: 'mirror', test: (t) => /космет[а-яё]*\s*зеркал|зеркал[а-яё]*\s*(?:космет|для\s*макияж)|makeup\s*mirror/i.test(t) && !/задн[а-яё]*\s*вид|заднего/i.test(t) },
  // Частые «other»-товары — реальные типы, чтобы variety-cap не давал им повторяться во всех 5
  // наборах (папка/органайзер/наушники/планшет-для-бумаг/подставка «везде» = жалоба на однообразие).
  { slug: 'headphones', test: (t) => /наушник|headphone|(?<![а-яё])tws(?![а-яё])|earbud|гарнитур/i.test(t) },
  { slug: 'folder', test: (t) => /(?<![а-яё])папк[аи]|conference\s*folder|document\s*folder|портфел[ья]/i.test(t) && !/меню/i.test(t) },
  { slug: 'clipboard', test: (t) => /планшет[а-яё]*\s*(?:a4|а4|для\s*бумаг|с\s*зажим)|(?<![а-яё])клипборд|доск[аи]\s*с\s*зажим/i.test(t) },
  { slug: 'organizer', test: (t) => /органайзер/i.test(t) && !/ежедневник|планинг/i.test(t) },
  { slug: 'phone_stand', test: (t) => /подставк[а-яё]*\s*(?:для\s*)?(?:телефон|смартфон|планшет|гаджет)|держатель\s*(?:для\s*)?(?:телефон|смартфон)(?!.*авто)/i.test(t) },
  {
    slug: 'tech_accessory',
    test: (t) =>
      /кабел|адаптер|charger|usb-c|type-c|хаб|hub|держател\w*\s+телефон/i.test(t) &&
      !/power\s*bank|powerbank|пауэр[\s-]?банк|повер[\s-]?банк|пауэр/i.test(t),
  },
  {
    slug: 'blanket',
    test: (t) =>
      (/^плед|плед[-\s]|плед\s+для|плед[-\s]подуш|флисовый\s+плед/i.test(t.trim()) ||
        (/плед|blanket|fleece/i.test(t) && !/портплед|portfolio/i.test(t))) &&
      !/полотенц|кухонн/i.test(t),
  },
  // Флешка — это ФЛЕШКА, а не её сувенирная форма. «Флешка в виде футболки/ручки/патрона»
  // раньше типизировалась по слову-форме (tshirt/pen) и обходила usb_storage-variety-cap →
  // повтор флешек в 4/5 наборов. Ловим «флеш» в начале слова ДО shape-правил.
  { slug: 'flash', test: (t) => /(?:^|[^а-яё])фл[еэ]ш|usb[\s-]*фл[еэ]ш|фл[еэ]ш[\s-]*карт|flash\s*drive/i.test(t) },
  {
    slug: 'notebook',
    test: (t) => /^блокнот|блокнот\s/i.test(t.trim()) || (/блокнот/i.test(t) && !/ежедневник/i.test(t)),
  },
  { slug: 'diary', test: (t) => /ежедневник/i.test(t) },
  // pen ловит «ручк», но «ручка» бывает дужкой/держателем у ёмкости или сумки
  // («кружка с ручкой-карабином», «сумка с ручками») — такие товары НЕ пишущая ручка.
  {
    slug: 'pen',
    test: (t) =>
      /ручк|шариков|роллер|перьев/i.test(t) &&
      !/powerbank|блокнот|круж|стакан|термос|бутыл|карабин|сумк|шоппер|рюкзак|чемодан|зонт|чайник/i.test(t),
  },
  { slug: 'pencil', test: (t) => /карандаш|маркер/i.test(t) },
  { slug: 'thermos_mug', test: (t) => /термокруж/i.test(t) },
  { slug: 'tumbler', test: (t) => /термостакан/i.test(t) },
  { slug: 'thermos', test: (t) => /термос/i.test(t) && !/термокруж|термостакан/i.test(t) },
  { slug: 'bottle', test: (t) => /бутыл/i.test(t) },
  {
    slug: 'tea_set',
    test: (t) => /чайн[а-я]*\s*пар/i.test(t),
  },
  {
    slug: 'mug',
    // Раньше голое «/бамбуков/» без сопутствующего drinkware-существительного классифицировало
    // ЛЮБОЙ бамбуковый товар (разделочную доску, органайзер, колонку) как кружку. Требуем
    // совместного упоминания сосуда — бамбук лишь материал-уточнение.
    test: (t) =>
      (/круж|стакан|mug|cup/i.test(t) || /бамбуков[а-яё]*\s*(?:круж|стакан|чашк|mug|cup)/i.test(t)) &&
      !/термос|термостакан|термокруж|бутыл|чайн[а-я]*\s*пар/i.test(t),
  },
  { slug: 'cap', test: (t) => /кепк|бейсболк|baseball cap/i.test(t) && !/панам|bucket/i.test(t) },
  { slug: 'bucket_hat', test: (t) => /панам|bucket/i.test(t) },
  { slug: 'tshirt', test: (t) => /футболк|tshirt|t-shirt|oversize|оверсайз/i.test(t) && !/поло/i.test(t) },
  { slug: 'hoodie', test: (t) => /худи|hoodie|свитшот|лонгслив|толстовк/i.test(t) },
  { slug: 'suitcase', test: (t) => /чемодан|suitcase|\bбагаж|luggage/i.test(t) },
  { slug: 'backpack', test: (t) => /рюкзак|backpack/i.test(t) },
  { slug: 'shopper', test: (t) => /шоппер/i.test(t) },
  {
    slug: 'bag',
    test: (t) =>
      (/сумк|тоут|tote|superbag/i.test(t) || /\bbag\b/i.test(t)) &&
      !/рюкзак|шоппер|блокнот|пенал|косметич|плед|blanket/i.test(t),
  },
  { slug: 'pillow', test: (t) => /подушк|pillow/i.test(t) },
  { slug: 'cutting_board', test: (t) => /разделочн|доска\s+для\s+нарез/i.test(t) },
  { slug: 'cosmetic_bag', test: (t) => /косметич/i.test(t) },
  // настольные/детские игры: без своего типа они падали в fallback-хинт «спорт» → fitness
  { slug: 'board_game', test: (t) => /настольн[а-яё]*\s*игр|набор\s*игр|(?:^|[^а-яё])игра(?![а-яё])|домино|(?<![а-яё])шахмат|(?<![а-яё])нард[ыа]?(?![а-яё])/i.test(t) },
  { slug: 'flash', test: (t) => /флеш|usb flash|flash drive/i.test(t) && !/powerbank|заряд|аккумулятор/i.test(t) },
  { slug: 'speaker', test: (t) => /колонк|speaker|bluetooth/i.test(t) },
  {
    slug: 'sunglasses',
    test: (t) =>
      (/солнцезащит|sunglass|eyewear/i.test(t) ||
        /(?:^|[^\p{L}\p{N}])очки(?:[а-я]*)(?:[^\p{L}\p{N}]|$)/iu.test(t)) &&
      !/очистител|линз|кепк|бейсболк|панам/i.test(t),
  },
];

/** Подкатегория/текст → тип (запасной слой, когда основные правила молчат). */
const SUBCATEGORY_TYPE_HINTS: Array<{ patterns: RegExp; slug: string }> = [
  { patterns: /фитнес|fitness|резинк|спорт|sport/i, slug: 'fitness' },
  { patterns: /антистресс|squeeze|stress/i, slug: 'stress_ball' },
  { patterns: /здоров|wellness|массаж|медицин|витамин/i, slug: 'fitness' },
  { patterns: /домашн|household|бытов|для дома/i, slug: 'candle' },
  { patterns: /текстил|плед|полотенц/i, slug: 'towel' },
  { patterns: /календар|calendar/i, slug: 'calendar' },
  { patterns: /фартук|apron/i, slug: 'apron' },
  { patterns: /дождевик|ветровк/i, slug: 'raincoat' },
  { patterns: /ёлочн|елочн|новогод/i, slug: 'christmas_decor' },
  { patterns: /шторк|авто|car\b/i, slug: 'car_accessory' },
  { patterns: /декантер|decanter/i, slug: 'decanter' },
  { patterns: /ступк|mortar|pestle/i, slug: 'mortar' },
  { patterns: /штоф|flask|carafe|графин|фляжк|(?<![а-яё])фляг/i, slug: 'flask' },
  { patterns: /шейкер|shaker/i, slug: 'shaker' },
  { patterns: /проектор|projector/i, slug: 'projector' },
  { patterns: /зонт/i, slug: 'umbrella' },
  { patterns: /ланьярд|бейдж/i, slug: 'lanyard' },
  { patterns: /брелок|обвес|keychain/i, slug: 'keychain' },
  { patterns: /визитниц/i, slug: 'cardholder' },
  { patterns: /часы/i, slug: 'watch' },
  { patterns: /мультитул|multi.?tool|набор инструмент/i, slug: 'multitool' },
  { patterns: /стикер|наклейк|sticker/i, slug: 'sticker' },
  { patterns: /свеч|candle/i, slug: 'candle' },
  { patterns: /контейнер|lunch.?box|ланч/i, slug: 'other' },
  { patterns: /портплед|garment bag|чехол для костюм/i, slug: 'bag' },
];

/**
 * ВСЕ слаги, которые классификатор МОЖЕТ вернуть (SLUG_RULES + SUBCATEGORY_TYPE_HINTS) — для
 * build-time проверки консистентности (см. product-taxonomy.spec.ts): каждый такой слаг обязан
 * иметь СВОЮ запись в TYPE_META, иначе он тихо коллапсирует в DEFAULT_META (см. регресс board_game:
 * SLUG_RULES эмитил тип, у которого не было записи, и он схлопывался с общим 'other').
 */
export function allClassifierSlugs(): string[] {
  return [...new Set([...SLUG_RULES.map((r) => r.slug), ...SUBCATEGORY_TYPE_HINTS.map((h) => h.slug)])];
}

const productTypeCache = new Map<string, string>();

const colorHintsCache = new Map<string, string[]>();

/** Сброс кэшей типов/цветов (новый discoverConcepts / обновление каталога). */
export function clearProductTypeCache(): void {
  productTypeCache.clear();
  colorHintsCache.clear();
}

/** Единый детектор: товар → slug типа. */
export function detectTypeSlug(product: CatalogProduct): string {
  const cached = productTypeCache.get(product.id);
  if (cached) return cached;

  const slug = computeTypeSlug(product);
  productTypeCache.set(product.id, slug);
  return slug;
}

function computeTypeSlug(product: CatalogProduct): string {
  const nameNorm = normalizeText(product.name ?? '');
  const primary = detectPrimaryTypeFromName(nameNorm);
  if (primary) return primary;

  // 1) По НАЗВАНИЮ — самый надёжный сигнал. Категория-бакет («Термосы и бутылки»)
  //    и описание (ручки сумки) НЕ участвуют здесь, иначе бутылка→thermos, сумка→pen.
  for (const rule of SLUG_RULES) {
    if (rule.test(nameNorm)) return rule.slug;
  }

  // 2) Затем по названию+описанию+подкатегории (без категории-бакета).
  const text = productSearchText(product);
  for (const rule of SLUG_RULES) {
    if (rule.test(text)) return rule.slug;
  }

  // ⚠️ В этом каталоге subcategory хранит ПОЛНЫЙ breadcrumb-путь, включающий имя корневой
  // категории («Для дома / Инструменты и мультитулы / Рулетки»). Поэтому проверка по sub/text
  // ловит те же слишком общие паттерны («для дома»→candle, «текстиль»→towel), что и чисто
  // категорийный фолбэк ниже — рулетка/мультитул с категорией «Для дома» иначе тоже
  // классифицировались бы как свеча. Для этих НЕБЕЗОПАСНЫХ слагов требуем корроборации ИМЕНЕМ.
  const sub = normalizeText(product.subcategory ?? '');
  for (const hint of SUBCATEGORY_TYPE_HINTS) {
    if (hint.patterns.test(sub) || hint.patterns.test(text)) {
      if (CATEGORY_ONLY_UNSAFE_SLUGS.has(hint.slug) && !hint.patterns.test(nameNorm)) continue;
      return hint.slug;
    }
  }

  const category = normalizeText(product.category ?? '');
  for (const hint of SUBCATEGORY_TYPE_HINTS) {
    if (hint.patterns.test(category)) {
      // Категория — САМЫЙ широкий сигнал (сюда доходим только если ни имя, ни описание, ни
      // подкатегория не дали совпадения). Часть паттернов слишком общая для одной лишь категории
      // («для дома»→candle, «текстиль»→towel) и назначала КОНКРЕТНЫЙ неверный тип целому классу
      // разнородных товаров. На чисто категорийном фолбэке такие паттерны деградируют до
      // безопасного 'other', а не самозванного точного slug.
      if (CATEGORY_ONLY_UNSAFE_SLUGS.has(hint.slug)) return 'other';
      return hint.slug;
    }
  }

  return 'other';
}

/** Слаги, назначение которых ТОЛЬКО по категории/breadcrumb-подкатегории (без корроборации
 *  именем) слишком рискованно — категория шире, чем конкретный товар («Текстиль» ⊃ шарфы/
 *  фартуки/пледы, «Для дома» ⊃ рулетки/мультитулы, не только свечи/полотенца). */
const CATEGORY_ONLY_UNSAFE_SLUGS = new Set(['candle', 'towel']);

/** Конфликт типов внутри одного набора (по семейству). */
export function typeConflictsInSet(localTypes: Set<string>, candidateType: string): boolean {
  if (localTypes.has(candidateType)) return true;
  const family = familyForType(candidateType);
  for (const existing of localTypes) {
    if (familyForType(existing) === family) return true;
  }
  return false;
}

export function colorHintsFromProduct(product: CatalogProduct): string[] {
  const cached = colorHintsCache.get(product.id);
  if (cached) return cached;
  const hints: string[] = [];
  for (const c of product.colors ?? []) {
    const label =
      typeof c === 'string'
        ? c
        : typeof c === 'object' && c
          ? String((c as { name?: string; hex?: string }).name ?? (c as { hex?: string }).hex ?? '')
          : '';
    if (label.trim()) hints.push(normalizeText(label));
  }
  const name = normalizeText(product.name);
  const colorWords = [
    'бел', 'черн', 'сер', 'син', 'голуб', 'красн', 'зелен', 'желт', 'оранж', 'розов',
    'беж', 'коричн', 'натуральн', 'молочн', 'бордов', 'фиолет',
    'white', 'black', 'grey', 'gray', 'blue', 'red', 'green', 'yellow', 'orange', 'pink',
  ];
  for (const w of colorWords) {
    if (name.includes(w)) hints.push(w);
  }
  const result = [...new Set(hints)];
  colorHintsCache.set(product.id, result);
  return result;
}

import type { CatalogProduct } from '../providers/llm/catalog.util';
import { catalogImbaPath } from './imba-category-overrides';

/**
 * Основные категории нового каталога (Product.category) для UI «можно предлагать».
 * Совпадают 1:1 с категориями каталога — подбор следует категориям напрямую.
 */
export const BRIEF_ALLOWED_BUCKETS = [
  'Одежда',
  'Сумки и рюкзаки',
  'Термосы и бутылки',
  'Кружки',
  'Ручки',
  'Ежедневники и блокноты',
  'Электроника',
  'Подарочные наборы',
  'Отдых и спорт',
  'Зонты',
  'Посуда',
  'Офис и канцелярия',
  'Сувениры и награды',
  'Солнцезащитные очки',
  'Свечи и подсвечники',
  'Аксессуары для путешествий',
  'Кошельки и монетницы',
  'Мультитулы',
  'Текстиль',
] as const;

export const BRIEF_FORBIDDEN_BUCKETS = [
  'Алкоголь',
  'Еда',
  'Одежда',
  'Косметика',
  'Стекло',
  'Другое',
] as const;

export type BriefAllowedBucket = (typeof BRIEF_ALLOWED_BUCKETS)[number];
export type BriefForbiddenBucket = (typeof BRIEF_FORBIDDEN_BUCKETS)[number];

type BucketRule = {
  /** Упрощённые категории Product.category (simplifyCategory при импорте) */
  categories: readonly string[];
  /** Доп. совпадение по subcategory / name / description */
  textRe?: RegExp;
  /** Совпадение по IMBA path (subcategory) */
  imbaPathRe?: RegExp;
};

const BUCKET_RULES: Record<BriefAllowedBucket, BucketRule> = {
  Одежда: {
    categories: ['Одежда'],
    textRe: /футболк|поло\b|худи|свитшот|свитер|джемпер|толстовк|лонгслив|кофт|куртк|ветровк|рубашк|брюк|шорт|бейсболк|\bкепк|панам|шапк|бандан|носк|шарф|перчат|apparel|t-?shirt|hoodie/i,
  },
  'Сумки и рюкзаки': {
    categories: ['Сумки и рюкзаки'],
    textRe: /сумк|рюкзак|шоппер|портфел|портплед|тоут|\btote\b|барсетк/i,
  },
  'Термосы и бутылки': {
    categories: ['Термосы и бутылки'],
    textRe: /термос|термокруж|термостакан|бутыл|фляг|flask|тамблер/i,
  },
  Кружки: {
    categories: ['Кружки'],
    textRe: /кружк|чашк|\bmug\b/i,
  },
  Ручки: {
    categories: ['Ручки', 'Для ручек'],
    textRe: /\bручк|роллер|шариков\w*\s+ручк|перьев\w*\s+ручк|\bpen\b/i,
  },
  'Ежедневники и блокноты': {
    categories: ['Ежедневники и блокноты', 'Для учебы и творчества'],
    textRe: /ежедневник|блокнот|записн\w*\s+книж|планинг|планер|тетрад|notebook|\bdiary\b/i,
  },
  Электроника: {
    categories: ['Электроника', 'Часы', 'Переходники для техники', 'Лампы', 'Фонари', 'Увлажнители'],
    textRe: /power\s*bank|пауэр|повер[\s-]?банк|заряд|аккумулятор|флеш|usb|flash|наушник|колонк|bluetooth|гаджет|кабел|адаптер|\bхаб\b|\bhub\b|лампа|фонар|проектор|увлажнител|\bчасы\b/i,
    imbaPathRe: /электроник/i,
  },
  'Подарочные наборы': {
    categories: ['Подарочные наборы'],
    textRe: /подарочн\w*\s+набор|welcome\s*(pack|box)|gift\s*set|набор\s+[«"]/i,
  },
  'Отдых и спорт': {
    categories: ['Отдых и спорт'],
    textRe: /спорт|фитнес|пикник|\bйог|туризм|поход|\bмяч|антистресс|эспандер|резинк.*фитнес/i,
  },
  Зонты: {
    categories: ['Зонты'],
    textRe: /зонт|umbrella/i,
  },
  Посуда: {
    categories: ['Посуда', 'Для алкоголя'],
    textRe: /посуд|тарелк|столов\w*\s+прибор|\bвилк|\bложк|бокал|декантер|шейкер|штопор|разделочн|контейнер|ланч.?бокс/i,
  },
  'Офис и канцелярия': {
    categories: ['Офис и канцелярия', 'Настольные приборы', 'Органайзеры'],
    textRe: /канцел|\bофис|степлер|скрепк|стикер|наклейк|\bпапк|органайзер|настольн\w*\s+прибор|линейк|маркер|карандаш/i,
    imbaPathRe: /письм|офисн|канцел/i,
  },
  'Сувениры и награды': {
    categories: ['Сувениры и награды', 'Пришивные патчи', 'Подвески', 'Шильды', 'Фигурки', 'Фоторамки'],
    textRe: /сувенир|наград|медал|значк|плакет|статуэтк|трофе|магнит|брелок|\bпатч|шильд|фоторамк/i,
  },
  'Солнцезащитные очки': {
    categories: ['Солнцезащитные очки', 'Чехлы и шкатулки для очков'],
    textRe: /солнцезащит|sunglass|eyewear|\bочки\b/i,
  },
  'Свечи и подсвечники': {
    categories: ['Свечи и подсвечники', 'Ароматические свечи', 'Ароматы для дома'],
    textRe: /свеч|подсвечник|аромадиффузор|диффузор|аромат\w*\s+(свеч|дом)|candle/i,
  },
  'Аксессуары для путешествий': {
    categories: [
      'Аксессуары для путешествий',
      'Несессеры',
      'Багажные бирки',
      'Маски для сна',
      'Надувные подушки',
      'Емкости для путешествий',
    ],
    textRe: /путешеств|\btravel\b|багаж|чемодан|несессер|маск\w*\s+для\s+сна|дорожн\w*\s+(набор|подушк|органайзер)/i,
  },
  'Кошельки и монетницы': {
    categories: [
      'Кошельки и монетницы',
      'Портмоне',
      'Кредитницы',
      'Визитницы и ключницы',
      'Зажимы для денег',
    ],
    textRe: /кошел|портмоне|кредитниц|визитниц|монетниц|зажим\w*\s+для\s+ден|картхолдер|cardholder/i,
  },
  Мультитулы: {
    categories: ['Мультитулы', 'Инструменты', 'Рулетки', 'Скребки'],
    textRe: /мультитул|multi.?tool|\bинструмент|отвертк|\bрулетк|складн\w*\s+нож/i,
  },
  Текстиль: {
    categories: ['Текстиль', 'Банные принадлежности'],
    textRe: /\bплед|полотенц|махров|банн\w*\s+(халат|набор)|\bтекстил/i,
  },
};

const FORBIDDEN_RULES: Record<BriefForbiddenBucket, BucketRule> = {
  Алкоголь: {
    categories: [],
    textRe: /алког|вино|виски|шампан|коньяк|виски|пив[оа]\b|whisky|wine|champagne/i,
  },
  Еда: {
    categories: [],
    textRe: /конфет|шоколад|сладост|печень|прян|чай\b|кофе\b|снек|food|snack|орех|мёд|мед\b/i,
  },
  Одежда: {
    categories: ['Одежда'],
    textRe: /футболк|поло\b|худи|свитшот|куртк|жилет|брюк|юбк|рубашк|плать|одежд|apparel|t-?shirt|hoodie/i,
  },
  Косметика: {
    categories: [],
    textRe: /космет|крем|парфюм|духи|шампун|лосьон|beauty/i,
  },
  Стекло: {
    categories: [],
    textRe: /стеклянн|glass\s+bottle|бокал|стакан\s+стекл/i,
  },
  Другое: {
    categories: ['Прочее'],
    textRe: undefined,
  },
};

/** Старые чипы UI и синонимы → новые бакеты-категории (сохранённые брифы и parse-brief) */
const LEGACY_ALLOWED_TO_BUCKET: Record<string, BriefAllowedBucket> = {
  // старые укрупнённые группы
  'Канцелярия и офис': 'Офис и канцелярия',
  'Посуда и напитки': 'Термосы и бутылки',
  'Электроника и гаджеты': 'Электроника',
  'Зонты и аксессуары': 'Зонты',
  'Эко-товары': 'Сумки и рюкзаки',
  // синонимы
  Канцелярия: 'Офис и канцелярия',
  Гаджеты: 'Электроника',
  Аксессуары: 'Кошельки и монетницы',
  Упаковка: 'Подарочные наборы',
  Эко: 'Сумки и рюкзаки',
  Очки: 'Солнцезащитные очки',
  Часы: 'Электроника',
  Свечи: 'Свечи и подсвечники',
  Текстиль: 'Текстиль',
  Одежда: 'Одежда',
};

function isAllowedBucket(value: string): value is BriefAllowedBucket {
  return (BRIEF_ALLOWED_BUCKETS as readonly string[]).includes(value);
}

function isForbiddenBucket(value: string): value is BriefForbiddenBucket {
  return (BRIEF_FORBIDDEN_BUCKETS as readonly string[]).includes(value);
}

export function normalizeBriefAllowedBuckets(items: string[]): BriefAllowedBucket[] {
  const out = new Set<BriefAllowedBucket>();
  for (const raw of items) {
    const item = raw?.trim();
    if (!item) continue;
    if (isAllowedBucket(item)) {
      out.add(item);
      continue;
    }
    const mapped = LEGACY_ALLOWED_TO_BUCKET[item];
    if (mapped) out.add(mapped);
  }
  return [...out];
}

export function normalizeBriefForbiddenBuckets(items: string[]): BriefForbiddenBucket[] {
  const out = new Set<BriefForbiddenBucket>();
  for (const raw of items) {
    const item = raw?.trim();
    if (!item) continue;
    if (isForbiddenBucket(item)) out.add(item);
    else if (item === 'Электроника') out.add('Другое'); // legacy: не дублируем с allowed
  }
  return [...out];
}

/**
 * Категория-бакет «можно предлагать», на которую ссылается свободнотекстовый ЗАПРЕТ целой
 * категории («зонты» → Зонты, «кружки» → Кружки, «свечи» → Свечи и подсвечники, «без электроники»
 * → Электроника). Сопоставляем по КОРНЮ ИМЕНИ бакета, НЕ по мягким keyword'ам: иначе «аккумуляторы»
 * (мягкое слово Электроники) ошибочно запретил бы ВСЮ электронику, тогда как нужно узко — семьёй
 * powerbank в catalog-forbidden-match. Служит двум целям: (1) запрет целой категории в подборе,
 * (2) страховка — убрать такой бакет из «можно», если LLM/скрипт ошибочно оставили его там.
 */
export function bucketsForCategoryTerm(term: string): BriefAllowedBucket[] {
  const t = (term ?? '').toLowerCase().replace(/ё/g, 'е').trim();
  if (!t) return [];
  const out = new Set<BriefAllowedBucket>();
  for (const exact of normalizeBriefAllowedBuckets([term])) out.add(exact);
  for (const bucket of BRIEF_ALLOWED_BUCKETS) {
    const name = bucket.toLowerCase().replace(/ё/g, 'е');
    for (const word of name.split(/[\s/]+/).filter(Boolean)) {
      // Корень слова из имени бакета (ловит падежи/мн.ч.: «зонты»/«зонтов» → «зонт»).
      const root = word.length > 6 ? word.slice(0, word.length - 2) : word.slice(0, 4);
      if (root.length >= 4 && t.includes(root)) {
        out.add(bucket);
        break;
      }
    }
  }
  return [...out];
}

function productHaystack(product: CatalogProduct): string {
  return `${product.category} ${product.subcategory ?? ''} ${product.name} ${product.description ?? ''}`.toLowerCase();
}

function matchesRule(product: CatalogProduct, rule: BucketRule): boolean {
  if (rule.categories.includes(product.category)) return true;
  const imbaPath = catalogImbaPath(product).toLowerCase();
  if (rule.imbaPathRe?.test(imbaPath)) return true;
  const hay = productHaystack(product);
  if (rule.textRe?.test(hay)) return true;
  return false;
}

export function productMatchesAllowedBucket(
  product: CatalogProduct,
  bucket: BriefAllowedBucket,
): boolean {
  return matchesRule(product, BUCKET_RULES[bucket]);
}

export function productMatchesForbiddenBucket(
  product: CatalogProduct,
  bucket: BriefForbiddenBucket,
): boolean {
  return matchesRule(product, FORBIDDEN_RULES[bucket]);
}

/** Жёсткий фильтр каталога по чипам «можно / нельзя» */
export function filterCatalogByBriefBuckets(
  catalog: CatalogProduct[],
  allowedItems: string[],
  forbiddenItems: string[],
): CatalogProduct[] {
  const allowed = normalizeBriefAllowedBuckets(allowedItems);
  const forbidden = normalizeBriefForbiddenBuckets(forbiddenItems);

  // ЖЁСТКО убираем forbidden-бакеты — это НИКОГДА не откатывается (fail-open вернул бы запрещённое).
  let forbiddenClean = [...catalog];
  for (const bucket of forbidden) {
    forbiddenClean = forbiddenClean.filter((p) => !productMatchesForbiddenBucket(p, bucket));
  }

  // Allowed-whitelist — мягче: если он опустошает пул, откатываем ТОЛЬКО whitelist до forbidden-clean,
  // но НИКОГДА до сырого каталога (иначе разом сбрасывались бы и whitelist, и forbidden-баны).
  if (allowed.length > 0) {
    const whitelisted = forbiddenClean.filter((p) =>
      allowed.some((bucket) => productMatchesAllowedBucket(p, bucket)),
    );
    if (whitelisted.length > 0) return whitelisted;
  }
  return forbiddenClean;
}

/** Мягкие ключевые слова для скоринга shortlist */
export const BUCKET_SOFT_KEYWORDS: Record<BriefAllowedBucket, string[]> = {
  Одежда: ['футболк', 'худи', 'свитшот', 'поло', 'кепк', 'носк'],
  'Сумки и рюкзаки': ['сумк', 'рюкзак', 'шоппер'],
  'Термосы и бутылки': ['термос', 'термокруж', 'бутылк', 'фляг'],
  Кружки: ['кружк', 'чашк', 'mug'],
  Ручки: ['ручк', 'роллер', 'pen'],
  'Ежедневники и блокноты': ['ежедневник', 'блокнот', 'планинг'],
  Электроника: ['powerbank', 'повербанк', 'аккумулятор', 'заряд', 'флеш', 'usb', 'колонк', 'наушник'],
  'Подарочные наборы': ['набор', 'welcome', 'подарочн'],
  'Отдых и спорт': ['спорт', 'фитнес', 'пикник', 'антистресс'],
  Зонты: ['зонт', 'umbrella'],
  Посуда: ['посуд', 'тарелк', 'бокал', 'разделочн'],
  'Офис и канцелярия': ['канцел', 'офис', 'органайзер', 'стикер'],
  'Сувениры и награды': ['сувенир', 'наград', 'медал', 'брелок'],
  'Солнцезащитные очки': ['очк', 'sunglass'],
  'Свечи и подсвечники': ['свеч', 'аромат', 'диффузор'],
  'Аксессуары для путешествий': ['путешеств', 'travel', 'багаж', 'несессер'],
  'Кошельки и монетницы': ['кошел', 'портмоне', 'визитниц', 'картхолдер'],
  Мультитулы: ['мультитул', 'инструмент', 'нож'],
  Текстиль: ['плед', 'полотенц', 'текстил'],
};

type RequiredCategoryRule = {
  textRe: RegExp;
  categories?: readonly string[];
};

const REQUIRED_CATEGORY_RULES: Record<string, RequiredCategoryRule> = {
  sweets: {
    textRe: /сладост|конфет|шоколад|прян|десерт|мармелад|леденец|вафл/i,
    categories: ['Еда', 'Подарочные наборы'],
  },
  tech_accessories: {
    textRe: /power\s*bank|пауэр|повер[\s-]?банк|заряд|аккумулятор|флеш|usb|flash|кабел|адаптер|хаб|hub|bluetooth|наушник|колонк|гаджет|tech/i,
    categories: ['Электроника'],
  },
  learning_materials: {
    textRe: /блокнот|ежедневник|записн|руководств|гайд|методич|учебн|книг|пособи/i,
    categories: ['Ежедневники и блокноты', 'Офис и канцелярия', 'Канцелярия'],
  },
  eco_products: {
    textRe: /эко|eco|бамбук|переработ|organic|хлопок|лён|джут|крафт/i,
    categories: ['Термосы и бутылки', 'Сумки и рюкзаки', 'Текстиль'],
  },
  premium_items: {
    textRe: /кож|металл|дерев|хрустал|премиум|vip|люкс|эксклюзив/i,
  },
  winter_accessory: {
    textRe: /шарф|перчатк|варежк|шапк|beanie|зимн\w*\s+аксессуар/i,
    categories: ['Одежда', 'Текстиль'],
  },
  sport: {
    textRe: /спорт|фитнес|коврик|эспандер|скакалк|мяч|антистресс.*спорт|йог/i,
    categories: ['Отдых и спорт'],
  },
  art: {
    textRe: /маркер|краск|кист|скетчбук|худож|рисован|палитр|карандаш.*цветн/i,
    categories: ['Офис и канцелярия', 'Для учебы и творчества'],
  },
  travel: {
    textRe: /дорожн\w*\s+набор|органайзер.*путешеств|несессер|багаж|travel/i,
    categories: ['Аксессуары для путешествий'],
  },
};

export function productMatchesRequiredCategory(product: CatalogProduct, categoryKey: string): boolean {
  const rule = REQUIRED_CATEGORY_RULES[categoryKey];
  if (!rule) return false;
  const hay = productHaystack(product);
  if (rule.textRe.test(hay)) return true;
  if (rule.categories?.some((c) => product.category === c)) {
    if (categoryKey === 'sweets') return /сладост|конфет|шоколад|прян/i.test(hay);
    return true;
  }
  return false;
}

export function countProductsInRequiredCategory(
  products: CatalogProduct[],
  categoryKey: string,
): number {
  return products.filter((p) => productMatchesRequiredCategory(p, categoryKey)).length;
}

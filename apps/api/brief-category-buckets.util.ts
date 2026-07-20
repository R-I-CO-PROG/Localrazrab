import type { CatalogProduct } from '../providers/llm/catalog.util';

/** Укрупнённые группы для UI брифа (макс. ~10) — не 1:1 с сотнями категорий IMBA */
export const BRIEF_ALLOWED_BUCKETS = [
  'Канцелярия и офис',
  'Посуда и напитки',
  'Сумки и рюкзаки',
  'Текстиль',
  'Электроника и гаджеты',
  'Подарочные наборы',
  'Сувениры и награды',
  'Зонты и аксессуары',
  'Отдых и спорт',
  'Эко-товары',
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
};

const BUCKET_RULES: Record<BriefAllowedBucket, BucketRule> = {
  'Канцелярия и офис': {
    categories: ['Ручки', 'Ежедневники и блокноты', 'Офис и канцелярия'],
    textRe: /ручк|карандаш|маркер|фломастер|блокнот|ежедневник|записн|канцел|офис|стикер|папк|ластик|скрепк|степлер|бейдж|ланьярд/i,
  },
  'Посуда и напитки': {
    categories: ['Кружки', 'Термосы и бутылки'],
    textRe: /кружк|стакан|термос|бутылк|фляж|посуд|чайник|бокал|термокруж/i,
  },
  'Сумки и рюкзаки': {
    categories: ['Сумки и рюкзаки'],
    textRe: /сумк|рюкзак|шоппер|портфел|портплед|косметичк|несессер/i,
  },
  Текстиль: {
    categories: ['Текстиль'],
    textRe: /текстил|шарф|платок|полотенц|плед|носок|перчат|бейсболк|кепк|панам|бандан/i,
  },
  'Электроника и гаджеты': {
    categories: ['Электроника', 'Часы'],
    textRe: /электрон|power\s*bank|пауэр|заряд|аккумулятор|флеш|usb|flash|наушник|колонк|bluetooth|смарт|час|гаджет/i,
  },
  'Подарочные наборы': {
    categories: ['Подарочные наборы'],
    textRe: /набор|welcome|подарочн|gift\s*set|комплект|упаковк|коробк/i,
  },
  'Сувениры и награды': {
    categories: ['Сувениры и награды'],
    textRe: /сувенир|наград|медал|брелок|значк|плакет|статуэтк|трофе|магнит/i,
  },
  'Зонты и аксессуары': {
    categories: ['Зонты', 'Часы'],
    textRe: /зонт|очк|sunglass|eyewear|зажим|клипс|визитниц|обложк|кошел/i,
  },
  'Отдых и спорт': {
    categories: ['Отдых и спорт'],
    textRe: /отдых|спорт|пикник|фитнес|игр|мяч|антистресс|йога|туризм|поход/i,
  },
  'Эко-товары': {
    categories: ['Термосы и бутылки', 'Сумки и рюкзаки', 'Кружки'],
    textRe: /эко|eco|bamboo|бамбук|переработ|recycle|organic|хлопок|лён|джут|крафт/i,
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

/** Старые чипы UI → новые бакеты (сохранённые брифы и parse-brief) */
const LEGACY_ALLOWED_TO_BUCKET: Record<string, BriefAllowedBucket> = {
  Ручки: 'Канцелярия и офис',
  Кружки: 'Посуда и напитки',
  'Ежедневники и блокноты': 'Канцелярия и офис',
  'Термосы и бутылки': 'Посуда и напитки',
  'Сумки и рюкзаки': 'Сумки и рюкзаки',
  Текстиль: 'Текстиль',
  Электроника: 'Электроника и гаджеты',
  'Подарочные наборы': 'Подарочные наборы',
  'Офис и канцелярия': 'Канцелярия и офис',
  'Сувениры и награды': 'Сувениры и награды',
  Зонты: 'Зонты и аксессуары',
  Часы: 'Зонты и аксессуары',
  'Отдых и спорт': 'Отдых и спорт',
  Посуда: 'Посуда и напитки',
  Канцелярия: 'Канцелярия и офис',
  Эко: 'Эко-товары',
  Гаджеты: 'Электроника и гаджеты',
  Аксессуары: 'Зонты и аксессуары',
  Упаковка: 'Подарочные наборы',
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

function productHaystack(product: CatalogProduct): string {
  return `${product.category} ${product.subcategory ?? ''} ${product.name} ${product.description ?? ''}`.toLowerCase();
}

function matchesRule(product: CatalogProduct, rule: BucketRule): boolean {
  if (rule.categories.includes(product.category)) return true;
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

  let filtered = [...catalog];

  if (allowed.length > 0) {
    filtered = filtered.filter((p) =>
      allowed.some((bucket) => productMatchesAllowedBucket(p, bucket)),
    );
  }

  for (const bucket of forbidden) {
    filtered = filtered.filter((p) => !productMatchesForbiddenBucket(p, bucket));
  }

  return filtered.length > 0 ? filtered : catalog;
}

/** Мягкие ключевые слова для скоринга shortlist */
export const BUCKET_SOFT_KEYWORDS: Record<BriefAllowedBucket, string[]> = {
  'Канцелярия и офис': ['ручк', 'блокнот', 'ежедневник', 'канцел', 'офис'],
  'Посуда и напитки': ['кружк', 'термос', 'бутылк', 'стакан', 'посуд'],
  'Сумки и рюкзаки': ['сумк', 'рюкзак', 'шоппер'],
  Текстиль: ['текстил', 'шарф', 'кепк', 'носок'],
  'Электроника и гаджеты': ['powerbank', 'заряд', 'флеш', 'usb', 'электрон', 'час'],
  'Подарочные наборы': ['набор', 'welcome', 'подарочн'],
  'Сувениры и награды': ['сувенир', 'наград', 'медал', 'брелок'],
  'Зонты и аксессуары': ['зонт', 'очк', 'аксессуар'],
  'Отдых и спорт': ['спорт', 'отдых', 'пикник', 'фитнес'],
  'Эко-товары': ['эко', 'eco', 'бамбук', 'переработ'],
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
    textRe: /power\s*bank|пауэр|заряд|аккумулятор|флеш|usb|flash|кабел|адаптер|хаб|hub|bluetooth|наушник|колонк|гаджет|tech/i,
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

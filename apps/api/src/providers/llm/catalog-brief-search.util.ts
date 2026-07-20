import type { Prisma } from '@prisma/client';

const BRIEF_PRODUCT_TERMS = [
  'кружк',
  'чаш',
  'стакан',
  'ручк',
  'блокнот',
  'ежедневник',
  'термос',
  'бутыл',
  'сумк',
  'рюкзак',
  'шоппер',
  'футболк',
  'худи',
  'кепк',
  'очк',
  'панам',
  'powerbank',
  'заряд',
  'флеш',
  'usb',
  'welcome',
  'зонт',
  'дождевик',
  'брелок',
  'плед',
  'полотенц',
  'фестивал',
  'летн',
  'зимн',
  'новогод',
  'мерч',
  'подар',
];

/** Ключевые слова из брифа для SQL-предфильтра (весь каталог 51k → релевантный срез в БД). */
export function extractBriefSearchTerms(brief: string, maxTerms = 14): string[] {
  const norm = String(brief ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е');
  const terms = new Set<string>();

  for (const kw of BRIEF_PRODUCT_TERMS) {
    if (norm.includes(kw)) terms.add(kw);
  }

  // Синонимы: в брифе пишут «повербанк/пауэрбанк/внешний аккумулятор», а в каталоге эти SKU
  // зовутся «аккумулятор»/«powerbank»/«зарядное». Без раскрытия SQL-предфильтр не поднимал
  // из 51k ни одного повербанка → набор шёл мимо названного товара.
  if (/повербанк|повер банк|пауэрбанк|пауэр банк|внешн[а-я]*\s+аккумулятор/i.test(norm)) {
    terms.add('powerbank');
    terms.add('аккумулятор');
    terms.add('заряд');
  }

  for (const token of norm.split(/[^\p{L}\p{N}]+/u)) {
    if (token.length >= 4 && !/^\d+$/.test(token)) {
      terms.add(token.slice(0, 32));
    }
  }

  return [...terms].slice(0, maxTerms);
}

/** OR-фильтр Prisma: имя / категория / описание содержит хотя бы один термин брифа. */
export function buildPrismaBriefSearchFilter(
  brief: string,
): Prisma.ProductWhereInput | null {
  const terms = extractBriefSearchTerms(brief);
  if (!terms.length) return null;

  const or: Prisma.ProductWhereInput[] = [];
  for (const term of terms) {
    or.push({ name: { contains: term, mode: 'insensitive' } });
    or.push({ category: { contains: term, mode: 'insensitive' } });
    if (term.length >= 5) {
      or.push({ description: { contains: term, mode: 'insensitive' } });
    }
  }

  return { OR: or };
}

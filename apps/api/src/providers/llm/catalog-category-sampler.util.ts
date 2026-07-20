/**
 * Стратифицированная выборка товаров по категориям.
 * Покрывает все 51k SKU через точечные запросы по индексированному полю Product.category.
 * Каждый запрос получает рандомный offset — у разных пользователей разные товары из одного пула.
 *
 * Реальные значения Product.category берутся из brief-category-buckets.util.ts (BUCKET_RULES).
 */
import type { Prisma } from '@prisma/client';

export interface CategoryBucket {
  /** Массив точных значений Product.category */
  categories: readonly string[];
  /** Максимальное кол-во товаров из этих категорий в один кэш-слот */
  quota: number;
  /** CATCH-ALL: категории, которые НАДО ИСКЛЮЧИТЬ (category NOT IN). Когда задан, `categories`
   *  игнорируется — бакет грузит всё, что НЕ перечислено в явных бакетах группы. Без него нишевые
   *  профильные категории (Фляги/Настольные игры/Гаджеты/Товары для дома) не грузились никогда. */
  notIn?: readonly string[];
}

/** Краткое имя группы для ключа кэша */
export function briefToCategoryGroup(brief: string): string {
  const b = brief.toLowerCase().replace(/ё/g, 'е');
  if (/разработчик|инженер|\bit\b|айти|tech|конференц|software|devops|программист|инновац/i.test(b)) return 'tech';
  if (/спорт|болельщик|фитнес|марафон|беговой|атлет/i.test(b)) return 'sport';
  if (/уют|hygge|тепл|плед|зимн.*подарок|подарок.*зим/i.test(b)) return 'cozy';
  if (/vip|инвестор|premium|премиум|luxury|банк|роскошн|эксклюзив/i.test(b)) return 'vip';
  if (/здоров|wellness|медицин|фарма|зож/i.test(b)) return 'health';
  if (/молодеж|студент|gen\s*z|зумер|ярк.*цвет|неон|фестивал/i.test(b)) return 'youth';
  if (/эколог|устойчив|бамбук|дерев|природ/i.test(b)) return 'eco';
  if (/пикник|outdoor.*обед|активн\w*.*отдых/i.test(b)) return 'outdoor';
  return 'general';
}

/**
 * Бакеты категорий для каждой темы.
 * Сумма quota по бакетам ≈ 8000–12000 (пул одного кэш-слота).
 * При кэш-хите делается in-memory shuffle → разные пользователи видят разное.
 */
export function getCategoryBuckets(group: string): CategoryBucket[] {
  const base = getBaseCategoryBuckets(group);
  // CATCH-ALL бакет: грузит нишевые категории, не покрытые явными бакетами группы (иначе профильный
  // SKU редкой категории физически недоступен нейро-байеру). Мусорные категории отфильтруются ниже
  // по релевантности/junk-гейту — здесь важно не потерять профильные. Скромная квота (шум ограничен).
  const covered = [...new Set(base.flatMap((b) => b.categories))];
  return [...base, { categories: [], notIn: covered, quota: 500 }];
}

function getBaseCategoryBuckets(group: string): CategoryBucket[] {
  switch (group) {
    case 'tech':
      return [
        { categories: ['Электроника', 'Часы', 'Переходники для техники', 'Лампы', 'Фонари', 'Увлажнители'], quota: 2200 },
        { categories: ['Ежедневники и блокноты', 'Для учебы и творчества', 'Офис и канцелярия', 'Настольные приборы', 'Органайзеры'], quota: 1800 },
        { categories: ['Ручки', 'Для ручек'], quota: 900 },
        { categories: ['Сумки и рюкзаки'], quota: 700 },
        { categories: ['Термосы и бутылки', 'Кружки'], quota: 600 },
        { categories: ['Аксессуары для путешествий', 'Несессеры', 'Багажные бирки'], quota: 400 },
        { categories: ['Отдых и спорт'], quota: 300 },
      ];
    case 'sport':
      return [
        { categories: ['Одежда'], quota: 2500 },
        { categories: ['Термосы и бутылки', 'Кружки'], quota: 1600 },
        { categories: ['Отдых и спорт'], quota: 1400 },
        { categories: ['Сумки и рюкзаки'], quota: 900 },
        { categories: ['Электроника', 'Часы'], quota: 600 },
        { categories: ['Текстиль', 'Банные принадлежности'], quota: 500 },
        { categories: ['Зонты'], quota: 300 },
      ];
    case 'cozy':
      return [
        { categories: ['Термосы и бутылки', 'Кружки', 'Посуда', 'Для алкоголя'], quota: 2400 },
        { categories: ['Текстиль', 'Банные принадлежности'], quota: 1800 },
        { categories: ['Одежда'], quota: 1400 },
        { categories: ['Отдых и спорт'], quota: 1000 },
        { categories: ['Свечи и подсвечники', 'Ароматические свечи', 'Ароматы для дома'], quota: 800 },
        { categories: ['Подарочные наборы'], quota: 500 },
      ];
    case 'vip':
      return [
        { categories: ['Кошельки и монетницы', 'Портмоне', 'Кредитницы', 'Визитницы и ключницы', 'Зажимы для денег'], quota: 1200 },
        { categories: ['Электроника', 'Часы'], quota: 1200 },
        { categories: ['Термосы и бутылки', 'Кружки', 'Посуда', 'Для алкоголя'], quota: 1200 },
        { categories: ['Ручки', 'Для ручек'], quota: 900 },
        { categories: ['Одежда'], quota: 800 },
        { categories: ['Сумки и рюкзаки'], quota: 800 },
        { categories: ['Подарочные наборы'], quota: 700 },
        { categories: ['Свечи и подсвечники', 'Ароматические свечи'], quota: 500 },
      ];
    case 'health':
      return [
        { categories: ['Отдых и спорт'], quota: 2400 },
        { categories: ['Термосы и бутылки', 'Кружки'], quota: 1800 },
        { categories: ['Текстиль', 'Банные принадлежности'], quota: 1200 },
        { categories: ['Электроника', 'Увлажнители'], quota: 700 },
        { categories: ['Ежедневники и блокноты'], quota: 600 },
        { categories: ['Сумки и рюкзаки'], quota: 500 },
        { categories: ['Аксессуары для путешествий'], quota: 400 },
      ];
    case 'youth':
      return [
        { categories: ['Одежда'], quota: 2800 },
        { categories: ['Электроника', 'Часы'], quota: 1600 },
        { categories: ['Сумки и рюкзаки'], quota: 900 },
        { categories: ['Офис и канцелярия', 'Ежедневники и блокноты', 'Для учебы и творчества'], quota: 900 },
        { categories: ['Отдых и спорт'], quota: 700 },
        { categories: ['Солнцезащитные очки', 'Чехлы и шкатулки для очков'], quota: 500 },
        { categories: ['Термосы и бутылки', 'Кружки'], quota: 500 },
      ];
    case 'eco':
      return [
        { categories: ['Текстиль', 'Банные принадлежности'], quota: 1800 },
        { categories: ['Термосы и бутылки', 'Кружки'], quota: 1600 },
        { categories: ['Ежедневники и блокноты', 'Для учебы и творчества', 'Офис и канцелярия'], quota: 1200 },
        { categories: ['Одежда'], quota: 1000 },
        { categories: ['Сумки и рюкзаки'], quota: 900 },
        { categories: ['Отдых и спорт'], quota: 700 },
        { categories: ['Ручки', 'Для ручек'], quota: 600 },
      ];
    case 'outdoor':
      return [
        { categories: ['Отдых и спорт'], quota: 2400 },
        { categories: ['Термосы и бутылки', 'Кружки', 'Посуда'], quota: 1800 },
        { categories: ['Одежда'], quota: 1400 },
        { categories: ['Сумки и рюкзаки'], quota: 900 },
        { categories: ['Электроника'], quota: 500 },
        { categories: ['Зонты'], quota: 500 },
        { categories: ['Аксессуары для путешествий'], quota: 300 },
      ];
    default: // general / office
      return [
        { categories: ['Ручки', 'Для ручек'], quota: 900 },
        { categories: ['Электроника', 'Часы', 'Переходники для техники', 'Лампы', 'Фонари'], quota: 1000 },
        { categories: ['Термосы и бутылки', 'Кружки'], quota: 1100 },
        { categories: ['Сумки и рюкзаки'], quota: 700 },
        { categories: ['Одежда'], quota: 700 },
        { categories: ['Ежедневники и блокноты', 'Для учебы и творчества', 'Офис и канцелярия', 'Настольные приборы', 'Органайзеры'], quota: 1000 },
        { categories: ['Подарочные наборы'], quota: 600 },
        { categories: ['Отдых и спорт'], quota: 700 },
        { categories: ['Текстиль', 'Банные принадлежности'], quota: 600 },
        { categories: ['Зонты'], quota: 300 },
        { categories: ['Аксессуары для путешествий', 'Несессеры'], quota: 400 },
        { categories: ['Сувениры и награды', 'Фигурки', 'Фоторамки'], quota: 400 },
      ];
  }
}

/**
 * Строит Prisma WHERE для одного бакета (добавляет category IN [...] к base-WHERE).
 */
export function bucketWhere(
  base: Prisma.ProductWhereInput,
  categories: readonly string[],
  notIn?: readonly string[],
): Prisma.ProductWhereInput {
  if (notIn?.length) return { ...base, category: { notIn: notIn as string[] } };
  return { ...base, category: { in: categories as string[] } };
}

/** Суммарная квота бакетов (размер пула в кэше). */
export function totalQuota(buckets: CategoryBucket[]): number {
  return buckets.reduce((s, b) => s + b.quota, 0);
}

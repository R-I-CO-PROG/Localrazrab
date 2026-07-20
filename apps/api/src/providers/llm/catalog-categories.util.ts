import {
  BRIEF_ALLOWED_BUCKETS,
  normalizeBriefAllowedBuckets,
  type BriefAllowedBucket,
} from '../../catalog/brief-category-buckets.util';

/** @deprecated Используйте BRIEF_ALLOWED_BUCKETS — упрощённые категории Product.category */
export const CATALOG_CATEGORIES = [
  'Ручки',
  'Кружки',
  'Ежедневники и блокноты',
  'Термосы и бутылки',
  'Сумки и рюкзаки',
  'Зонты',
  'Текстиль',
  'Одежда',
  'Электроника',
  'Часы',
  'Подарочные наборы',
  'Офис и канцелярия',
  'Отдых и спорт',
  'Сувениры и награды',
] as const;

/** UI-бакет → упрощённые категории каталога (для обратной совместимости) */
export const UI_TO_CATALOG_CATEGORIES: Record<string, readonly string[]> = {
  'Канцелярия и офис': ['Ручки', 'Ежедневники и блокноты', 'Офис и канцелярия'],
  'Посуда и напитки': ['Кружки', 'Термосы и бутылки'],
  'Сумки и рюкзаки': ['Сумки и рюкзаки'],
  Текстиль: ['Текстиль'],
  'Электроника и гаджеты': ['Электроника', 'Часы'],
  'Подарочные наборы': ['Подарочные наборы'],
  'Сувениры и награды': ['Сувениры и награды'],
  'Зонты и аксессуары': ['Зонты', 'Часы'],
  'Отдых и спорт': ['Отдых и спорт'],
  'Эко-товары': ['Термосы и бутылки', 'Сумки и рюкзаки', 'Кружки'],
  // legacy UI chips
  Посуда: ['Кружки', 'Термосы и бутылки'],
  Канцелярия: ['Ручки', 'Ежедневники и блокноты', 'Офис и канцелярия'],
  Электроника: ['Электроника', 'Часы'],
  Гаджеты: ['Электроника', 'Часы'],
  Эко: ['Термосы и бутылки', 'Сумки и рюкзаки', 'Кружки'],
  Аксессуары: ['Сувениры и награды', 'Зонты', 'Часы'],
  Упаковка: ['Подарочные наборы'],
  Одежда: ['Одежда', 'Текстиль'],
};

export function resolveCatalogCategories(items: string[]): string[] {
  const buckets = normalizeBriefAllowedBuckets(items);
  const out = new Set<string>();
  for (const bucket of buckets) {
    const mapped = UI_TO_CATALOG_CATEGORIES[bucket];
    if (mapped) {
      for (const c of mapped) out.add(c);
      continue;
    }
  }
  for (const item of items) {
    const mapped = UI_TO_CATALOG_CATEGORIES[item];
    if (mapped) {
      for (const c of mapped) out.add(c);
    } else if ((CATALOG_CATEGORIES as readonly string[]).includes(item)) {
      out.add(item);
    } else if ((BRIEF_ALLOWED_BUCKETS as readonly string[]).includes(item)) {
      const m = UI_TO_CATALOG_CATEGORIES[item as BriefAllowedBucket];
      if (m) for (const c of m) out.add(c);
    }
  }
  return [...out];
}

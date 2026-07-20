"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UI_TO_CATALOG_CATEGORIES = exports.CATALOG_CATEGORIES = void 0;
exports.resolveCatalogCategories = resolveCatalogCategories;
const brief_category_buckets_util_1 = require("../../catalog/brief-category-buckets.util");
exports.CATALOG_CATEGORIES = [
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
];
exports.UI_TO_CATALOG_CATEGORIES = {
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
    Посуда: ['Кружки', 'Термосы и бутылки'],
    Канцелярия: ['Ручки', 'Ежедневники и блокноты', 'Офис и канцелярия'],
    Электроника: ['Электроника', 'Часы'],
    Гаджеты: ['Электроника', 'Часы'],
    Эко: ['Термосы и бутылки', 'Сумки и рюкзаки', 'Кружки'],
    Аксессуары: ['Сувениры и награды', 'Зонты', 'Часы'],
    Упаковка: ['Подарочные наборы'],
    Одежда: ['Одежда', 'Текстиль'],
};
function resolveCatalogCategories(items) {
    const buckets = (0, brief_category_buckets_util_1.normalizeBriefAllowedBuckets)(items);
    const out = new Set();
    for (const bucket of buckets) {
        const mapped = exports.UI_TO_CATALOG_CATEGORIES[bucket];
        if (mapped) {
            for (const c of mapped)
                out.add(c);
            continue;
        }
    }
    for (const item of items) {
        const mapped = exports.UI_TO_CATALOG_CATEGORIES[item];
        if (mapped) {
            for (const c of mapped)
                out.add(c);
        }
        else if (exports.CATALOG_CATEGORIES.includes(item)) {
            out.add(item);
        }
        else if (brief_category_buckets_util_1.BRIEF_ALLOWED_BUCKETS.includes(item)) {
            const m = exports.UI_TO_CATALOG_CATEGORIES[item];
            if (m)
                for (const c of m)
                    out.add(c);
        }
    }
    return [...out];
}
//# sourceMappingURL=catalog-categories.util.js.map
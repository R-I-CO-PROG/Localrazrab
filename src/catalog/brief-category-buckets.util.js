"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BUCKET_SOFT_KEYWORDS = exports.BRIEF_FORBIDDEN_BUCKETS = exports.BRIEF_ALLOWED_BUCKETS = void 0;
exports.normalizeBriefAllowedBuckets = normalizeBriefAllowedBuckets;
exports.normalizeBriefForbiddenBuckets = normalizeBriefForbiddenBuckets;
exports.productMatchesAllowedBucket = productMatchesAllowedBucket;
exports.productMatchesForbiddenBucket = productMatchesForbiddenBucket;
exports.filterCatalogByBriefBuckets = filterCatalogByBriefBuckets;
exports.productMatchesRequiredCategory = productMatchesRequiredCategory;
exports.countProductsInRequiredCategory = countProductsInRequiredCategory;
const imba_category_overrides_1 = require("./imba-category-overrides");
exports.BRIEF_ALLOWED_BUCKETS = [
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
];
exports.BRIEF_FORBIDDEN_BUCKETS = [
    'Алкоголь',
    'Еда',
    'Одежда',
    'Косметика',
    'Стекло',
    'Другое',
];
const BUCKET_RULES = {
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
        textRe: /power\s*bank|пауэр|заряд|аккумулятор|флеш|usb|flash|наушник|колонк|bluetooth|гаджет|кабел|адаптер|\bхаб\b|\bhub\b|лампа|фонар|проектор|увлажнител|\bчасы\b/i,
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
const FORBIDDEN_RULES = {
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
const LEGACY_ALLOWED_TO_BUCKET = {
    'Канцелярия и офис': 'Офис и канцелярия',
    'Посуда и напитки': 'Термосы и бутылки',
    'Электроника и гаджеты': 'Электроника',
    'Зонты и аксессуары': 'Зонты',
    'Эко-товары': 'Сумки и рюкзаки',
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
function isAllowedBucket(value) {
    return exports.BRIEF_ALLOWED_BUCKETS.includes(value);
}
function isForbiddenBucket(value) {
    return exports.BRIEF_FORBIDDEN_BUCKETS.includes(value);
}
function normalizeBriefAllowedBuckets(items) {
    const out = new Set();
    for (const raw of items) {
        const item = raw?.trim();
        if (!item)
            continue;
        if (isAllowedBucket(item)) {
            out.add(item);
            continue;
        }
        const mapped = LEGACY_ALLOWED_TO_BUCKET[item];
        if (mapped)
            out.add(mapped);
    }
    return [...out];
}
function normalizeBriefForbiddenBuckets(items) {
    const out = new Set();
    for (const raw of items) {
        const item = raw?.trim();
        if (!item)
            continue;
        if (isForbiddenBucket(item))
            out.add(item);
        else if (item === 'Электроника')
            out.add('Другое');
    }
    return [...out];
}
function productHaystack(product) {
    return `${product.category} ${product.subcategory ?? ''} ${product.name} ${product.description ?? ''}`.toLowerCase();
}
function matchesRule(product, rule) {
    if (rule.categories.includes(product.category))
        return true;
    const imbaPath = (0, imba_category_overrides_1.catalogImbaPath)(product).toLowerCase();
    if (rule.imbaPathRe?.test(imbaPath))
        return true;
    const hay = productHaystack(product);
    if (rule.textRe?.test(hay))
        return true;
    return false;
}
function productMatchesAllowedBucket(product, bucket) {
    return matchesRule(product, BUCKET_RULES[bucket]);
}
function productMatchesForbiddenBucket(product, bucket) {
    return matchesRule(product, FORBIDDEN_RULES[bucket]);
}
function filterCatalogByBriefBuckets(catalog, allowedItems, forbiddenItems) {
    const allowed = normalizeBriefAllowedBuckets(allowedItems);
    const forbidden = normalizeBriefForbiddenBuckets(forbiddenItems);
    let filtered = [...catalog];
    if (allowed.length > 0) {
        filtered = filtered.filter((p) => allowed.some((bucket) => productMatchesAllowedBucket(p, bucket)));
    }
    for (const bucket of forbidden) {
        filtered = filtered.filter((p) => !productMatchesForbiddenBucket(p, bucket));
    }
    return filtered.length > 0 ? filtered : catalog;
}
exports.BUCKET_SOFT_KEYWORDS = {
    Одежда: ['футболк', 'худи', 'свитшот', 'поло', 'кепк', 'носк'],
    'Сумки и рюкзаки': ['сумк', 'рюкзак', 'шоппер'],
    'Термосы и бутылки': ['термос', 'термокруж', 'бутылк', 'фляг'],
    Кружки: ['кружк', 'чашк', 'mug'],
    Ручки: ['ручк', 'роллер', 'pen'],
    'Ежедневники и блокноты': ['ежедневник', 'блокнот', 'планинг'],
    Электроника: ['powerbank', 'заряд', 'флеш', 'usb', 'колонк', 'наушник'],
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
const REQUIRED_CATEGORY_RULES = {
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
function productMatchesRequiredCategory(product, categoryKey) {
    const rule = REQUIRED_CATEGORY_RULES[categoryKey];
    if (!rule)
        return false;
    const hay = productHaystack(product);
    if (rule.textRe.test(hay))
        return true;
    if (rule.categories?.some((c) => product.category === c)) {
        if (categoryKey === 'sweets')
            return /сладост|конфет|шоколад|прян/i.test(hay);
        return true;
    }
    return false;
}
function countProductsInRequiredCategory(products, categoryKey) {
    return products.filter((p) => productMatchesRequiredCategory(p, categoryKey)).length;
}
//# sourceMappingURL=brief-category-buckets.util.js.map
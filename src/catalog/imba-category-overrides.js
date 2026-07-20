"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IMBA_UNCATEGORIZED = exports.IMBA_CATEGORY_SEP = void 0;
exports.classifyByRules = classifyByRules;
exports.normalizeBaseCategory = normalizeBaseCategory;
exports.applyCategoryMoves = applyCategoryMoves;
exports.emptyOverrides = emptyOverrides;
exports.effectiveImbaCategory = effectiveImbaCategory;
exports.buildTree = buildTree;
exports.treeStats = treeStats;
exports.leafCategoryName = leafCategoryName;
exports.imbaCategoryBranch = imbaCategoryBranch;
exports.catalogImbaPath = catalogImbaPath;
exports.IMBA_CATEGORY_SEP = ' / ';
exports.IMBA_UNCATEGORIZED = '❓ Требует категории';
const GOOD_ROOTS = ['Продукция', 'ВИП'];
const RULES = [
    [/металл\w*\s+ручк|ручк\w*.*металл/, 'Продукция / Пишущие инструменты / Металлические ручки'],
    [/пластик\w*\s+ручк|ручк\w*.*пластик/, 'Продукция / Пишущие инструменты / Пластиковые ручки'],
    [/набор\w*\s+ручек|ручк.*набор/, 'Продукция / Пишущие инструменты / Наборы ручек'],
    [/\bручк/, 'Продукция / Пишущие инструменты / Ручки'],
    [/\bкарандаш/, 'Продукция / Пишущие инструменты / Карандаши'],
    [/\bмаркер|\bфломастер|\bтекстовыделит/, 'Продукция / Пишущие инструменты / Маркеры'],
    [/\bстилус/, 'Продукция / Пишущие инструменты / Ручки'],
    [/usb|флеш|flash|флешк/, 'Продукция / Электроника / Устройства хранения / Флешки'],
    [
        /power\s*bank|аккумулятор|повербанк|внешн\w* аккум/,
        'Продукция / Электроника / Внешние аккумуляторы (Power Bank)',
    ],
    [/наушник|колонк|акустик|динамик|speaker/, 'Продукция / Электроника / Колонки и наушники'],
    [/заряд\w*\s+устройств|зарядк|charger/, 'Продукция / Электроника / Зарядные устройства'],
    [/коврик.*мыш|мышь компьютер|клавиатур|хаб\b|usb-хаб/, 'Продукция / Электроника / Компьютерные аксессуары'],
    [/часы\b|смарт-часы|фитнес-браслет/, 'Продукция / Электроника / Смарт-часы и фитнес-браслеты'],
    [/увлажнител|метеостанц/, 'Продукция / Электроника / Прочая электроника'],
    [/электроник/, 'Продукция / Электроника'],
    [
        /набор\w*\s+для\s+(вин|шампанск|виски|коньяк|алкогол)|(вин\w*|шампанск\w*|виски|коньячн\w*)\s+набор|аксессуар\w*\s+для\s+вин/,
        'Продукция / Аксессуары для алкогольных напитков / Наборы для вина и шампанского',
    ],
    [/штопор|сомелье/, 'Продукция / Аксессуары для алкогольных напитков / Штопоры и сомелье'],
    [/декантер|аэратор\s+для\s+вин/, 'Продукция / Аксессуары для алкогольных напитков / Декантеры'],
    [/стопк\w*|шот\w*\s+стакан|рюмк/, 'Продукция / Аксессуары для алкогольных напитков / Рюмки и стопки'],
    [/винн\w*\s+пробк|пробк\w*\s+для\s+(вин|бутылк)/, 'Продукция / Аксессуары для алкогольных напитков / Пробки и каплеуловители'],
    [/бокал/, 'Продукция / Аксессуары для алкогольных напитков / Бокалы'],
    [/фужер/, 'Продукция / Аксессуары для алкогольных напитков / Фужеры'],
    [/термокружк|термостакан/, 'Продукция / Кухня и посуда / Термокружки и термосы / Термокружки'],
    [/термос\b|термос /, 'Продукция / Кухня и посуда / Термокружки и термосы'],
    [/кофер|тубус для кофера|крышка для кофера/, 'Продукция / Кухня и посуда / Термокружки и термосы'],
    [/бутылк/, 'Продукция / Кухня и посуда / Бутылки для воды'],
    [/кружк|стакан|чашк|чайн\w* пар/, 'Продукция / Кухня и посуда / Кружки и стаканы'],
    [/ланч|ланчбокс|контейнер для ед/, 'Продукция / Кухня и посуда / Контейнеры для еды'],
    [/фляжк|фляг/, 'Продукция / Кухня и посуда / Фляжки'],
    [/одноразов\w*.*посуд|био посуд/, 'Продукция / Кухня и посуда / Посуда'],
    [/посуд|кухн/, 'Продукция / Кухня и посуда'],
    [/рюкзак/, 'Продукция / Сумки / Рюкзаки'],
    [/шоппер|шопер|сумка для покупок|авоськ/, 'Продукция / Сумки / Шопперы и сумки для покупок'],
    [/косметичк|несессер/, 'ВИП / Личные аксессуары / Женские аксессуары / Дамские сумки, косметички'],
    [/сумк/, 'Продукция / Сумки'],
    [/чемодан/, 'Продукция / Для путешествий / Чемоданы'],
    [/футболк/, 'Продукция / Одежда / Футболки'],
    [/поло\b/, 'Продукция / Одежда / Поло'],
    [/толстовк|свитшот|джемпер|худи|свитер/, 'Продукция / Одежда / Свитеры и толстовки'],
    [/ветровк|куртк/, 'Продукция / Одежда / Куртки и ветровки'],
    [/дождевик/, 'ВИП / Одежда / Дождевики'],
    [/шапк|бейсболк|кепк|панам|головн\w* убор/, 'Продукция / Одежда / Головные уборы'],
    [/шарф|платок|платк/, 'Продукция / Одежда / Шарфы и платки'],
    [/одежд|рубашк/, 'Продукция / Одежда'],
    [/ежедневник/, 'Продукция / Офисные аксессуары / Ежедневники'],
    [/блокнот|записн\w* книжк|записная/, 'Продукция / Офисные аксессуары / Блокноты и записные книжки'],
    [/стикер/, 'Продукция / Офисные аксессуары / Канцелярские товары / Стикеры'],
    [/визитниц/, 'ВИП / Личные аксессуары / Визитницы'],
    [/бейдж|ланъярд|ланьярд|лань\w*ярд|держател\w* для бейдж/, 'Продукция / Офисные аксессуары / Держатели для бейджа и пропуска'],
    [/настольн\w* (органайзер|набор|аксессуар)/, 'Продукция / Офисные аксессуары / Настольные аксессуары'],
    [/календар/, 'Продукция / Офисные аксессуары / Настольные аксессуары / Календари'],
    [/портмоне|кошел|бумажник/, 'Продукция / Мужские аксессуары / Портмоне'],
    [/папк|портфолио|портфел/, 'ВИП / Портфели и сумки / Папки, портфолио'],
    [/визитк|чехол.*карт|футляр.*карт|картхолдер/, 'Продукция / Личные аксессуары / Кошельки и монетницы'],
    [/\bофис/, 'Продукция / Офисные аксессуары'],
    [/зонт/, 'Продукция / Зонты'],
    [/обвес|ремувк|ретрактор|карабин|шнурк/, 'Продукция / Кастомизация / Ремувки и брелоки'],
    [/набор\b|\bsuperbag\b|\bbox\b|welcome\s*pack|бизнес[- ]набор/, 'Продукция / Подарочные наборы'],
    [/брелок|брелк/, 'ВИП / Личные аксессуары / Брелоки'],
    [/плед/, 'Продукция / Для отдыха / Пледы'],
    [/свеч|подсвечник|арома/, 'Продукция / Для дома / Декор / Свечи и подсвечники'],
    [/фоторамк|фотоальбом/, 'Продукция / Для дома / Декор / Фоторамки'],
    [/шкатулк/, 'Продукция / Женские аксессуары / Украшения / Шкатулки и подставки'],
    [/мультитул|мультиинструмент|инструмент|рулетк|фонар/, 'Продукция / Для дома / Инструменты и мультитулы'],
    [/декор|интерьер|скульптур|картин|икон/, 'Продукция / Для дома / Декор'],
    [/текстиль|полотенц|халат/, 'Продукция / Для дома / Текстиль'],
    [/антистресс|игр\w*|головоломк|домино|нард|шахмат/, 'Продукция / Для отдыха / Игры'],
    [/масс\w*аж|здоров|медицин/, 'Продукция / Для отдыха / Для здоровья'],
    [/новогодн|новый год|рождеств|ёлочн|елочн|ёлк|елк/, 'ВИП / Новогодние подарки'],
    [/упаковк|коробк|пакет|мешоч|зип-пакет/, 'Продукция / Упаковка / Подарочная упаковка'],
    [/силикон\w* составляющ|шильд|бирк|крышк/, 'Продукция / Кастомизация'],
    [/автотовар|автомобильн|для авто/, 'Продукция / Автомобильные аксессуары'],
];
function itemHaystack(item) {
    return [item.categoryRaw, item.category, item.name, item.brand].filter(Boolean).join(' ').toLowerCase();
}
function looksValid(path) {
    if (!path || path.includes('|'))
        return false;
    const root = path.split('/')[0]?.trim();
    return GOOD_ROOTS.includes(root);
}
function classifyByRules(item) {
    const hay = itemHaystack(item);
    for (const [re, target] of RULES) {
        if (re.test(hay))
            return target;
    }
    return null;
}
function normalizeBaseCategory(item) {
    const raw = (item.category || '').trim();
    if (looksValid(raw))
        return raw;
    return classifyByRules(item) ?? exports.IMBA_UNCATEGORIZED;
}
function applyCategoryMoves(path, moves) {
    if (!moves)
        return path;
    const froms = Object.keys(moves).sort((a, b) => b.length - a.length);
    let cur = path;
    for (let guard = 0; guard < 50; guard++) {
        let changed = false;
        for (const from of froms) {
            if (cur === from) {
                cur = moves[from];
                changed = true;
                break;
            }
            if (cur.startsWith(from + exports.IMBA_CATEGORY_SEP)) {
                cur = moves[from] + cur.slice(from.length);
                changed = true;
                break;
            }
        }
        if (!changed)
            break;
    }
    return cur;
}
function emptyOverrides() {
    return {
        version: 1,
        updatedAt: new Date().toISOString(),
        categoryMoves: {},
        productMoves: {},
        extraCategories: [],
    };
}
function effectiveImbaCategory(item, overrides) {
    const sku = String(item.sku || '').trim();
    const base = overrides?.productMoves?.[sku] ?? normalizeBaseCategory(item);
    return applyCategoryMoves(base, overrides?.categoryMoves);
}
function buildTree(items, overrides) {
    const direct = new Map();
    for (const it of items) {
        const p = effectiveImbaCategory(it, overrides);
        direct.set(p, (direct.get(p) || 0) + 1);
    }
    for (const p of overrides?.extraCategories || []) {
        if (!direct.has(p))
            direct.set(p, 0);
    }
    const nodes = new Map();
    function ensure(fullPath) {
        const existing = nodes.get(fullPath);
        if (existing)
            return existing;
        const parts = fullPath.split(exports.IMBA_CATEGORY_SEP);
        const name = parts[parts.length - 1] ?? fullPath;
        const parentPath = parts.length > 1 ? parts.slice(0, -1).join(exports.IMBA_CATEGORY_SEP) : null;
        const node = {
            path: fullPath,
            name,
            parentPath,
            level: parts.length,
            directCount: 0,
            productCount: 0,
            children: [],
        };
        nodes.set(fullPath, node);
        if (parentPath) {
            const parent = ensure(parentPath);
            parent.children.push(node);
        }
        return node;
    }
    for (const [p, c] of direct) {
        const node = ensure(p);
        node.directCount = c;
    }
    function rollup(node) {
        let total = node.directCount;
        node.children.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
        for (const ch of node.children)
            total += rollup(ch);
        node.productCount = total;
        return total;
    }
    const roots = [...nodes.values()].filter((n) => n.parentPath === null);
    roots.sort((a, b) => b.productCount - a.productCount || a.name.localeCompare(b.name, 'ru'));
    for (const r of roots)
        rollup(r);
    return { roots, nodes };
}
function treeStats(items, overrides) {
    const { nodes } = buildTree(items, overrides);
    let uncategorized = 0;
    for (const it of items) {
        if (effectiveImbaCategory(it, overrides).startsWith(exports.IMBA_UNCATEGORIZED))
            uncategorized++;
    }
    return {
        totalProducts: items.length,
        categories: nodes.size,
        uncategorized,
    };
}
function leafCategoryName(path) {
    const parts = path.split(exports.IMBA_CATEGORY_SEP).map((s) => s.trim()).filter(Boolean);
    return parts[parts.length - 1] || 'Прочее';
}
function imbaCategoryBranch(path, depth = 2) {
    const parts = path.split(exports.IMBA_CATEGORY_SEP).map((s) => s.trim()).filter(Boolean);
    if (!parts.length)
        return 'Прочее';
    return parts.slice(0, Math.min(depth, parts.length)).join(exports.IMBA_CATEGORY_SEP);
}
function catalogImbaPath(product) {
    return product.subcategory?.trim() || product.category?.trim() || 'Прочее';
}
//# sourceMappingURL=imba-category-overrides.js.map
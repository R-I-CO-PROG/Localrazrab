"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TYPE_META = void 0;
exports.metaForType = metaForType;
exports.familyForType = familyForType;
exports.roleForType = roleForType;
exports.budgetWeightForType = budgetWeightForType;
exports.detectPrimaryTypeFromName = detectPrimaryTypeFromName;
exports.clearProductTypeCache = clearProductTypeCache;
exports.detectTypeSlug = detectTypeSlug;
exports.typeConflictsInSet = typeConflictsInSet;
exports.colorHintsFromProduct = colorHintsFromProduct;
const UNIQUE = (slug) => `unique:${slug}`;
exports.TYPE_META = {
    welcome_pack: { role: 'welcome_pack', family: 'bundle', budgetWeight: 2.2, giftBundle: true },
    welcome_box: { role: 'welcome_pack', family: 'bundle', budgetWeight: 2.2, giftBundle: true },
    gift_set: { role: 'gift_set', family: 'bundle', budgetWeight: 2.2, giftBundle: true },
    mug: { role: 'drinkware', family: 'drinkware', budgetWeight: 1.2 },
    bottle: { role: 'drinkware', family: 'drinkware', budgetWeight: 1.4 },
    thermos: { role: 'drinkware', family: 'drinkware', budgetWeight: 1.7 },
    thermos_mug: { role: 'drinkware', family: 'drinkware', budgetWeight: 1.3 },
    tumbler: { role: 'drinkware', family: 'drinkware', budgetWeight: 1.3 },
    tea_set: { role: 'drinkware', family: 'drinkware', budgetWeight: 1.5 },
    decanter: { role: 'home', family: UNIQUE('decanter'), budgetWeight: 1.8 },
    flask: { role: 'home', family: UNIQUE('flask'), budgetWeight: 1.4 },
    shaker: { role: 'home', family: UNIQUE('shaker'), budgetWeight: 1.3 },
    mortar: { role: 'home', family: UNIQUE('mortar'), budgetWeight: 1.4 },
    bag: { role: 'bag', family: 'carry', budgetWeight: 1.8 },
    shopper: { role: 'bag', family: 'carry', budgetWeight: 1.6 },
    backpack: { role: 'bag', family: 'carry', budgetWeight: 2.2 },
    cap: { role: 'headwear', family: 'headwear', budgetWeight: 1.4, wearable: true },
    bucket_hat: { role: 'headwear', family: 'headwear', budgetWeight: 1.4, wearable: true },
    beanie: { role: 'headwear', family: 'headwear', budgetWeight: 1.4, wearable: true },
    bandana: { role: 'headwear', family: 'headwear', budgetWeight: 1.0, wearable: true },
    sunglasses: { role: 'apparel', family: UNIQUE('sunglasses'), budgetWeight: 1.5, wearable: true },
    tshirt: { role: 'apparel', family: UNIQUE('tshirt'), budgetWeight: 2.4, wearable: true },
    hoodie: { role: 'apparel', family: UNIQUE('hoodie'), budgetWeight: 2.6, wearable: true },
    raincoat: { role: 'apparel', family: UNIQUE('raincoat'), budgetWeight: 2.2, wearable: true },
    scarf: { role: 'scarf', family: UNIQUE('scarf'), budgetWeight: 1.4, wearable: true },
    socks: { role: 'socks', family: 'textile_acc', budgetWeight: 0.6, wearable: true },
    notebook: { role: 'notebook', family: 'writing', budgetWeight: 1.3, office: true },
    diary: { role: 'writing', family: 'writing', budgetWeight: 1.5, office: true },
    pen: { role: 'pen', family: 'pen', budgetWeight: 0.55, office: true },
    pencil: { role: 'pen', family: 'pen', budgetWeight: 0.45, office: true },
    powerbank: { role: 'powerbank', family: 'powerbank', budgetWeight: 2.5, tech: true },
    flash: { role: 'tech_accessory', family: 'usb_storage', budgetWeight: 1.8, tech: true },
    flash_drive: { role: 'tech_accessory', family: 'usb_storage', budgetWeight: 1.8, tech: true },
    speaker: { role: 'tech_accessory', family: UNIQUE('speaker'), budgetWeight: 2.4, tech: true },
    projector: { role: 'tech_accessory', family: UNIQUE('projector'), budgetWeight: 2.6, tech: true },
    tech_accessory: { role: 'tech_accessory', family: UNIQUE('tech_accessory'), budgetWeight: 1.6, tech: true },
    watch: { role: 'tech_accessory', family: UNIQUE('watch'), budgetWeight: 2.0 },
    towel: { role: 'towel', family: UNIQUE('towel'), budgetWeight: 1.0 },
    apron: { role: 'home', family: 'textile_acc', budgetWeight: 1.0 },
    blanket: { role: 'home', family: UNIQUE('blanket'), budgetWeight: 1.7 },
    pillow: { role: 'home', family: UNIQUE('pillow'), budgetWeight: 1.2 },
    candle: { role: 'home', family: UNIQUE('candle'), budgetWeight: 1.0 },
    cutting_board: { role: 'home', family: UNIQUE('cutting_board'), budgetWeight: 1.2 },
    cosmetic_bag: { role: 'office', family: UNIQUE('cosmetic_bag'), budgetWeight: 1.2 },
    umbrella: { role: 'other', family: UNIQUE('umbrella'), budgetWeight: 1.6 },
    calendar: { role: 'office', family: UNIQUE('calendar'), budgetWeight: 1.0, office: true },
    cardholder: { role: 'office', family: UNIQUE('cardholder'), budgetWeight: 1.0, office: true },
    lanyard: { role: 'office', family: UNIQUE('lanyard'), budgetWeight: 0.5 },
    keychain: { role: 'other', family: UNIQUE('keychain'), budgetWeight: 0.45 },
    sticker: { role: 'office', family: UNIQUE('sticker'), budgetWeight: 0.4 },
    multitool: { role: 'other', family: UNIQUE('multitool'), budgetWeight: 1.4 },
    fitness: { role: 'other', family: UNIQUE('fitness'), budgetWeight: 1.2 },
    stress_ball: { role: 'other', family: UNIQUE('stress_ball'), budgetWeight: 0.5 },
    christmas_decor: { role: 'home', family: UNIQUE('christmas_decor'), budgetWeight: 0.8 },
    car_accessory: { role: 'other', family: UNIQUE('car_accessory'), budgetWeight: 1.0 },
    other: { role: 'other', family: UNIQUE('other'), budgetWeight: 1.0 },
};
const DEFAULT_META = exports.TYPE_META.other;
function metaForType(slug) {
    return exports.TYPE_META[slug] ?? DEFAULT_META;
}
function familyForType(slug) {
    return metaForType(slug).family;
}
function roleForType(slug) {
    return metaForType(slug).role;
}
function budgetWeightForType(slug) {
    return metaForType(slug).budgetWeight;
}
function normalizeText(text) {
    return String(text ?? '').toLowerCase().replace(/ё/g, 'е');
}
function productSearchText(product) {
    return normalizeText(`${product.name} ${product.description ?? ''} ${product.subcategory ?? ''}`);
}
function productHaystack(product) {
    return normalizeText(`${product.name} ${product.description ?? ''} ${product.subcategory ?? ''} ${product.category ?? ''}`);
}
function detectPrimaryTypeFromName(nameNorm) {
    const n = nameNorm.trim();
    if (!n)
        return null;
    if (/подарочн[а-яё]*\s+набор|gift\s*set|набор\s+[«"]/i.test(n))
        return null;
    if (/^плед(?:[-\s]|$)|флисов[а-яё]*\s+плед/i.test(n) ||
        (/плед|blanket|fleece/i.test(n) && !/портплед|portfolio|набор|подарочн/i.test(n))) {
        return 'blanket';
    }
    if (/^блокнот(?:[-\s]|$)/i.test(n) ||
        (/блокнот/i.test(n) && !/ежедневник|набор|подарочн/i.test(n))) {
        return 'notebook';
    }
    if (/ежедневник/i.test(n))
        return 'diary';
    if (/термокруж/i.test(n))
        return 'thermos_mug';
    if (/термостакан/i.test(n))
        return 'tumbler';
    if (/термос/i.test(n))
        return 'thermos';
    if (/^рюкзак/i.test(n))
        return 'backpack';
    if (/^шоппер/i.test(n))
        return 'shopper';
    if (/^сумк/i.test(n) && !/плед|блокнот/i.test(n))
        return 'bag';
    return null;
}
const SLUG_RULES = [
    { slug: 'welcome_pack', test: (t) => /welcome\s*pack|велком\s*пак|simple\s*kit/i.test(t) },
    {
        slug: 'gift_set',
        test: (t) => !/фитнес|fitness|спорт|cross|резинк|эспандер/i.test(t) &&
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
        test: (t) => /power\s*bank|powerbank|пауэр|зарядн\w*\s+устрой|аккумулятор|\bмач\b|\bmah\b/i.test(t),
    },
    {
        slug: 'tech_accessory',
        test: (t) => /кабел|адаптер|charger|usb-c|type-c|хаб|hub|держател\w*\s+телефон/i.test(t) &&
            !/power\s*bank|powerbank|пауэр/i.test(t),
    },
    {
        slug: 'blanket',
        test: (t) => (/^плед|плед[-\s]|плед\s+для|плед[-\s]подуш|флисовый\s+плед/i.test(t.trim()) ||
            (/плед|blanket|fleece/i.test(t) && !/портплед|portfolio/i.test(t))) &&
            !/полотенц|кухонн/i.test(t),
    },
    {
        slug: 'notebook',
        test: (t) => /^блокнот|блокнот\s/i.test(t.trim()) || (/блокнот/i.test(t) && !/ежедневник/i.test(t)),
    },
    { slug: 'diary', test: (t) => /ежедневник/i.test(t) },
    { slug: 'pen', test: (t) => /ручк|шариков|роллер|перьев/i.test(t) && !/powerbank|блокнот/i.test(t) },
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
        test: (t) => (/круж|стакан|mug|cup/i.test(t) || /бамбуков/i.test(t)) &&
            !/термос|термостакан|термокруж|бутыл|чайн[а-я]*\s*пар/i.test(t),
    },
    { slug: 'cap', test: (t) => /кепк|бейсболк|baseball cap/i.test(t) && !/панам|bucket/i.test(t) },
    { slug: 'bucket_hat', test: (t) => /панам|bucket/i.test(t) },
    { slug: 'tshirt', test: (t) => /футболк|tshirt|t-shirt|oversize|оверсайз/i.test(t) && !/поло/i.test(t) },
    { slug: 'hoodie', test: (t) => /худи|hoodie|свитшот|лонгслив|толстовк/i.test(t) },
    { slug: 'backpack', test: (t) => /рюкзак|backpack/i.test(t) },
    { slug: 'shopper', test: (t) => /шоппер/i.test(t) },
    {
        slug: 'bag',
        test: (t) => (/сумк|тоут|tote|superbag/i.test(t) || /\bbag\b/i.test(t)) &&
            !/рюкзак|шоппер|блокнот|пенал|косметич|плед|blanket/i.test(t),
    },
    { slug: 'pillow', test: (t) => /подушк|pillow/i.test(t) },
    { slug: 'cutting_board', test: (t) => /разделочн|доска\s+для\s+нарез/i.test(t) },
    { slug: 'cosmetic_bag', test: (t) => /косметич/i.test(t) },
    { slug: 'flash', test: (t) => /флеш|usb flash|flash drive/i.test(t) && !/powerbank|заряд|аккумулятор/i.test(t) },
    { slug: 'speaker', test: (t) => /колонк|speaker|bluetooth/i.test(t) },
    {
        slug: 'sunglasses',
        test: (t) => (/солнцезащит|sunglass|eyewear/i.test(t) ||
            /(?:^|[^\p{L}\p{N}])очки(?:[а-я]*)(?:[^\p{L}\p{N}]|$)/iu.test(t)) &&
            !/очистител|линз|кепк|бейсболк|панам/i.test(t),
    },
];
const SUBCATEGORY_TYPE_HINTS = [
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
    { patterns: /штоф|flask|carafe|графин/i, slug: 'flask' },
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
const productTypeCache = new Map();
const colorHintsCache = new Map();
function clearProductTypeCache() {
    productTypeCache.clear();
    colorHintsCache.clear();
}
function detectTypeSlug(product) {
    const cached = productTypeCache.get(product.id);
    if (cached)
        return cached;
    const slug = computeTypeSlug(product);
    productTypeCache.set(product.id, slug);
    return slug;
}
function computeTypeSlug(product) {
    const nameNorm = normalizeText(product.name ?? '');
    const primary = detectPrimaryTypeFromName(nameNorm);
    if (primary)
        return primary;
    for (const rule of SLUG_RULES) {
        if (rule.test(nameNorm))
            return rule.slug;
    }
    const text = productSearchText(product);
    for (const rule of SLUG_RULES) {
        if (rule.test(text))
            return rule.slug;
    }
    const sub = normalizeText(product.subcategory ?? '');
    for (const hint of SUBCATEGORY_TYPE_HINTS) {
        if (hint.patterns.test(sub) || hint.patterns.test(text))
            return hint.slug;
    }
    const category = normalizeText(product.category ?? '');
    for (const hint of SUBCATEGORY_TYPE_HINTS) {
        if (hint.patterns.test(category))
            return hint.slug;
    }
    return 'other';
}
function typeConflictsInSet(localTypes, candidateType) {
    if (localTypes.has(candidateType))
        return true;
    const family = familyForType(candidateType);
    for (const existing of localTypes) {
        if (familyForType(existing) === family)
            return true;
    }
    return false;
}
function colorHintsFromProduct(product) {
    const cached = colorHintsCache.get(product.id);
    if (cached)
        return cached;
    const hints = [];
    for (const c of product.colors ?? []) {
        const label = typeof c === 'string'
            ? c
            : typeof c === 'object' && c
                ? String(c.name ?? c.hex ?? '')
                : '';
        if (label.trim())
            hints.push(normalizeText(label));
    }
    const name = normalizeText(product.name);
    const colorWords = [
        'бел', 'черн', 'сер', 'син', 'голуб', 'красн', 'зелен', 'желт', 'оранж', 'розов',
        'беж', 'коричн', 'натуральн', 'молочн', 'бордов', 'фиолет',
        'white', 'black', 'grey', 'gray', 'blue', 'red', 'green', 'yellow', 'orange', 'pink',
    ];
    for (const w of colorWords) {
        if (name.includes(w))
            hints.push(w);
    }
    const result = [...new Set(hints)];
    colorHintsCache.set(product.id, result);
    return result;
}
//# sourceMappingURL=product-taxonomy.js.map
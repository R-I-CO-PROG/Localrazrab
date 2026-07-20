"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConceptDiversityTracker = exports.CATALOG_IDEATOR_TYPE_SLUGS = exports.CONCEPT_TYPE_DEFINITIONS = exports.OPTIONAL_TYPE_MAX_CONCEPTS = exports.MANDATORY_TYPE_MAX_CONCEPTS = void 0;
exports.detectConceptProductType = detectConceptProductType;
exports.clearConceptProductTypeCache = clearConceptProductTypeCache;
exports.detectPrimaryTypeFromName = detectPrimaryTypeFromName;
exports.getProductTypeFamily = getProductTypeFamily;
exports.typeConflictsInSet = typeConflictsInSet;
exports.conceptTypeLabel = conceptTypeLabel;
exports.productSlotsSignature = productSlotsSignature;
exports.normalizeThemeAxis = normalizeThemeAxis;
exports.mandatoryTypeAliases = mandatoryTypeAliases;
exports.hasMandatoryTypeInProducts = hasMandatoryTypeInProducts;
exports.detectMandatoryConceptTypesFromBrief = detectMandatoryConceptTypesFromBrief;
exports.detectAlternativeTypeGroupsFromBrief = detectAlternativeTypeGroupsFromBrief;
exports.pickAlternativeTypesForConcept = pickAlternativeTypesForConcept;
exports.pickDiverseProduct = pickDiverseProduct;
exports.enforceConceptSetDiversity = enforceConceptSetDiversity;
const catalog_variant_util_1 = require("./catalog-variant.util");
const product_taxonomy_1 = require("../../concept/product-taxonomy");
exports.MANDATORY_TYPE_MAX_CONCEPTS = 5;
exports.OPTIONAL_TYPE_MAX_CONCEPTS = 2;
function normalizeText(text) {
    return text.toLowerCase().replace(/ё/g, 'е');
}
function detectConceptProductType(product) {
    return (0, product_taxonomy_1.detectTypeSlug)(product);
}
function clearConceptProductTypeCache() {
    (0, product_taxonomy_1.clearProductTypeCache)();
}
function detectPrimaryTypeFromName(nameNorm) {
    return (0, product_taxonomy_1.detectPrimaryTypeFromName)(nameNorm);
}
function getProductTypeFamily(type) {
    return (0, product_taxonomy_1.familyForType)(type);
}
function typeConflictsInSet(localTypes, candidateType) {
    return (0, product_taxonomy_1.typeConflictsInSet)(localTypes, candidateType);
}
exports.CONCEPT_TYPE_DEFINITIONS = [
    {
        slug: 'welcome_pack',
        labelRu: 'welcome pack',
        briefMandatory: [/welcome\s*pack|велком/i],
        matchProduct: (t) => /welcome\s*pack|велком\s*пак|simple\s*kit/i.test(t),
    },
    {
        slug: 'gift_set',
        labelRu: 'подарочный набор',
        briefMandatory: [/подарочн\w*\s+набор/i],
        matchProduct: (t) => /подарочн[а-яё]*\s+набор|gift\s*set|superbag\s*bubble|dreamy\s*hygge|cozy\s*hygge/i.test(t),
    },
    {
        slug: 'scarf',
        labelRu: 'шарф',
        briefMandatory: [/шарф/i],
        matchProduct: (t) => /шарф|scarf/i.test(t),
    },
    {
        slug: 'tshirt',
        labelRu: 'футболка',
        briefMandatory: [
            /(?:нужн|ищем|обязательн|хотим|требу|вход).{0,30}(?:футболк|оверсайз|мерч)/i,
            /футболк[а-я]*(?![а-яё])/i,
            /оверсайз/i,
            /\bмерч\b/i,
        ],
        matchProduct: (t) => /футболк|tshirt|t-shirt|oversize|оверсайз/i.test(t) && !/поло/i.test(t),
    },
    {
        slug: 'hoodie',
        labelRu: 'худи',
        briefMandatory: [/(?:нужн|ищем|обязательн|хотим).{0,25}худи/i, /худи[а-я]*(?![а-яё])/i, /свитшот/i],
        matchProduct: (t) => /худи|hoodie|свитшот/i.test(t),
    },
    {
        slug: 'cap',
        labelRu: 'кепка',
        briefMandatory: [/(?:нужн|ищем|обязательн|хотим).{0,25}кепк/i, /кепк[а-я]*(?![а-яё])/i, /бейсболк/i],
        matchProduct: (t) => /кепк|бейсболк|baseball cap/i.test(t) && !/панам|bucket/i.test(t),
    },
    {
        slug: 'bucket_hat',
        labelRu: 'панама',
        briefMandatory: [/(?:нужн|ищем|обязательн|хотим).{0,25}панам/i, /панам[а-я]*(?![а-яё])/i, /bucket/i],
        matchProduct: (t) => /панам|bucket/i.test(t),
    },
    {
        slug: 'sunglasses',
        labelRu: 'очки',
        briefMandatory: [
            /(?:нужн|ищем|обязательн|хотим).{0,30}(?:очк|солнцезащит)/i,
            /солнцезащитн[а-я]*\s*очк/i,
            /(?:^|[^\p{L}\p{N}])очки(?:[^\p{L}\p{N}]|$)/iu,
        ],
        matchProduct: (t) => (/солнцезащит|sunglass|eyewear/i.test(t) ||
            /(?:^|[^\p{L}\p{N}])очки(?:[а-я]*)(?:[^\p{L}\p{N}]|$)/iu.test(t)) &&
            !/очистител|линз|кепк|бейсболк|панам|bucket|сумочк|кошел/i.test(t),
    },
    {
        slug: 'raincoat',
        labelRu: 'дождевик',
        briefMandatory: [/(?:нужн|ищем|обязательн|хотим).{0,25}дождевик/i, /дождевик[а-я]*(?![а-яё])/i, /ветровк/i],
        matchProduct: (t) => /дождевик|ветровк|raincoat|poncho/i.test(t),
    },
    {
        slug: 'tea_set',
        labelRu: 'чайная пара',
        briefMandatory: [/(?:нужн|ищем|обязательн|хотим|требу).{0,25}чайн[а-я]*\s*пар/i, /чайн[а-я]*\s*пар[аыу]?\b/i],
        matchProduct: (t) => /чайн[а-я]*\s*пар/i.test(t),
    },
    {
        slug: 'thermos_mug',
        labelRu: 'термокружка',
        briefMandatory: [/(?:нужн|ищем|обязательн|хотим).{0,25}термокруж/i, /термокруж[а-я]*(?![а-яё])/i],
        matchProduct: (t) => /термокруж/i.test(t),
    },
    {
        slug: 'thermos',
        labelRu: 'термос',
        briefMandatory: [/(?:нужн|ищем|обязательн|хотим|требу).{0,25}термос/i, /термос[аыуов]?\b/i],
        matchProduct: (t) => /термос/i.test(t) && !/термокруж/i.test(t),
    },
    {
        slug: 'bottle',
        labelRu: 'бутылка',
        briefMandatory: [/(?:нужн|ищем|обязательн|хотим).{0,25}бутыл/i, /бутыл[а-я]*(?![а-яё])/i],
        matchProduct: (t) => /бутыл/i.test(t),
    },
    {
        slug: 'mug',
        labelRu: 'кружка',
        briefMandatory: [/(?<![а-яё])круж(?:к|ек)/i],
        matchProduct: (t) => /круж|mug\b/i.test(t) && !/термокруж/i.test(t),
    },
    {
        slug: 'diary',
        labelRu: 'ежедневник',
        briefMandatory: [/(?:нужн|ищем|обязательн|хотим).{0,25}ежедневник/i, /ежедневник[а-я]*(?![а-яё])/i],
        matchProduct: (t) => /ежедневник/i.test(t),
    },
    {
        slug: 'notebook',
        labelRu: 'блокнот',
        briefMandatory: [/(?:нужн|ищем|обязательн|хотим).{0,25}блокнот/i, /блокнот[а-я]*(?![а-яё])/i],
        matchProduct: (t) => /блокнот/i.test(t) && !/ежедневник/i.test(t),
    },
    {
        slug: 'backpack',
        labelRu: 'рюкзак',
        briefMandatory: [/(?:нужн|ищем|обязательн|хотим).{0,25}рюкзак/i, /рюкзак[а-я]*(?![а-яё])/i],
        matchProduct: (t) => /рюкзак|backpack/i.test(t),
    },
    {
        slug: 'shopper',
        labelRu: 'шоппер',
        briefMandatory: [/(?:нужн|ищем|обязательн|хотим).{0,25}шоппер/i, /шоппер[а-я]*(?![а-яё])/i],
        matchProduct: (t) => /шоппер/i.test(t),
    },
    {
        slug: 'bag',
        labelRu: 'сумка',
        briefMandatory: [/(?:нужн|ищем|обязательн|хотим).{0,25}сумк/i, /сумк[а-я]*(?![а-яё])/i],
        matchProduct: (t) => /сумк|тоут|tote/i.test(t) && !/рюкзак|шоппер|блокнот|пенал/i.test(t),
    },
    {
        slug: 'speaker',
        labelRu: 'колонка',
        briefMandatory: [/(?:нужн|ищем|обязательн|хотим).{0,25}колонк/i, /колонк[а-я]*(?![а-яё])/i],
        matchProduct: (t) => /колонк|speaker|bluetooth/i.test(t),
    },
    {
        slug: 'blanket',
        labelRu: 'плед',
        briefMandatory: [/плед[а-яё]*/i],
        matchProduct: (t) => /плед|blanket|fleece.*плед/i.test(t) && !/спальн/i.test(t),
    },
    {
        slug: 'powerbank',
        labelRu: 'пауэрбанк',
        briefMandatory: [
            /(?:нужн|ищем|обязательн|хотим).{0,25}(?:powerbank|пауэр|заряд|аккумулятор)/i,
            /powerbank|пауэрбанк|аккумулятор[а-я]*(?![а-яё])/i,
        ],
        matchProduct: (t) => /powerbank|power bank|пауэр|зарядн|аккумулятор|\bмач\b|\bmah\b/i.test(t),
    },
    {
        slug: 'pen',
        labelRu: 'ручка',
        briefMandatory: [/(?:нужн|ищем|обязательн|хотим).{0,25}ручк/i, /ручк[а-я]*(?![а-яё])/i],
        matchProduct: (t) => /ручк|pen/i.test(t) && !/powerbank/i.test(t),
    },
    {
        slug: 'flash_drive',
        labelRu: 'флешка',
        briefMandatory: [/флешк|флэшк|usb/i],
        matchProduct: (t) => /флешк|флэшк|flash.*drive|usb.*drive/i.test(t),
    },
    {
        slug: 'umbrella',
        labelRu: 'зонт',
        briefMandatory: [/(?:нужн|ищем|обязательн|хотим).{0,25}зонт/i, /зонт[а-я]*(?![а-яё])/i],
        matchProduct: (t) => /зонт/i.test(t),
    },
    {
        slug: 'watch',
        labelRu: 'часы',
        briefMandatory: [
            /(?<![а-яё])часы(?![а-яё])/i,
            /наручн[а-яё]*\s+час/i,
            /smart\s*watch|умн[а-яё]*\s+час/i,
        ],
        matchProduct: (t) => /(?<![а-яё])часы(?![а-яё])|smart\s*watch|wristwatch|наручн[а-яё]*\s+час|насто(?:льн|енн)[а-яё]*\s+час/i.test(t) && !/powerbank/i.test(t),
    },
    {
        slug: 'welcome_box',
        labelRu: 'welcome box',
        briefMandatory: [/welcome\s*box/i, /велком\s*бокс/i],
        matchProduct: (t) => /welcome\s*box|велком/i.test(t),
    },
    {
        slug: 'keychain',
        labelRu: 'брелок',
        briefMandatory: [/брелок|обвес/i],
        matchProduct: (t) => /брелок|обвес|keychain/i.test(t),
    },
    {
        slug: 'towel',
        labelRu: 'полотенце',
        briefMandatory: [/полотен[а-я]*/i],
        matchProduct: (t) => /полотен|towel/i.test(t),
    },
    {
        slug: 'apron',
        labelRu: 'фартук',
        briefMandatory: [/фартук[а-я]*/i],
        matchProduct: (t) => /фартук|apron/i.test(t),
    },
    {
        slug: 'calendar',
        labelRu: 'календарь',
        briefMandatory: [/календар[а-я]*/i],
        matchProduct: (t) => /календар|calendar/i.test(t),
    },
    {
        slug: 'sticker',
        labelRu: 'стикер',
        briefMandatory: [/стикер[а-я]*/i, /наклейк[а-я]*/i],
        matchProduct: (t) => /стикер|наклейк|sticker/i.test(t),
    },
    {
        slug: 'multitool',
        labelRu: 'мультитул',
        briefMandatory: [/мультитул|multi.?tool/i],
        matchProduct: (t) => /мультитул|multi.?tool/i.test(t),
    },
    {
        slug: 'socks',
        labelRu: 'носки',
        briefMandatory: [/носк[а-я]*/i],
        matchProduct: (t) => /носк|socks/i.test(t) && !/ручк/i.test(t),
    },
    {
        slug: 'lanyard',
        labelRu: 'ланьярд',
        briefMandatory: [/ланъярд|ланьярд|бейдж|lanyard/i],
        matchProduct: (t) => /ланьярд|бейдж|lanyard/i.test(t),
    },
    {
        slug: 'cosmetic_bag',
        labelRu: 'косметичка',
        briefMandatory: [/косметич/i],
        matchProduct: (t) => /косметич/i.test(t),
    },
    {
        slug: 'candle',
        labelRu: 'свеча',
        briefMandatory: [/свеч[а-яё]*/i, /аромат[а-яё]*\s*свеч/i],
        matchProduct: (t) => /свеч|candle|аромат.*свеч/i.test(t),
    },
    {
        slug: 'fitness',
        labelRu: 'фитнес',
        briefMandatory: [/фитнес.*резинк|резинк.*фитнес|фитнес.*набор/i],
        matchProduct: (t) => /фитнес|fitness|резинк.*спорт/i.test(t),
    },
    {
        slug: 'stress_ball',
        labelRu: 'антистресс',
        briefMandatory: [/антистресс/i, /мяч.*антистресс|антистресс.*мяч/i],
        matchProduct: (t) => /антистресс|stress.*ball|squeeze/i.test(t),
    },
    {
        slug: 'christmas_decor',
        labelRu: 'новогодний декор',
        briefMandatory: [/ёлочн|елочн|новогод/i],
        matchProduct: (t) => /ёлочн|елочн|новогод|christmas|игрушк.*ёлк/i.test(t),
    },
    {
        slug: 'car_accessory',
        labelRu: 'автоаксессуар',
        briefMandatory: [/авто|машин|car\b/i],
        matchProduct: (t) => /шторк|авто|car\b|салон авто|подголовник/i.test(t),
    },
    {
        slug: 'decanter',
        labelRu: 'декантер',
        briefMandatory: [/декантер/i, /\bdecanter\b/i],
        matchProduct: (t) => /декантер|decanter|wine\s*decanter/i.test(t),
    },
    {
        slug: 'mortar',
        labelRu: 'ступка',
        briefMandatory: [/ступк/i, /\bmortar\b/i],
        matchProduct: (t) => /ступк|mortar|pestle|пестик/i.test(t),
    },
    {
        slug: 'flask',
        labelRu: 'штоф',
        briefMandatory: [/штоф/i, /\bflask\b/i, /графин/i],
        matchProduct: (t) => /штоф|flask|carafe|графин/i.test(t),
    },
    {
        slug: 'shaker',
        labelRu: 'шейкер',
        briefMandatory: [/шейкер/i, /\bshaker\b/i],
        matchProduct: (t) => /шейкер|shaker|коктейльн\w*\s*шейкер/i.test(t),
    },
    {
        slug: 'projector',
        labelRu: 'проектор',
        briefMandatory: [/проектор/i, /\bprojector\b/i],
        matchProduct: (t) => /проектор|projector|mini\s*projector/i.test(t),
    },
];
function conceptTypeLabel(slug) {
    return exports.CONCEPT_TYPE_DEFINITIONS.find((d) => d.slug === slug)?.labelRu ?? slug;
}
function productSlotsSignature(slots) {
    return [...slots.map((s) => s.type)].sort().join('|');
}
function normalizeThemeAxis(axis) {
    return String(axis ?? '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_');
}
function mandatoryTypeAliases(slug) {
    switch (slug) {
        case 'thermos':
            return ['thermos', 'thermos_mug', 'tumbler'];
        case 'blanket':
            return ['blanket'];
        case 'mug':
            return ['mug', 'thermos_mug'];
        default:
            return [slug];
    }
}
function hasMandatoryTypeInProducts(products, mandatorySlug) {
    const aliases = new Set(mandatoryTypeAliases(mandatorySlug));
    return products.some((p) => aliases.has(detectConceptProductType(p)));
}
function extractExplicitMandatoryTypesFromBrief(brief) {
    const text = normalizeText(brief);
    const found = new Set();
    const sections = [
        text.match(/обязательн\w*[^.!?]{0,160}/i)?.[0] ?? '',
        text.match(/должн\w*\s+(?:быть|включать|содержать|состоять)[^.!?]{0,160}/i)?.[0] ?? '',
        text.match(/(?:такие?\s+как|включая|включить)\s+[^.!?]{0,120}/i)?.[0] ?? '',
    ].join(' ');
    const keywordMap = [
        { re: /термос|термостакан|термокруж/i, slug: 'thermos' },
        { re: /плед/i, slug: 'blanket' },
        { re: /кружк/i, slug: 'mug' },
        { re: /полотен/i, slug: 'towel' },
        { re: /фартук/i, slug: 'apron' },
        { re: /календар/i, slug: 'calendar' },
    ];
    for (const { re, slug } of keywordMap) {
        if (re.test(sections) || re.test(text))
            found.add(slug);
    }
    return [...found];
}
exports.CATALOG_IDEATOR_TYPE_SLUGS = exports.CONCEPT_TYPE_DEFINITIONS.map((d) => d.slug).filter((s) => !['christmas_decor', 'car_accessory', 'keychain'].includes(s));
function detectMandatoryConceptTypesFromBrief(brief) {
    const text = normalizeText(brief);
    const altGroups = detectAlternativeTypeGroupsFromBrief(brief);
    const altOnly = new Set(altGroups.flat());
    const found = new Set(extractExplicitMandatoryTypesFromBrief(brief));
    for (const def of exports.CONCEPT_TYPE_DEFINITIONS) {
        const matched = def.briefMandatory.some((re) => re.test(text));
        if (!matched)
            continue;
        if (altOnly.has(def.slug) && !isTypeRequiredWithAnd(brief, def.slug))
            continue;
        found.add(def.slug);
    }
    if (/обязательн\w*/i.test(brief) && /термос/i.test(text) && /плед/i.test(text)) {
        found.add('thermos');
        found.add('blanket');
    }
    return [...found];
}
function detectAlternativeTypeGroupsFromBrief(brief) {
    const text = brief.replace(/\s+/g, ' ').trim();
    if (!text)
        return [];
    const groups = [];
    const seen = new Set();
    const multiOrPattern = /(?:^|[\s,;.])(?:или\s+([^,;.\n]+?))(?:,\s*или\s+([^,;.\n]+?))+/gi;
    let match;
    while ((match = multiOrPattern.exec(text)) !== null) {
        const segment = match[0];
        const types = typesFromBriefSegment(segment);
        if (types.length >= 2) {
            const key = [...types].sort().join('|');
            if (!seen.has(key)) {
                seen.add(key);
                groups.push(types);
            }
        }
    }
    const binaryOrPattern = /([^,;.\n]{2,60}?)\s+или\s+([^,;.\n]{2,60}?)(?=[,;.\n]|$)/gi;
    while ((match = binaryOrPattern.exec(text)) !== null) {
        const left = match[1].trim();
        const right = match[2].trim();
        if (/\bили\b/i.test(left) || /\bили\b/i.test(right))
            continue;
        const types = [
            ...typesFromBriefSegment(left),
            ...typesFromBriefSegment(right),
        ];
        const unique = [...new Set(types)];
        if (unique.length >= 2) {
            const key = [...unique].sort().join('|');
            if (!seen.has(key)) {
                seen.add(key);
                groups.push(unique);
            }
        }
    }
    return groups;
}
function typesFromBriefSegment(segment) {
    const norm = normalizeText(segment);
    const found = [];
    for (const def of exports.CONCEPT_TYPE_DEFINITIONS) {
        if (def.briefMandatory.some((re) => re.test(norm)) || def.matchProduct(norm)) {
            if (!found.includes(def.slug))
                found.push(def.slug);
        }
    }
    return found.filter((s) => exports.CATALOG_IDEATOR_TYPE_SLUGS.includes(s));
}
function isTypeRequiredWithAnd(brief, slug) {
    const def = exports.CONCEPT_TYPE_DEFINITIONS.find((d) => d.slug === slug);
    if (!def)
        return false;
    const label = def.labelRu;
    const patterns = [
        new RegExp(`(?:и|а также|плюс|ещё|еще)\\s+[^,;.\n]{0,40}${label}`, 'i'),
        new RegExp(`${label}[^,;.\n]{0,40}\\s+и\\s+`, 'i'),
        new RegExp(`(?:нужн\\w*|обязательн\\w*|требу\\w*)[^,;.\n]{0,30}${label}`, 'i'),
    ];
    return patterns.some((re) => re.test(brief));
}
function pickAlternativeTypesForConcept(groups, conceptIndex) {
    const picked = [];
    for (let gi = 0; gi < groups.length; gi++) {
        const group = groups[gi].filter((t) => exports.CATALOG_IDEATOR_TYPE_SLUGS.includes(t));
        if (!group.length)
            continue;
        const idx = (conceptIndex + gi * 2) % group.length;
        picked.push(group[idx]);
    }
    return picked;
}
class ConceptDiversityTracker {
    constructor(mandatoryTypes) {
        this.mandatoryTypes = mandatoryTypes;
        this.usage = new Map();
    }
    canUseType(type) {
        const used = this.usage.get(type) ?? 0;
        const limit = this.mandatoryTypes.has(type)
            ? exports.MANDATORY_TYPE_MAX_CONCEPTS
            : exports.OPTIONAL_TYPE_MAX_CONCEPTS;
        return used < limit;
    }
    recordConceptTypes(types) {
        const seen = new Set();
        for (const type of types) {
            if (seen.has(type))
                continue;
            seen.add(type);
            this.usage.set(type, (this.usage.get(type) ?? 0) + 1);
        }
    }
    usageCount(type) {
        return this.usage.get(type) ?? 0;
    }
}
exports.ConceptDiversityTracker = ConceptDiversityTracker;
function isProductSelectable(product, localTypes, tracker, blockedIds, blockedVariants, picked) {
    if (blockedIds.has(product.id))
        return false;
    const vk = (0, catalog_variant_util_1.productVariantKey)(product);
    if (blockedVariants.has(vk))
        return false;
    if (picked.some((p) => p.id === product.id))
        return false;
    const type = detectConceptProductType(product);
    if (typeConflictsInSet(localTypes, type))
        return false;
    if (!tracker.canUseType(type))
        return false;
    return true;
}
function pickDiverseProduct(catalog, localTypes, tracker, blockedIds, blockedVariants, picked, seed, scoreFn) {
    const pool = catalog
        .filter((p) => isProductSelectable(p, localTypes, tracker, blockedIds, blockedVariants, picked))
        .sort((a, b) => (scoreFn?.(b) ?? 0) - (scoreFn?.(a) ?? 0));
    if (!pool.length)
        return null;
    const top = pool.slice(0, Math.min(16, pool.length));
    const start = Math.abs(seed) % top.length;
    for (let i = 0; i < top.length; i++) {
        const product = top[(start + i) % top.length];
        if (isProductSelectable(product, localTypes, tracker, blockedIds, blockedVariants, picked)) {
            return product;
        }
    }
    return null;
}
function enforceConceptSetDiversity(products, catalog, desiredCount, tracker, blockedIds, blockedVariants, seed, recordUsage = true, scoreFn) {
    const result = [];
    const localTypes = new Set();
    for (const product of products) {
        const type = detectConceptProductType(product);
        const vk = (0, catalog_variant_util_1.productVariantKey)(product);
        const valid = !typeConflictsInSet(localTypes, type) &&
            tracker.canUseType(type) &&
            !blockedIds.has(product.id) &&
            !blockedVariants.has(vk);
        if (valid) {
            result.push(product);
            localTypes.add(type);
            continue;
        }
        const replacement = pickDiverseProduct(catalog, localTypes, tracker, blockedIds, blockedVariants, result, seed + result.length, scoreFn);
        if (replacement) {
            result.push(replacement);
            localTypes.add(detectConceptProductType(replacement));
        }
    }
    while (result.length < desiredCount) {
        const extra = pickDiverseProduct(catalog, localTypes, tracker, blockedIds, blockedVariants, result, seed + result.length * 7, scoreFn);
        if (!extra)
            break;
        result.push(extra);
        localTypes.add(detectConceptProductType(extra));
    }
    if (recordUsage) {
        tracker.recordConceptTypes(result.map(detectConceptProductType));
    }
    return result.slice(0, desiredCount);
}
//# sourceMappingURL=concept-diversity.util.js.map
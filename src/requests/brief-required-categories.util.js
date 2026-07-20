"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractRequiredCategoriesFromBrief = extractRequiredCategoriesFromBrief;
const CATEGORY_TRIGGERS = [
    {
        key: 'sweets',
        labelRu: 'сладости',
        patterns: [/сладост/i, /конфет/i, /шоколад/i, /прян/i, /десерт/i],
        countPattern: /(?:минимум|как\s+минимум|не\s+менее)\s+(\d+)\s+[^.!?]{0,30}сладост/i,
    },
    {
        key: 'tech_accessories',
        labelRu: 'технические аксессуары',
        patterns: [
            /техническ\w*\s+аксессуар/i,
            /it[\s-]аксессуар/i,
            /гаджет/i,
            /usb/i,
            /кабел/i,
            /powerbank|пауэр/i,
            /флешк/i,
            /зарядн/i,
        ],
        countPattern: /(?:минимум|как\s+минимум|не\s+менее)\s+(\d+)\s+[^.!?]{0,40}техническ\w*\s+аксессуар/i,
    },
    {
        key: 'learning_materials',
        labelRu: 'обучающие материалы',
        patterns: [
            /обучающ/i,
            /руководств/i,
            /гайд/i,
            /методич/i,
            /учебн/i,
            /книг/i,
            /блокнот/i,
            /ежедневник/i,
        ],
        countPattern: /(?:минимум|как\s+минимум|не\s+менее)\s+(\d+)\s+[^.!?]{0,40}обучающ/i,
    },
    {
        key: 'eco_products',
        labelRu: 'эко-товары',
        patterns: [/эко[\s-]товар/i, /экологичн\w*\s+продук/i, /переработ/i, /бамбук/i],
    },
    {
        key: 'premium_items',
        labelRu: 'эксклюзивные предметы',
        patterns: [/эксклюзивн/i, /премиальн/i, /vip/i, /люкс/i, /роскошн/i],
    },
    {
        key: 'winter_accessory',
        labelRu: 'зимние аксессуары',
        patterns: [/шарф/i, /перчат/i, /вареж/i, /зимн\w*\s+аксессуар/i],
    },
    {
        key: 'sport',
        labelRu: 'спортивные аксессуары',
        patterns: [
            /спорт[\s-]*аксессуар/i,
            /спортивн\w*\s+аксессуар/i,
            /коврик/i,
            /эспандер/i,
            /скакалк/i,
            /фитнес/i,
        ],
    },
    {
        key: 'art',
        labelRu: 'художественные принадлежности',
        patterns: [/маркер/i, /краск/i, /кист/i, /скетчбук/i, /худож/i, /рисован/i, /искусств/i],
    },
    {
        key: 'travel',
        labelRu: 'дорожные аксессуары',
        patterns: [/дорожн\w*\s+набор/i, /органайзер/i, /аксессуар\w*\s+для\s+путешеств/i],
    },
];
function normalizeText(text) {
    return text.toLowerCase().replace(/ё/g, 'е');
}
function sectionMentionsCategory(text, patterns) {
    const mandatorySection = text.match(/обязательн\w*[^.!?]{0,200}/i)?.[0] ??
        text.match(/обязательно\s+включить[^.!?]{0,200}/i)?.[0] ??
        text.match(/должн\w*\s+(?:быть|включать|содержать|состоять)[^.!?]{0,200}/i)?.[0] ??
        text.match(/(?:такие?\s+как|включая|включить|содержать)\s+[^.!?]{0,160}/i)?.[0] ??
        '';
    const search = `${mandatorySection} ${text}`;
    return patterns.some((p) => p.test(search));
}
function resolveMinCount(text, trigger) {
    if (trigger.countPattern) {
        const m = text.match(trigger.countPattern);
        if (m) {
            const n = parseInt(m[1], 10);
            if (n >= 1 && n <= 8)
                return n;
        }
    }
    const genericCount = text.match(new RegExp(`(?:минимум|как\\s+минимум|не\\s+менее)\\s+(\\d+)\\s+[^.!?]{0,40}${trigger.patterns[0].source}`, 'i'));
    if (genericCount) {
        const n = parseInt(genericCount[1], 10);
        if (n >= 1 && n <= 8)
            return n;
    }
    if (/обязательн/i.test(text) && sectionMentionsCategory(text, trigger.patterns))
        return 1;
    if (/должен\s+включать|включить\s+.*\s+и\s+/i.test(text) && sectionMentionsCategory(text, trigger.patterns)) {
        return 1;
    }
    return 0;
}
function extractRequiredCategoriesFromBrief(text) {
    const norm = normalizeText(text);
    const found = [];
    for (const trigger of CATEGORY_TRIGGERS) {
        const minCount = resolveMinCount(norm, trigger);
        if (minCount > 0) {
            found.push({ key: trigger.key, labelRu: trigger.labelRu, minCount });
            continue;
        }
        if (sectionMentionsCategory(norm, trigger.patterns) && /обязательн|должен\s+включать|включить/i.test(norm)) {
            found.push({ key: trigger.key, labelRu: trigger.labelRu, minCount: 1 });
        }
    }
    const byKey = new Map();
    for (const req of found) {
        const prev = byKey.get(req.key);
        if (!prev || req.minCount > prev.minCount)
            byKey.set(req.key, req);
    }
    return [...byKey.values()];
}
//# sourceMappingURL=brief-required-categories.util.js.map
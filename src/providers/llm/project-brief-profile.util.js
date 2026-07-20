"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractProjectBriefProfile = extractProjectBriefProfile;
exports.scoreProjectCategorySoftMatch = scoreProjectCategorySoftMatch;
exports.scoreAllowedItemSoftMatch = scoreAllowedItemSoftMatch;
exports.profileToLlmPayload = profileToLlmPayload;
const brief_category_buckets_util_1 = require("../../catalog/brief-category-buckets.util");
function normalizeText(text) {
    return String(text ?? '').toLowerCase().replace(/ё/g, 'е').trim();
}
function firstMatch(text, patterns) {
    for (const p of patterns) {
        const m = text.match(p);
        if (m?.[1])
            return m[1].trim().slice(0, 200);
    }
    return null;
}
function collectMatches(text, patterns) {
    const out = [];
    for (const p of patterns) {
        const m = text.match(p);
        if (m?.[1])
            out.push(m[1].trim().slice(0, 120));
    }
    return [...new Set(out)];
}
const PREMIUM_HINTS = /премиум|vip|партн[её]р|люкс|элит|дорог|status|executive/i;
const PRACTICAL_HINTS = /офис|ежедневн|полезн|практич|utility|рабоч/i;
const WOW_HINTS = /вау|wow|необычн|запомина|имиджев|шоу/i;
const SUMMER_HINTS = /летн|outdoor|фестивал|пляж|open\s*air/i;
const WINTER_HINTS = /зимн|новогод|рождеств|ёлоч|елоч/i;
const AUDIENCE_PATTERNS = [
    /аудитория[:\s—-]+([^.!\n]{3,120})/i,
    /для\s+(сотрудник\w*|клиент\w*|партн[её]р\w*|участник\w*|гост\w*|it-?\w*|разработчик\w*)([^.!\n]{0,80})?/i,
    /целевая\s+аудитория[:\s—-]+([^.!\n]{3,120})/i,
];
const OCCASION_PATTERNS = [
    /(?:повод|событие|мероприятие)[:\s—-]+([^.!\n]{3,120})/i,
    /(конференц\w*|выставк\w*|форум\w*|ивент\w*|фестивал\w*|корпоратив\w*|онбординг\w*|welcome\s*pack)/i,
];
const GOAL_PATTERNS = [
    /цель[:\s—-]+([^.!\n]{3,160})/i,
    /нужно\s+([^.!\n]{8,160})/i,
    /задача[:\s—-]+([^.!\n]{3,160})/i,
];
const INDUSTRY_PATTERNS = [
    /(?:отрасль|индустрия|сфера)[:\s—-]+([^.!\n]{3,80})/i,
    /(it-компани\w*|финтех\w*|банк\w*|ритейл\w*|логистик\w*|медицин\w*|образован\w*)/i,
];
const USAGE_PATTERNS = [
    /сценарий[:\s—-]+([^.!\n]{3,120})/i,
    /(офис\w*|удал[её]н\w*|outdoor\w*|мероприяти\w*|конференц\w*|поездк\w*|путешеств\w*)/i,
];
const PROJECT_CATEGORY_SOFT_TYPES = {
    'welcome pack': ['notebook', 'mug', 'pen', 'bag', 'bottle', 'tshirt'],
    'корпоративный мерч': ['tshirt', 'hoodie', 'bag', 'mug', 'pen'],
    'подарки клиентам': ['premium_box', 'bottle', 'notebook', 'umbrella'],
    'подарки партнёрам': ['premium_box', 'bottle', 'umbrella', 'powerbank'],
    'подарки партнерам': ['premium_box', 'bottle', 'umbrella', 'powerbank'],
    конференция: ['pen', 'notebook', 'bag', 'bottle', 'powerbank', 'usb'],
    выставка: ['bag', 'pen', 'notebook', 'badge'],
    'новый год': ['christmas_decor', 'mug', 'premium_box'],
    'hr-мероприятие': ['tshirt', 'bag', 'mug', 'badge'],
    'брендированный набор': ['bag', 'mug', 'pen', 'notebook'],
};
function extractProjectBriefProfile(input) {
    const brief = String(input.userPrompt ?? '').trim();
    const norm = normalizeText(brief);
    const category = String(input.projectCategory ?? '').trim();
    let positioning = 'balanced';
    if (PREMIUM_HINTS.test(brief))
        positioning = 'premium';
    else if (PRACTICAL_HINTS.test(brief))
        positioning = 'practical';
    else if (WOW_HINTS.test(brief))
        positioning = 'wow';
    let seasonality = null;
    if (SUMMER_HINTS.test(norm))
        seasonality = 'summer';
    else if (WINTER_HINTS.test(norm))
        seasonality = 'winter';
    const budgetSignal = /бюджет|до\s+\d|не\s+дороже|эконом/i.test(brief) ? brief.match(/бюджет[^.!\n]{0,80}/i)?.[0] ?? 'budget mentioned' : null;
    const mustHave = collectMatches(brief, [
        /обязательно[:\s—-]+([^.!\n]{3,120})/gi,
        /must[\s-]?have[:\s—-]+([^.!\n]{3,120})/gi,
    ]);
    const forbiddenFromBrief = collectMatches(brief, [
        /нельзя[:\s—-]+([^.!\n]{3,120})/gi,
        /запрещ[а-я]+[:\s—-]+([^.!\n]{3,120})/gi,
        /без\s+([^.!\n]{3,80})/gi,
    ]);
    const summaryParts = [
        brief.slice(0, 400),
        category ? `Категория проекта: ${category}` : '',
        positioning !== 'balanced' ? `Позиционирование: ${positioning}` : '',
        seasonality ? `Сезонность: ${seasonality}` : '',
    ].filter(Boolean);
    return {
        goal: firstMatch(brief, GOAL_PATTERNS),
        audience: firstMatch(brief, AUDIENCE_PATTERNS),
        occasion: firstMatch(brief, OCCASION_PATTERNS),
        brandTone: /тон\s+бренд|tone\s+of\s+voice|фирменн\w+\s+стил/i.test(brief)
            ? brief.match(/тон[^.!\n]{0,100}/i)?.[0] ?? null
            : null,
        emotions: collectMatches(brief, [/эмоци\w+[:\s—-]+([^.!\n]{3,80})/gi]),
        industry: firstMatch(brief, INDUSTRY_PATTERNS),
        seasonality,
        budgetSignal,
        mustHave,
        forbidden: [...forbiddenFromBrief, ...(input.forbiddenItems ?? [])],
        preferredCategories: input.allowedItems ?? [],
        avoidedCategories: input.forbiddenItems ?? [],
        colorPreferences: input.colors ?? [],
        communicationStyle: /делов\w+|дружелюбн\w+|строг\w+|молодежн\w+/i.test(brief)
            ? brief.match(/(делов\w+|дружелюбн\w+|строг\w+|молодежн\w+)/i)?.[0] ?? null
            : null,
        positioning,
        usageScenario: firstMatch(brief, USAGE_PATTERNS),
        projectCategory: category || null,
        briefSummary: summaryParts.join(' · ').slice(0, 600),
    };
}
function scoreProjectCategorySoftMatch(productType, projectCategory) {
    if (!projectCategory)
        return 0;
    const key = normalizeText(projectCategory);
    let best = 0;
    for (const [cat, types] of Object.entries(PROJECT_CATEGORY_SOFT_TYPES)) {
        if (key.includes(cat) || cat.includes(key)) {
            if (types.includes(productType))
                best = Math.max(best, 12);
            else
                best = Math.max(best, 2);
        }
    }
    return best;
}
function scoreAllowedItemSoftMatch(productName, productDescription, allowedItems) {
    if (!allowedItems.length)
        return 0;
    const text = normalizeText(`${productName} ${productDescription}`);
    const buckets = (0, brief_category_buckets_util_1.normalizeBriefAllowedBuckets)(allowedItems);
    let score = 0;
    for (const bucket of buckets) {
        const keywords = brief_category_buckets_util_1.BUCKET_SOFT_KEYWORDS[bucket] ?? [];
        for (const kw of keywords) {
            if (text.includes(kw))
                score += 14;
        }
    }
    for (const item of allowedItems) {
        const token = normalizeText(item);
        if (!token || token.length < 3)
            continue;
        if (text.includes(token))
            score += 10;
        else if (token.split(/\s+/).some((w) => w.length >= 4 && text.includes(w)))
            score += 5;
    }
    return score;
}
function profileToLlmPayload(profile) {
    return {
        briefSummary: profile.briefSummary,
        goal: profile.goal,
        audience: profile.audience,
        occasion: profile.occasion,
        brandTone: profile.brandTone,
        desiredEmotions: profile.emotions,
        industry: profile.industry,
        seasonality: profile.seasonality,
        budgetConstraints: profile.budgetSignal,
        mustHaveElements: profile.mustHave,
        prohibitions: profile.forbidden,
        preferredMerchTypes: profile.preferredCategories,
        avoidedMerchTypes: profile.avoidedCategories,
        colorPreferences: profile.colorPreferences,
        communicationStyle: profile.communicationStyle,
        positioning: profile.positioning,
        usageScenario: profile.usageScenario,
        projectCategorySoftSignal: profile.projectCategory,
    };
}
//# sourceMappingURL=project-brief-profile.util.js.map
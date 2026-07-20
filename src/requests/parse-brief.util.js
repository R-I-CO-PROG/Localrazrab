"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractRequiredCategoriesFromBrief = exports.briefAvoidsCoolColors = exports.briefPrefersWarmColors = exports.extractBriefForbiddenColorHints = exports.extractBriefColorsFromText = exports.extractBriefColorPalette = void 0;
exports.parseBriefLocally = parseBriefLocally;
exports.mergeParsedBrief = mergeParsedBrief;
const brief_category_buckets_util_1 = require("../catalog/brief-category-buckets.util");
const brief_options_1 = require("./brief-options");
const brief_constraints_util_1 = require("./brief-constraints.util");
const parse_desired_count_1 = require("../providers/llm/parse-desired-count");
const concept_diversity_util_1 = require("../providers/llm/concept-diversity.util");
const sanitize_request_integers_1 = require("../common/sanitize-request-integers");
const parse_money_amount_util_1 = require("./parse-money-amount.util");
const brief_color_palette_util_1 = require("./brief-color-palette.util");
Object.defineProperty(exports, "extractBriefColorPalette", { enumerable: true, get: function () { return brief_color_palette_util_1.extractBriefColorPalette; } });
Object.defineProperty(exports, "extractBriefColorsFromText", { enumerable: true, get: function () { return brief_color_palette_util_1.extractBriefColorsFromText; } });
Object.defineProperty(exports, "extractBriefForbiddenColorHints", { enumerable: true, get: function () { return brief_color_palette_util_1.extractBriefForbiddenColorHints; } });
Object.defineProperty(exports, "briefPrefersWarmColors", { enumerable: true, get: function () { return brief_color_palette_util_1.briefPrefersWarmColors; } });
Object.defineProperty(exports, "briefAvoidsCoolColors", { enumerable: true, get: function () { return brief_color_palette_util_1.briefAvoidsCoolColors; } });
const brief_required_categories_util_1 = require("./brief-required-categories.util");
Object.defineProperty(exports, "extractRequiredCategoriesFromBrief", { enumerable: true, get: function () { return brief_required_categories_util_1.extractRequiredCategoriesFromBrief; } });
const brief_color_hex_util_1 = require("./brief-color-hex.util");
const named_positions_util_1 = require("./named-positions.util");
function parseQuantity(text) {
    const patterns = [
        /тираж[:\s]*(\d[\d\s]*)/i,
        /(\d[\d\s]*)\s*(?:человек|сотрудник|участник|персон|employees|people)/i,
        /(?:на|для)\s+(\d[\d\s]*)\s*(?:чел|человек|сотрудник|участник)/i,
        /(\d[\d\s]*)\s*(?:шт\.?|штук|единиц|копий|exemplars)/i,
        /заказ\s+(?:на\s+)?(\d[\d\s]*)/i,
        /(\d[\d\s]*)\s*(?:подарк|набор)/i,
    ];
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
            const n = parseInt(match[1].replace(/\s/g, ''), 10);
            if (n >= 1 && n <= 1_000_000)
                return n;
        }
    }
    return null;
}
function parseBudget(text) {
    const range = text.match(/(?:бюджет|budget)[^\d]{0,20}(\d[\d\s]*)\s*[-–—]\s*(\d[\d\s]*)/i) ??
        text.match(/(?:от)\s*(\d[\d\s]*)\s*(?:до|–|-)\s*(\d[\d\s]*)\s*(?:₽|руб)/i) ??
        text.match(/(\d[\d\s]*)\s*[-–—]\s*(\d[\d\s]*)\s*(?:₽|руб)/i);
    if (range) {
        const min = parseInt(range[1].replace(/\s/g, ''), 10);
        const max = parseInt(range[2].replace(/\s/g, ''), 10);
        if (min > 0 && max >= min) {
            return { min, max, scope: (0, parse_money_amount_util_1.inferBudgetScope)(text, max) };
        }
    }
    const budgetLead = text.match(/(?:бюджет|budget)\s*[:\-–—]?\s*([^.!\n]{0,60})/i);
    if (budgetLead) {
        const amount = (0, parse_money_amount_util_1.parseRussianMoneyAmount)(budgetLead[1]);
        if (amount != null && amount >= sanitize_request_integers_1.LIMITS.budget.min) {
            const scope = (0, parse_money_amount_util_1.inferBudgetScope)(text, amount);
            if (scope === 'per_set') {
                return {
                    min: Math.max(sanitize_request_integers_1.LIMITS.budget.min, Math.round(amount * 0.6)),
                    max: amount,
                    scope,
                };
            }
            return {
                min: Math.max(sanitize_request_integers_1.LIMITS.budget.min, Math.round(amount * 0.85)),
                max: amount,
                scope,
            };
        }
    }
    const upTo = text.match(/(?:до|не\s+более)\s*([^.!\n]{0,40})/i);
    if (upTo) {
        const amount = (0, parse_money_amount_util_1.parseRussianMoneyAmount)(upTo[1]);
        if (amount != null && amount >= sanitize_request_integers_1.LIMITS.budget.min) {
            const scope = (0, parse_money_amount_util_1.inferBudgetScope)(text, amount);
            return {
                min: Math.max(sanitize_request_integers_1.LIMITS.budget.min, Math.round(amount * 0.2)),
                max: amount,
                scope,
            };
        }
    }
    const perUnit = text.match(/(\d[\d\s]*)\s*(?:₽|руб)\s*(?:\/|на)\s*(?:чел|единиц|шт)/i);
    if (perUnit) {
        const unit = parseInt(perUnit[1].replace(/\s/g, ''), 10);
        if (unit > 0) {
            return {
                min: Math.max(sanitize_request_integers_1.LIMITS.budget.min, Math.round(unit * 0.7)),
                max: Math.round(unit * 1.3),
                scope: 'per_set',
            };
        }
    }
    const single = text.match(/(?:бюджет|budget)[^\d]{0,20}(\d[\d\s]*)\s*(?:₽|руб|rub)/i) ??
        text.match(/(\d[\d\s]*)\s*(?:₽|руб)\s*(?:на\s+набор|per\s+set)/i) ??
        text.match(/(\d[\d\s]*)\s*(?:₽|руб(?:л\w*)?)\s*(?:[.,]|$)/i);
    if (single) {
        const val = parseInt(single[1].replace(/\s/g, ''), 10);
        if (val >= 100 && val <= 50000) {
            return {
                min: Math.max(100, Math.round(val * 0.6)),
                max: val,
                scope: (0, parse_money_amount_util_1.inferBudgetScope)(text, val),
            };
        }
    }
    return {};
}
function parseCategory(text) {
    const t = text.toLowerCase();
    if (/welcome|велком|онбординг|new hire/i.test(t))
        return 'Welcome Pack';
    if (/event|ивент|мероприят|конференц|форум|выставк/i.test(t))
        return 'Event Kit';
    if (/мерч|merch|streetwear|скейт|фанат/i.test(t))
        return 'Мерч';
    if (/корпоратив|подарк\s+клиент|b2b|партнер/i.test(t))
        return 'Корпоративные подарки';
    return null;
}
function parseAllowedCategories(text) {
    const lower = text.toLowerCase();
    const onlyMatch = lower.match(/(?:только|исключительно|нужн\w*\s+только)\s+([^.!\n]{3,80})/i);
    const segment = onlyMatch?.[1] ?? lower;
    const picked = [];
    const rules = [
        { cat: 'Текстиль', keys: ['текстил', 'одежд', 'футбол', 'худи', 'кепк', 'панам', 'мерч', 'дождевик', 'ветровк'] },
        { cat: 'Электроника', keys: ['электрон', 'powerbank', 'пауэр', 'флешк', 'usb', 'tech', 'it', 'гаджет', 'зарядк', 'колонк', 'наушник'] },
        { cat: 'Термосы и бутылки', keys: ['термос', 'бутыл', 'термокруж'] },
        { cat: 'Кружки', keys: ['круж', 'стакан', 'чашк', 'чайн'] },
        { cat: 'Ежедневники и блокноты', keys: ['ежедневник', 'блокнот', 'записн'] },
        { cat: 'Ручки', keys: ['ручк', 'pen '] },
        { cat: 'Сумки и рюкзаки', keys: ['сумк', 'рюкзак', 'шоппер', 'тоут'] },
        { cat: 'Зонты', keys: ['зонт'] },
        { cat: 'Часы', keys: ['часы', 'watch'] },
        { cat: 'Офис и канцелярия', keys: ['канцеляр', 'офис', 'папк', 'визитниц'] },
        { cat: 'Отдых и спорт', keys: ['спорт', 'фитнес', 'йог', 'outdoor'] },
        { cat: 'Подарочные наборы', keys: ['подароч', 'gift box', 'welcome box'] },
        { cat: 'Сувениры и награды', keys: ['сувенир', 'наград', 'статуэт'] },
        { cat: 'Посуда', keys: ['посуд'] },
        { cat: 'Канцелярия', keys: ['канцеляри'] },
        { cat: 'Эко', keys: ['эко', 'eco', 'переработ'] },
    ];
    for (const rule of rules) {
        if (rule.keys.some((k) => segment.includes(k)))
            picked.push(rule.cat);
    }
    if (picked.length === 0) {
        if (/it|айти|разработчик|программист|tech/i.test(lower)) {
            return (0, brief_category_buckets_util_1.normalizeBriefAllowedBuckets)([
                'Электроника',
                'Офис и канцелярия',
                'Термосы и бутылки',
            ]);
        }
        if (/кофе|coffee|бариста/i.test(lower)) {
            return (0, brief_category_buckets_util_1.normalizeBriefAllowedBuckets)(['Кружки', 'Термосы и бутылки']);
        }
        if (/vip|премиум|premium|luxury/i.test(lower)) {
            return (0, brief_category_buckets_util_1.normalizeBriefAllowedBuckets)([
                'Термосы и бутылки',
                'Ежедневники и блокноты',
                'Сумки и рюкзаки',
            ]);
        }
        if (/банк|финанс|юрид/i.test(lower)) {
            return (0, brief_category_buckets_util_1.normalizeBriefAllowedBuckets)([
                'Ежедневники и блокноты',
                'Ручки',
                'Офис и канцелярия',
            ]);
        }
        return null;
    }
    return (0, brief_category_buckets_util_1.normalizeBriefAllowedBuckets)([...new Set(picked)]);
}
function parseForbidden(text) {
    const lower = text.toLowerCase();
    const found = new Set();
    if (/без\s+алкогол|не\s+алкогол|no\s+alcohol/i.test(lower))
        found.add('Алкоголь');
    if (/без\s+еды|не\s+еда|no\s+food|без\s+продуктов/i.test(lower))
        found.add('Еда');
    if (/без\s+одежд|не\s+одежд|no\s+clothing|без\s+футбол/i.test(lower))
        found.add('Одежда');
    if (/алкогол|вино|шампан/i.test(lower) && /без|не\s+нужн|исключ/i.test(lower)) {
        found.add('Алкоголь');
    }
    return [...found].filter((f) => brief_options_1.BRIEF_FORBIDDEN_OPTIONS.includes(f));
}
function parseSetItemCount(text) {
    const bounds = (0, parse_desired_count_1.parseItemCountBounds)(text);
    if (bounds)
        return Math.round((bounds.min + bounds.max) / 2);
    const fromBrief = (0, parse_desired_count_1.parseDesiredItemCount)(text);
    if (fromBrief)
        return fromBrief;
    const patterns = [
        /(\d+)\s*(?:товар\w*|позици\w*|предмет\w*|sku|sku\s*в\s*набор)/i,
        /набор\s*(?:из|на)\s*(\d+)/i,
        /(\d+)\s*(?:разн\w*|вид\w*)\s*(?:товар|позици)/i,
        /(\d+)\s+в\s+набор/i,
        /в\s+набор[е]?\s*(\d+)/i,
        /(?:товар\w*|позици\w*|предмет\w*)\s+в\s+набор[е]?\s*[:\-]?\s*(\d+)/i,
    ];
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
            const n = parseInt(match[1], 10);
            if (n >= 1 && n <= 8)
                return n;
        }
    }
    return null;
}
function clampBudget(min, max) {
    const lo = Math.max(sanitize_request_integers_1.LIMITS.budget.min, Math.min(min, sanitize_request_integers_1.LIMITS.budget.max));
    const hi = Math.max(lo, Math.min(max, sanitize_request_integers_1.LIMITS.budget.max));
    return { budgetMin: lo, budgetMax: hi };
}
function finalizeParsedBrief(text, result) {
    const splitExisting = (0, named_positions_util_1.splitAllowedItemsMixed)([
        ...(result.allowedItems ?? []),
        ...(result.namedItems ?? []),
    ]);
    result.allowedItems = splitExisting.categories;
    result.namedItems = [...new Set([...splitExisting.namedItems, ...(result.namedItems ?? [])])];
    const reconciled = (0, brief_constraints_util_1.reconcileBriefConstraints)(text, result.allowedItems ?? [], result.forbiddenItems ?? [], result.budgetMax);
    result.forbiddenItems = reconciled.forbiddenItems;
    if (reconciled.allowedItems.length) {
        const mergedAllowed = [...new Set([...(result.allowedItems ?? []), ...reconciled.allowedItems])];
        result.allowedItems = mergedAllowed.filter((c) => brief_options_1.BRIEF_ALLOWED_CATEGORIES.includes(c));
    }
    const fromBrief = (0, named_positions_util_1.parseNamedPositionsFromBrief)(text);
    if (fromBrief.length) {
        result.namedItems = [...new Set([...(result.namedItems ?? []), ...fromBrief])];
        if (!result.updatedFields.includes('namedItems')) {
            result.updatedFields.push('namedItems');
        }
    }
    if ((0, brief_constraints_util_1.briefRequestsClothing)(text)) {
        if (!result.updatedFields.includes('forbiddenItems')) {
            result.updatedFields.push('forbiddenItems');
        }
        if (result.allowedItems?.length && !result.updatedFields.includes('allowedItems')) {
            result.updatedFields.push('allowedItems');
        }
    }
    return result;
}
function parseBriefLocally(userPrompt) {
    const text = userPrompt.trim();
    const updatedFields = [];
    const result = { updatedFields };
    if (text.length < 8)
        return result;
    const category = parseCategory(text);
    if (category && brief_options_1.BRIEF_CATEGORIES.includes(category)) {
        result.category = category;
        updatedFields.push('category');
    }
    const quantity = parseQuantity(text);
    if (quantity) {
        result.quantity = quantity;
        updatedFields.push('quantity');
    }
    const budget = parseBudget(text);
    if (budget.min || budget.max) {
        const min = budget.min ?? budget.max;
        const max = budget.max ?? budget.min;
        const clamped = clampBudget(min, max);
        result.budgetMin = clamped.budgetMin;
        result.budgetMax = clamped.budgetMax;
        result.budgetScope = budget.scope ?? (0, parse_money_amount_util_1.inferBudgetScope)(text, max);
        updatedFields.push('budgetMin', 'budgetMax');
    }
    const palette = (0, brief_color_palette_util_1.extractBriefColorPalette)(text);
    if (palette.allowedColors.length > 0) {
        result.colors = palette.allowedColors;
        updatedFields.push('colors');
    }
    const allowed = parseAllowedCategories(text);
    if (allowed && allowed.length > 0) {
        result.allowedItems = allowed;
        updatedFields.push('allowedItems');
    }
    const forbidden = parseForbidden(text);
    if (forbidden.length > 0) {
        result.forbiddenItems = forbidden;
        updatedFields.push('forbiddenItems');
    }
    const setItemCount = parseSetItemCount(text);
    if (setItemCount) {
        result.setItemCount = setItemCount;
        updatedFields.push('setItemCount');
    }
    const altGroups = (0, concept_diversity_util_1.detectAlternativeTypeGroupsFromBrief)(text);
    if (altGroups.length > 0) {
        result.alternativeTypeGroups = altGroups;
        updatedFields.push('alternativeTypeGroups');
    }
    const namedItems = (0, named_positions_util_1.parseNamedPositionsFromBrief)(text);
    if (namedItems.length > 0) {
        result.namedItems = namedItems;
        updatedFields.push('namedItems');
    }
    result.updatedFields = updatedFields;
    return finalizeParsedBrief(text, result);
}
function mergeParsedBrief(userPrompt, local, llm) {
    const updatedFields = new Set(local.updatedFields);
    const merged = { ...local, updatedFields: [] };
    const localHas = (field) => local.updatedFields.includes(field);
    if (llm.category && brief_options_1.BRIEF_CATEGORIES.includes(llm.category)) {
        merged.category = llm.category;
        updatedFields.add('category');
    }
    if (!localHas('quantity')) {
        updatedFields.delete('quantity');
        delete merged.quantity;
    }
    if ((llm.budgetMin || llm.budgetMax) && !localHas('budgetMin') && !localHas('budgetMax')) {
        const min = llm.budgetMin ?? llm.budgetMax;
        const max = llm.budgetMax ?? llm.budgetMin;
        const clamped = clampBudget(min, max);
        merged.budgetMin = clamped.budgetMin;
        merged.budgetMax = clamped.budgetMax;
        merged.budgetScope =
            llm.budgetScope ?? local.budgetScope ?? (0, parse_money_amount_util_1.inferBudgetScope)(userPrompt.trim(), max);
        updatedFields.add('budgetMin');
        updatedFields.add('budgetMax');
    }
    if (llm.colors?.length) {
        const llmColors = llm.colors
            .map((c) => (0, brief_color_hex_util_1.normalizeHex)(c) ?? c.toUpperCase())
            .filter(Boolean);
        if (!localHas('colors')) {
            merged.colors = llmColors.slice(0, 8);
            updatedFields.add('colors');
        }
    }
    if (llm.allowedItems?.length) {
        const llmSplit = (0, named_positions_util_1.splitAllowedItemsMixed)(llm.allowedItems);
        const combinedCategories = [
            ...new Set([...(local.allowedItems ?? []), ...llmSplit.categories, ...(0, brief_category_buckets_util_1.normalizeBriefAllowedBuckets)(llm.allowedItems)]),
        ];
        merged.allowedItems = (0, brief_category_buckets_util_1.normalizeBriefAllowedBuckets)(combinedCategories);
        if (llmSplit.namedItems.length) {
            merged.namedItems = [...new Set([...(local.namedItems ?? []), ...llmSplit.namedItems])];
            updatedFields.add('namedItems');
        }
        if (merged.allowedItems.length)
            updatedFields.add('allowedItems');
    }
    if (llm.namedItems?.length) {
        merged.namedItems = [...new Set([...(merged.namedItems ?? local.namedItems ?? []), ...llm.namedItems])];
        updatedFields.add('namedItems');
    }
    if (!localHas('forbiddenItems')) {
        updatedFields.delete('forbiddenItems');
        delete merged.forbiddenItems;
    }
    if (llm.setItemCount && !localHas('setItemCount')) {
        merged.setItemCount = llm.setItemCount;
        updatedFields.add('setItemCount');
    }
    if (llm.alternativeTypeGroups?.length) {
        const localGroups = local.alternativeTypeGroups ?? [];
        const llmGroups = llm.alternativeTypeGroups.filter((g) => g.length >= 2);
        const mergedGroups = [...localGroups];
        for (const group of llmGroups) {
            const key = [...group].sort().join('|');
            if (!mergedGroups.some((g) => [...g].sort().join('|') === key)) {
                mergedGroups.push(group);
            }
        }
        if (mergedGroups.length) {
            merged.alternativeTypeGroups = mergedGroups;
            updatedFields.add('alternativeTypeGroups');
        }
    }
    else if (local.alternativeTypeGroups?.length) {
        merged.alternativeTypeGroups = local.alternativeTypeGroups;
    }
    if (llm.notes?.trim()) {
        merged.notes = llm.notes.trim().slice(0, 500);
        updatedFields.add('notes');
    }
    merged.updatedFields = [...updatedFields];
    return finalizeParsedBrief(userPrompt.trim(), merged);
}
//# sourceMappingURL=parse-brief.util.js.map
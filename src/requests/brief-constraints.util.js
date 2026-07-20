"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.briefRequestsClothing = briefRequestsClothing;
exports.briefForbidsClothing = briefForbidsClothing;
exports.reconcileBriefConstraints = reconcileBriefConstraints;
exports.productViolatesMaterialBan = productViolatesMaterialBan;
const CLOTHING_WANT_KEYS = [
    'одежд',
    'футбол',
    'худи',
    'кепк',
    'поло',
    'свитшот',
    'мерч',
    'apparel',
    'clothing',
    'wear',
    'брендированн',
    'тиш',
    'tshirt',
    't-shirt',
    'hoodie',
];
const CLOTHING_FORBID_KEYS = [
    'без одежд',
    'не одежд',
    'no clothing',
    'без футбол',
    'без мерч',
    'без худи',
    'без кепк',
];
function briefRequestsClothing(text) {
    const lower = String(text ?? '').toLowerCase();
    if (CLOTHING_FORBID_KEYS.some((k) => lower.includes(k)))
        return false;
    return CLOTHING_WANT_KEYS.some((k) => lower.includes(k));
}
function briefForbidsClothing(text) {
    const lower = String(text ?? '').toLowerCase();
    return CLOTHING_FORBID_KEYS.some((k) => lower.includes(k));
}
function parseForbiddenMaterials(text) {
    const lower = String(text ?? '').toLowerCase().replace(/ё/g, 'е');
    const found = new Set();
    if (/нельзя\s+пластик|без\s+пластик|не\s+использ\w*\s+пластик|no\s+plastic/i.test(lower)) {
        found.add('plastic');
    }
    if (/одноразов|disposable|не\s+однораз/i.test(lower) && /нельзя|без|запрещ|не\s+использ/i.test(lower)) {
        found.add('disposable');
    }
    if (/многоразов\w*\s+пластик|пластиков\w*\s+издел|reusable\s+plastic/i.test(lower)) {
        found.add('plastic_reusable');
    }
    return [...found];
}
function parseQualityFloor(text, budgetMax) {
    const lower = String(text ?? '').toLowerCase().replace(/ё/g, 'е');
    if (/vip|премиум|premium|luxury|роскошн|эксклюзив|элит|executive|ювелир/i.test(lower)) {
        return 'premium';
    }
    if (budgetMax != null && budgetMax >= 6000)
        return 'premium';
    if (/бюджетн|дешев|массов|economy|cheap/i.test(lower))
        return 'standard';
    return null;
}
function reconcileBriefConstraints(userPrompt, allowedItems, forbiddenItems, budgetMax) {
    let allowed = [...allowedItems];
    let forbidden = [...forbiddenItems];
    if (briefRequestsClothing(userPrompt)) {
        forbidden = forbidden.filter((f) => f !== 'Одежда');
        if (!allowed.includes('Текстиль'))
            allowed.push('Текстиль');
    }
    else if (briefForbidsClothing(userPrompt)) {
        if (!forbidden.includes('Одежда'))
            forbidden.push('Одежда');
    }
    if (/многоразов\w*\s+пластик|пластиков\w*\s+издел|reusable\s+plastic/i.test(userPrompt)) {
        if (!forbidden.includes('Пластиковые многоразовые')) {
            forbidden.push('Пластиковые многоразовые');
        }
    }
    const forbiddenMaterials = parseForbiddenMaterials(userPrompt);
    for (const item of forbidden) {
        const f = item.toLowerCase().replace(/ё/g, 'е');
        if (f.includes('пластик') && !forbiddenMaterials.includes('plastic')) {
            forbiddenMaterials.push('plastic');
        }
        if (f.includes('однораз') && !forbiddenMaterials.includes('disposable')) {
            forbiddenMaterials.push('disposable');
        }
    }
    const qualityFloor = parseQualityFloor(userPrompt, budgetMax);
    const warnings = [];
    if (qualityFloor === 'premium' && /массов|дешев|cheap|массмаркет/i.test(userPrompt)) {
        forbiddenMaterials.push('mass_market');
        warnings.push('Premium brief: mass-market items will be filtered');
    }
    if (briefForbidsClothing(userPrompt) && briefRequestsClothing(userPrompt)) {
        warnings.push('Brief mentions clothing but also forbids it — using forbid rule');
    }
    return {
        allowedItems: [...new Set(allowed)],
        forbiddenItems: [...new Set(forbidden)],
        forbiddenMaterials: [...new Set(forbiddenMaterials)],
        qualityFloor,
        warnings: warnings.length ? warnings : undefined,
    };
}
function productViolatesMaterialBan(productName, description, category, forbiddenMaterials) {
    if (!forbiddenMaterials.length)
        return false;
    const text = `${productName} ${description} ${category}`.toLowerCase().replace(/ё/g, 'е');
    for (const mat of forbiddenMaterials) {
        if (mat === 'plastic') {
            if (/пластик|пластмасс|\bplastic\b|polypropylene|полипропилен/i.test(text)) {
                return true;
            }
            continue;
        }
        if (mat === 'plastic_reusable' && /фляг|flask|пластиков\w*\s+бутыл|многоразов\w*\s+стакан/i.test(text)) {
            return true;
        }
        if (mat === 'disposable' && /одноразов|disposable|бумажн\w*\s+стакан|пластиков\w*\s+стакан/i.test(text)) {
            return true;
        }
        if (mat === 'mass_market' && /стикер|брелок|бейдж|обвес|наклейк/i.test(text)) {
            return true;
        }
    }
    return false;
}
//# sourceMappingURL=brief-constraints.util.js.map
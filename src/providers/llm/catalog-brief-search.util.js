"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractBriefSearchTerms = extractBriefSearchTerms;
exports.buildPrismaBriefSearchFilter = buildPrismaBriefSearchFilter;
const BRIEF_PRODUCT_TERMS = [
    'кружк',
    'чаш',
    'стакан',
    'ручк',
    'блокнот',
    'ежедневник',
    'термос',
    'бутыл',
    'сумк',
    'рюкзак',
    'шоппер',
    'футболк',
    'худи',
    'кепк',
    'очк',
    'панам',
    'powerbank',
    'заряд',
    'флеш',
    'usb',
    'welcome',
    'зонт',
    'дождевик',
    'брелок',
    'плед',
    'полотенц',
    'фестивал',
    'летн',
    'зимн',
    'новогод',
    'мерч',
    'подар',
];
function extractBriefSearchTerms(brief, maxTerms = 14) {
    const norm = String(brief ?? '')
        .toLowerCase()
        .replace(/ё/g, 'е');
    const terms = new Set();
    for (const kw of BRIEF_PRODUCT_TERMS) {
        if (norm.includes(kw))
            terms.add(kw);
    }
    for (const token of norm.split(/[^\p{L}\p{N}]+/u)) {
        if (token.length >= 4 && !/^\d+$/.test(token)) {
            terms.add(token.slice(0, 32));
        }
    }
    return [...terms].slice(0, maxTerms);
}
function buildPrismaBriefSearchFilter(brief) {
    const terms = extractBriefSearchTerms(brief);
    if (!terms.length)
        return null;
    const or = [];
    for (const term of terms) {
        or.push({ name: { contains: term, mode: 'insensitive' } });
        or.push({ category: { contains: term, mode: 'insensitive' } });
        if (term.length >= 5) {
            or.push({ description: { contains: term, mode: 'insensitive' } });
        }
    }
    return { OR: or };
}
//# sourceMappingURL=catalog-brief-search.util.js.map
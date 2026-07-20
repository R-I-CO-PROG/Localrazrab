"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractProductKeywordsFromBrief = extractProductKeywordsFromBrief;
exports.findProductsByBriefKeywords = findProductsByBriefKeywords;
const catalog_variant_util_1 = require("./catalog-variant.util");
const concept_diversity_util_1 = require("./concept-diversity.util");
const selection_constraints_1 = require("../../concept/selection-constraints");
const MANDATORY_KEYWORD_MAP = [
    { re: /термос|термостакан|термокруж/i, keyword: 'термос', slug: 'thermos' },
    { re: /плед/i, keyword: 'плед', slug: 'blanket' },
    { re: /полотен/i, keyword: 'полотенце', slug: 'towel' },
    { re: /кружк/i, keyword: 'кружка', slug: 'mug' },
    { re: /фартук/i, keyword: 'фартук', slug: 'apron' },
    { re: /календар/i, keyword: 'календарь', slug: 'calendar' },
    { re: /декантер/i, keyword: 'декантер', slug: 'decanter' },
    { re: /ступк/i, keyword: 'ступка', slug: 'mortar' },
    { re: /штоф/i, keyword: 'штоф', slug: 'flask' },
    { re: /шейкер/i, keyword: 'шейкер', slug: 'shaker' },
    { re: /проектор/i, keyword: 'проектор', slug: 'projector' },
    { re: /welcome\s*pack/i, keyword: 'welcome pack', slug: 'welcome_pack' },
];
function extractProductKeywordsFromBrief(brief) {
    const keywords = [];
    const lower = brief.toLowerCase();
    for (const { re, keyword } of MANDATORY_KEYWORD_MAP) {
        if (re.test(lower))
            keywords.push(keyword);
    }
    const extractors = [
        /(?:такие?\s+как|например|включая|включить|включает|должн\w*\s+включать|нужн\w*|состоять\s+из)\s+([^.!?\n]{5,150})/gi,
        /обязательн\w*[^.!?]{0,120}/gi,
    ];
    for (const re of extractors) {
        for (const match of lower.matchAll(re)) {
            const content = (match[1] ?? match[0]).trim();
            const parts = content.split(/\s*[,;]\s*|\s+и\s+/);
            for (const part of parts) {
                const clean = part
                    .trim()
                    .replace(/^(?:элемент\w*|предмет\w*|товар\w*|уютн\w*|обязательн\w*|логотип\w*)\s+/i, '')
                    .trim();
                if (clean.length >= 3 && clean.length <= 60) {
                    keywords.push(clean);
                }
            }
        }
    }
    const mandatoryTypes = (0, concept_diversity_util_1.detectMandatoryConceptTypesFromBrief)(brief);
    for (const slug of mandatoryTypes) {
        const map = MANDATORY_KEYWORD_MAP.find((m) => m.slug === slug);
        if (map)
            keywords.unshift(map.keyword);
    }
    const seen = new Set();
    const unique = keywords.filter((k) => {
        const root = k.replace(/[аеёиоуыэюя]{1,4}$/i, '').toLowerCase();
        const key = root.length >= 3 ? root : k.toLowerCase();
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    });
    const mandatoryFirst = unique.filter((k) => MANDATORY_KEYWORD_MAP.some((m) => m.keyword === k || m.re.test(k)));
    const rest = unique.filter((k) => !mandatoryFirst.includes(k));
    return [...mandatoryFirst, ...rest];
}
function findProductsByBriefKeywords(keywords, catalog, blockedIds, blockedVariants = new Set()) {
    const result = [];
    const usedTypes = new Set();
    const usedIds = new Set(blockedIds);
    const usedVariants = new Set(blockedVariants);
    for (const keyword of keywords) {
        const tokens = keyword
            .toLowerCase()
            .split(/\s+/)
            .filter((t) => t.length >= 3);
        if (!tokens.length)
            continue;
        const mandatorySlug = MANDATORY_KEYWORD_MAP.find((m) => m.keyword === keyword || m.re.test(keyword))?.slug;
        const allowedTypes = mandatorySlug ? new Set((0, concept_diversity_util_1.mandatoryTypeAliases)(mandatorySlug)) : null;
        let bestProduct = null;
        let bestScore = 0;
        for (const product of catalog) {
            if (usedIds.has(product.id))
                continue;
            if (usedVariants.has((0, catalog_variant_util_1.productVariantKey)(product)))
                continue;
            const name = (product.name ?? '').toLowerCase();
            const desc = `${name} ${product.subcategory ?? ''} ${product.category ?? ''} ${product.description ?? ''}`.toLowerCase();
            let score = 0;
            let nameHits = 0;
            for (const token of tokens) {
                if (name.includes(token)) {
                    score += 15;
                    nameHits++;
                }
                else if (desc.includes(token)) {
                    score += 5;
                }
            }
            if (nameHits === tokens.length)
                score += 30;
            if ((0, selection_constraints_1.hasValidProductImage)(product))
                score += 10;
            const type = (0, concept_diversity_util_1.detectConceptProductType)(product);
            if (allowedTypes && !allowedTypes.has(type))
                continue;
            if (score <= 0)
                continue;
            if ((0, concept_diversity_util_1.typeConflictsInSet)(usedTypes, type))
                continue;
            if (score > bestScore) {
                bestScore = score;
                bestProduct = product;
            }
        }
        if (bestProduct) {
            result.push(bestProduct);
            usedIds.add(bestProduct.id);
            usedVariants.add((0, catalog_variant_util_1.productVariantKey)(bestProduct));
            usedTypes.add((0, concept_diversity_util_1.detectConceptProductType)(bestProduct));
        }
    }
    return result;
}
//# sourceMappingURL=brief-keyword-search.util.js.map
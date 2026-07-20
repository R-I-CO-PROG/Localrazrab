"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NAMED_POSITION_SYNONYMS = void 0;
exports.splitAllowedItemsMixed = splitAllowedItemsMixed;
exports.parseNamedPositionsFromBrief = parseNamedPositionsFromBrief;
exports.resolveNamedPositionTypes = resolveNamedPositionTypes;
exports.resolveNamedItemsForBrief = resolveNamedItemsForBrief;
exports.isDirectedBriefMode = isDirectedBriefMode;
exports.isExclusiveBriefMode = isExclusiveBriefMode;
exports.productMatchesNamedPosition = productMatchesNamedPosition;
exports.namedPositionDefinition = namedPositionDefinition;
const brief_options_1 = require("./brief-options");
const brief_category_buckets_util_1 = require("../catalog/brief-category-buckets.util");
const concept_diversity_util_1 = require("../providers/llm/concept-diversity.util");
exports.NAMED_POSITION_SYNONYMS = [
    { slug: 'decanter', labels: [/декантер/i, /\bdecanter\b/i] },
    { slug: 'mortar', labels: [/ступк/i, /\bmortar\b/i, /pestle/i] },
    { slug: 'flask', labels: [/штоф/i, /\bflask\b/i, /графин/i, /carafe/i] },
    { slug: 'shaker', labels: [/шейкер/i, /\bshaker\b/i, /коктейльн\w*\s*шейкер/i] },
    { slug: 'projector', labels: [/проектор/i, /\bprojector\b/i] },
    { slug: 'welcome_pack', labels: [/welcome\s*pack/i, /велком\s*пак/i] },
];
function normalizeLabel(text) {
    return text.trim().replace(/\s+/g, ' ');
}
function isCategoryBucket(value) {
    return brief_options_1.BRIEF_ALLOWED_CATEGORIES.includes(value);
}
function splitAllowedItemsMixed(items) {
    const categories = [];
    const namedItems = [];
    for (const raw of items) {
        const item = normalizeLabel(raw);
        if (!item)
            continue;
        if (isCategoryBucket(item)) {
            categories.push(item);
            continue;
        }
        const normalized = (0, brief_category_buckets_util_1.normalizeBriefAllowedBuckets)([item]);
        if (normalized.length > 0) {
            categories.push(...normalized);
            continue;
        }
        namedItems.push(item);
    }
    return {
        categories: [...new Set(categories)],
        namedItems: [...new Set(namedItems)],
    };
}
function matchNamedPositionLabel(fragment) {
    const clean = normalizeLabel(fragment);
    if (clean.length < 2)
        return null;
    for (const entry of exports.NAMED_POSITION_SYNONYMS) {
        if (entry.labels.some((re) => re.test(clean))) {
            return { label: clean, typeSlug: entry.slug };
        }
    }
    for (const def of concept_diversity_util_1.CONCEPT_TYPE_DEFINITIONS) {
        if (!concept_diversity_util_1.CATALOG_IDEATOR_TYPE_SLUGS.includes(def.slug))
            continue;
        if (def.briefMandatory.some((re) => re.test(clean)) || def.matchProduct(clean)) {
            return { label: clean, typeSlug: def.slug };
        }
    }
    return null;
}
function extractListSegment(text) {
    const segments = [];
    const triggers = [
        /(?:из\s+тех\s+позиц\w*|позици\w*\s*(?:что|котор\w*)\s*(?:я\s*)?(?:назов\w*|перечисл\w*|укаж\w*))[:\s-]*([^.!\n]{5,200})/i,
        /(?:назов\w*|перечисл\w*|укаж\w*)\s*(?:позици\w*|товар\w*)[:\s-]*([^.!\n]{5,200})/i,
        /(?:нужн\w*|обязательн\w*|в\s+набор\w*|включ\w*|состо\w*\s+из|такие?\s+как|например)[:\s-]*([^.!\n]{5,200})/i,
    ];
    for (const re of triggers) {
        const match = text.match(re);
        if (match?.[1])
            segments.push(match[1]);
    }
    const quoted = [...text.matchAll(/[«"']([^«"'\n]{2,40})[»"']/g)].map((m) => m[1]);
    segments.push(...quoted);
    const parts = [];
    for (const segment of segments) {
        for (const chunk of segment.split(/\s*[,;]\s*|\s+и\s+/)) {
            const clean = chunk
                .trim()
                .replace(/^[-–—•*\d.)]+\s*/, '')
                .replace(/\s*(?:и\s+)?(?:ещё|еще|также|а\s+также)\s*$/i, '')
                .trim();
            if (clean.length >= 2 && clean.length <= 50)
                parts.push(clean);
        }
    }
    return parts;
}
function parseNamedPositionsFromBrief(text) {
    const found = [];
    const seenLabels = new Set();
    for (const fragment of extractListSegment(text)) {
        const matched = matchNamedPositionLabel(fragment);
        if (!matched)
            continue;
        const key = matched.label.toLowerCase();
        if (seenLabels.has(key))
            continue;
        seenLabels.add(key);
        found.push(matched);
    }
    const lower = text.toLowerCase();
    for (const entry of exports.NAMED_POSITION_SYNONYMS) {
        for (const re of entry.labels) {
            if (!re.test(lower))
                continue;
            const label = entry.slug.replace(/_/g, ' ');
            const key = label.toLowerCase();
            if (seenLabels.has(key))
                continue;
            seenLabels.add(key);
            found.push({ label, typeSlug: entry.slug });
            break;
        }
    }
    for (const def of concept_diversity_util_1.CONCEPT_TYPE_DEFINITIONS) {
        if (!concept_diversity_util_1.CATALOG_IDEATOR_TYPE_SLUGS.includes(def.slug))
            continue;
        if (!def.briefMandatory.some((re) => re.test(text)))
            continue;
        const label = def.labelRu;
        const key = label.toLowerCase();
        if (seenLabels.has(key))
            continue;
        seenLabels.add(key);
        found.push({ label, typeSlug: def.slug });
    }
    return found.map((f) => f.label);
}
function resolveNamedPositionTypes(labels, brief = '') {
    const types = [];
    const seen = new Set();
    for (const label of labels) {
        const matched = matchNamedPositionLabel(label);
        if (matched && !seen.has(matched.typeSlug)) {
            seen.add(matched.typeSlug);
            types.push(matched.typeSlug);
        }
    }
    if (brief.trim()) {
        for (const fragment of extractListSegment(brief)) {
            const matched = matchNamedPositionLabel(fragment);
            if (matched && !seen.has(matched.typeSlug)) {
                seen.add(matched.typeSlug);
                types.push(matched.typeSlug);
            }
        }
        for (const entry of exports.NAMED_POSITION_SYNONYMS) {
            if (entry.labels.some((re) => re.test(brief)) && !seen.has(entry.slug)) {
                seen.add(entry.slug);
                types.push(entry.slug);
            }
        }
    }
    return types;
}
function resolveNamedItemsForBrief(brief, uiAllowedItems = []) {
    const { categories, namedItems: uiNamed } = splitAllowedItemsMixed(uiAllowedItems);
    const fromBrief = parseNamedPositionsFromBrief(brief);
    const namedItems = [...new Set([...uiNamed, ...fromBrief])];
    const namedTypes = resolveNamedPositionTypes(namedItems, brief);
    return { namedItems, namedTypes, categoryBuckets: categories };
}
function isDirectedBriefMode(namedTypes) {
    return namedTypes.length > 0;
}
function isExclusiveBriefMode(brief, namedTypes) {
    if (namedTypes.length === 0)
        return false;
    return /(?<![а-яё])только(?![а-яё])\s+(?:эти|следующ|перечисл|вот\s+эти|из\s+перечисл|из\s+того)|строго\s+(?:по\s+списку|эти|перечисл)|ровно\s+эти|исключительно\s+(?:эти|перечисл)|из\s+тех\s+позиц[а-яё]*\s+(?:что|котор)|нужны\s+именно\s+эти/i.test(brief);
}
function productMatchesNamedPosition(product, label, typeSlug) {
    const text = `${product.name ?? ''} ${product.description ?? ''}`.toLowerCase();
    const tokens = label
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length >= 3);
    const nameHits = tokens.filter((t) => text.includes(t)).length;
    if (nameHits >= Math.max(1, tokens.length))
        return true;
    return (0, concept_diversity_util_1.detectConceptProductType)(product) === typeSlug;
}
function namedPositionDefinition(slug) {
    return concept_diversity_util_1.CONCEPT_TYPE_DEFINITIONS.find((d) => d.slug === slug);
}
//# sourceMappingURL=named-positions.util.js.map
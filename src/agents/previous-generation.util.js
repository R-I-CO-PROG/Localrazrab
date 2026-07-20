"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractFromConceptsOutput = extractFromConceptsOutput;
exports.readGenerationHistory = readGenerationHistory;
exports.mergeGenerationHistory = mergeGenerationHistory;
exports.buildPreviousResultsPayload = buildPreviousResultsPayload;
exports.normalizeConceptKey = normalizeConceptKey;
exports.isSimilarConceptTitle = isSimilarConceptTitle;
const catalog_variant_util_1 = require("../providers/llm/catalog-variant.util");
function variantKeyFromConceptProduct(p) {
    const name = typeof p?.name === 'string' ? p.name.trim() : '';
    if (!name)
        return null;
    return (0, catalog_variant_util_1.productVariantKey)({
        id: typeof p?.id === 'string' ? p.id : '',
        name,
        externalId: typeof p?.externalId === 'string' ? p.externalId : undefined,
        sourceId: typeof p?.sourceId === 'string' ? p.sourceId : undefined,
    });
}
function extractFromConceptsOutput(conceptsOutput) {
    const productIds = new Set();
    const productVariantKeys = new Set();
    const conceptTitles = [];
    const themeAxes = [];
    if (!Array.isArray(conceptsOutput)) {
        return { productIds: [], productVariantKeys: [], conceptTitles, themeAxes };
    }
    for (const raw of conceptsOutput) {
        if (!raw || typeof raw !== 'object')
            continue;
        const row = raw;
        const title = String(row.title ?? '').trim();
        if (title)
            conceptTitles.push(title);
        const axis = String(row.themeAxis ?? '').trim();
        if (axis)
            themeAxes.push(axis);
        for (const id of row.productIds ?? []) {
            if (typeof id === 'string' && id.trim())
                productIds.add(id.trim());
        }
        for (const p of row.catalogProducts ?? []) {
            const id = typeof p?.id === 'string' ? p.id.trim() : '';
            if (id)
                productIds.add(id);
            const vk = variantKeyFromConceptProduct(p);
            if (vk)
                productVariantKeys.add(vk);
        }
    }
    return {
        productIds: [...productIds],
        productVariantKeys: [...productVariantKeys],
        conceptTitles,
        themeAxes,
    };
}
function readGenerationHistory(routerOutput) {
    if (!routerOutput || typeof routerOutput !== 'object')
        return null;
    const gh = routerOutput.generationHistory;
    if (!gh || typeof gh !== 'object')
        return null;
    return {
        productIds: Array.isArray(gh.productIds) ? gh.productIds.filter(Boolean) : [],
        productVariantKeys: Array.isArray(gh.productVariantKeys)
            ? gh.productVariantKeys.filter(Boolean)
            : [],
        conceptTitles: Array.isArray(gh.conceptTitles) ? gh.conceptTitles.filter(Boolean) : [],
        themeAxes: Array.isArray(gh.themeAxes) ? gh.themeAxes.filter(Boolean) : [],
        generationCount: typeof gh.generationCount === 'number' ? gh.generationCount : 0,
    };
}
function mergeGenerationHistory(existing, latest) {
    return {
        productIds: [...new Set([...(existing?.productIds ?? []), ...latest.productIds])],
        productVariantKeys: [
            ...new Set([
                ...(existing?.productVariantKeys ?? []),
                ...(latest.productVariantKeys ?? []),
            ]),
        ],
        conceptTitles: [...new Set([...(existing?.conceptTitles ?? []), ...latest.conceptTitles])],
        themeAxes: [...new Set([...(existing?.themeAxes ?? []), ...latest.themeAxes])],
        generationCount: (existing?.generationCount ?? 0) + 1,
    };
}
function buildPreviousResultsPayload(history) {
    if (!history || history.generationCount <= 0)
        return null;
    return {
        product_ids: history.productIds,
        concept_titles: history.conceptTitles,
        theme_axes: history.themeAxes,
        previous_generation_count: history.generationCount,
    };
}
function normalizeConceptKey(text) {
    return text
        .toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();
}
function isSimilarConceptTitle(a, b) {
    const na = normalizeConceptKey(a);
    const nb = normalizeConceptKey(b);
    if (!na || !nb)
        return false;
    if (na === nb)
        return true;
    if (na.includes(nb) || nb.includes(na))
        return true;
    const ta = na.split(/\s+/).filter((t) => t.length >= 3);
    const tb = new Set(nb.split(/\s+/).filter((t) => t.length >= 3));
    if (!ta.length || !tb.size)
        return false;
    const overlap = ta.filter((t) => tb.has(t)).length;
    return overlap / Math.max(ta.length, tb.size) >= 0.7;
}
//# sourceMappingURL=previous-generation.util.js.map
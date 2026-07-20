"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.conceptResultKey = conceptResultKey;
exports.parseConceptResults = parseConceptResults;
exports.mergeConceptResult = mergeConceptResult;
exports.backfillConceptResultsFromGeneration = backfillConceptResultsFromGeneration;
exports.getConceptResult = getConceptResult;
const generation_output_path_util_1 = require("./generation-output-path.util");
function conceptResultKey(title) {
    return (0, generation_output_path_util_1.conceptFileKey)(title);
}
function parseConceptResults(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        return {};
    return raw;
}
function normalizeVariants(entry) {
    if (entry.variants?.length)
        return entry.variants;
    if (!entry.resultImageUrl)
        return [];
    return [
        {
            id: `v-${conceptResultKey(entry.chosenIdeaTitle)}-r${entry.revision}`,
            imageUrl: entry.resultImageUrl,
            revision: entry.revision,
            finishedAt: entry.finishedAt || new Date().toISOString(),
        },
    ];
}
function mergeConceptResult(existing, entry) {
    const map = parseConceptResults(existing);
    const title = entry.chosenIdeaTitle.trim();
    const key = conceptResultKey(title);
    const prev = map[key];
    const finishedAt = entry.finishedAt instanceof Date
        ? entry.finishedAt.toISOString()
        : typeof entry.finishedAt === 'string'
            ? entry.finishedAt
            : new Date().toISOString();
    let variants = prev ? normalizeVariants(prev) : [];
    if (prev?.resultImageUrl &&
        !variants.some((v) => v.imageUrl === prev.resultImageUrl)) {
        variants = [
            {
                id: `v-${key}-legacy`,
                imageUrl: prev.resultImageUrl,
                revision: prev.revision,
                finishedAt: prev.finishedAt || finishedAt,
            },
            ...variants.filter((v) => v.imageUrl !== prev.resultImageUrl),
        ];
    }
    if (!variants.some((v) => v.imageUrl === entry.resultImageUrl)) {
        variants.push({
            id: entry.variantId ?? `v-${key}-r${entry.revision}-${Date.now()}`,
            imageUrl: entry.resultImageUrl,
            revision: Math.max(1, entry.revision),
            finishedAt,
            refinementBrief: entry.refinementBrief ?? null,
        });
    }
    map[key] = {
        chosenIdeaTitle: title,
        resultImageUrl: entry.resultImageUrl,
        productIds: [...entry.productIds],
        revision: Math.max(1, entry.revision),
        finishedAt,
        variants,
    };
    return map;
}
function backfillConceptResultsFromGeneration(generation) {
    const existing = parseConceptResults(generation.conceptResults);
    if (Object.keys(existing).length > 0) {
        const normalized = {};
        for (const [k, v] of Object.entries(existing)) {
            normalized[k] = { ...v, variants: normalizeVariants(v) };
        }
        return normalized;
    }
    if (!generation.resultImageUrl)
        return existing;
    const snap = generation.inputSnapshot;
    const title = snap?.chosenIdeaTitle?.trim();
    if (!title)
        return existing;
    return mergeConceptResult(existing, {
        chosenIdeaTitle: title,
        resultImageUrl: generation.resultImageUrl,
        productIds: snap?.productIds ?? [],
        revision: Number(snap?.revision) || 1,
        finishedAt: generation.finishedAt,
    });
}
function getConceptResult(conceptResults, chosenIdeaTitle) {
    const title = chosenIdeaTitle?.trim();
    if (!title)
        return null;
    const map = parseConceptResults(conceptResults);
    const entry = map[conceptResultKey(title)];
    if (!entry?.resultImageUrl)
        return null;
    return { ...entry, variants: normalizeVariants(entry) };
}
//# sourceMappingURL=concept-result.util.js.map
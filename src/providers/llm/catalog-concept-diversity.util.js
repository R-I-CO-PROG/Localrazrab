"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.catalogIdeaSlotSignature = catalogIdeaSlotSignature;
exports.pickDiverseCatalogIdeas = pickDiverseCatalogIdeas;
const previous_generation_util_1 = require("../../agents/previous-generation.util");
function catalogIdeaSlotSignature(idea) {
    const slots = idea.productSlots ?? [];
    if (slots.length) {
        return [...slots.map((s) => s.type)].sort().join('|');
    }
    return `title:${String(idea.title ?? '').trim().toLowerCase()}`;
}
function ideaSlotTypes(idea) {
    const slots = idea.productSlots ?? [];
    if (!slots.length)
        return new Set();
    return new Set(slots.map((s) => s.type));
}
function jaccardSimilarity(a, b) {
    if (!a.size && !b.size)
        return 0;
    let intersection = 0;
    for (const x of a) {
        if (b.has(x))
            intersection++;
    }
    const union = a.size + b.size - intersection;
    return union > 0 ? intersection / union : 0;
}
function isSimilarSlotSet(a, b) {
    if (!a.size || !b.size)
        return false;
    return jaccardSimilarity(a, b) >= 0.6;
}
function pickDiverseCatalogIdeas(ranked, ideasByTitle, limit, generationHistory) {
    const blockedTitles = generationHistory?.conceptTitles ?? [];
    const blockedAxes = new Set((generationHistory?.themeAxes ?? []).map((a) => (0, previous_generation_util_1.normalizeConceptKey)(a)));
    const picked = [];
    const pickedTypeSets = [];
    const usedTitleSigs = new Set();
    const usedSignatures = new Set();
    const usedAxes = new Set();
    for (const item of ranked) {
        if (picked.length >= limit)
            break;
        if (blockedTitles.some((t) => (0, previous_generation_util_1.isSimilarConceptTitle)(t, item.title)))
            continue;
        const full = ideasByTitle.get(item.title);
        const candidateTypes = full ? ideaSlotTypes(full) : new Set();
        const axis = String(full?.themeAxis ?? '')
            .trim()
            .toLowerCase();
        if (axis && blockedAxes.has((0, previous_generation_util_1.normalizeConceptKey)(axis)))
            continue;
        if (candidateTypes.size > 0) {
            const duplicate = pickedTypeSets.some((picked) => isSimilarSlotSet(candidateTypes, picked));
            if (duplicate)
                continue;
        }
        else {
            const sig = full ? catalogIdeaSlotSignature(full) : item.title;
            if (usedTitleSigs.has(sig))
                continue;
        }
        if (axis && usedAxes.has(axis))
            continue;
        picked.push(item);
        if (candidateTypes.size > 0) {
            pickedTypeSets.push(candidateTypes);
        }
        else {
            const sig = full ? catalogIdeaSlotSignature(full) : item.title;
            usedTitleSigs.add(sig);
        }
        if (axis)
            usedAxes.add(axis);
    }
    if (picked.length >= limit)
        return picked;
    for (const item of ranked) {
        if (picked.length >= limit)
            break;
        if (picked.some((p) => p.title === item.title))
            continue;
        const full = ideasByTitle.get(item.title);
        const sig = full ? catalogIdeaSlotSignature(full) : item.title;
        if (usedSignatures.has(sig))
            continue;
        picked.push(item);
        usedSignatures.add(sig);
    }
    return picked;
}
//# sourceMappingURL=catalog-concept-diversity.util.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pickTopCatalogIdeasLocally = pickTopCatalogIdeasLocally;
const catalog_concept_diversity_util_1 = require("./catalog-concept-diversity.util");
const concept_diversity_util_1 = require("./concept-diversity.util");
const previous_generation_util_1 = require("../../agents/previous-generation.util");
function normalizeText(text) {
    return String(text ?? '')
        .toLowerCase()
        .replace(/ё/g, 'е');
}
function slotNotesMatchBrandColor(notes, color) {
    const notesNorm = normalizeText(notes);
    const colorNorm = normalizeText(color).trim();
    if (!colorNorm || colorNorm.length < 2)
        return false;
    if (notesNorm.includes(colorNorm))
        return true;
    if (colorNorm.startsWith('#') && notesNorm.includes(colorNorm.slice(1)))
        return true;
    return false;
}
function scoreBrandColorSlots(idea, brandColors) {
    if (!brandColors.length || !idea.productSlots?.length)
        return 0;
    let bonus = 0;
    for (const slot of idea.productSlots) {
        const notes = slot.notes?.trim();
        if (!notes)
            continue;
        for (const color of brandColors) {
            if (slotNotesMatchBrandColor(notes, color)) {
                bonus += 12;
                break;
            }
        }
    }
    return bonus;
}
function scoreCatalogIdeaForBrief(idea, brief, mandatoryTypes, brandColors) {
    const briefText = normalizeText(brief.userQuery ?? '');
    const blob = normalizeText(`${idea.title} ${idea.composition} ${idea.style} ${idea.whyItFits ?? ''} ${idea.themeAxis ?? ''}`);
    let score = 50;
    const tokens = briefText.split(/[^\p{L}\p{N}]+/u).filter((t) => t.length >= 4);
    for (const token of tokens) {
        if (blob.includes(token))
            score += 4;
    }
    if (idea.productSlots?.length) {
        const slotTypes = new Set(idea.productSlots.map((s) => s.type));
        for (const mt of mandatoryTypes) {
            if (slotTypes.has(mt))
                score += 25;
        }
        score += Math.min(idea.productSlots.length, 8) * 2;
    }
    score += scoreBrandColorSlots(idea, brandColors);
    if (idea.whyItFits?.trim())
        score += 8;
    if (idea.themeAxis?.trim())
        score += 5;
    const forbidden = (brief.forbiddenItems ?? []).map((s) => s.toLowerCase());
    for (const f of forbidden) {
        if (f.length > 2 && blob.includes(f))
            score -= 40;
    }
    return score;
}
function ideaHasMandatoryType(title, mandatoryType, byTitle) {
    const full = byTitle.get(title);
    return Boolean(full?.productSlots?.some((s) => s.type === mandatoryType));
}
function enforceMandatoryTypeCoverage(top, ranked, byTitle, mandatoryTypes, limit) {
    const result = [...top];
    const inTop = () => new Set(result.map((t) => t.title));
    const minCoverage = Math.min(3, limit);
    const countWithType = (items, mandatoryType) => items.filter((item) => ideaHasMandatoryType(item.title, mandatoryType, byTitle)).length;
    for (const mandatoryType of mandatoryTypes) {
        let coverage = countWithType(result, mandatoryType);
        if (coverage >= minCoverage)
            continue;
        const topSet = inTop();
        const candidates = ranked.filter((r) => !topSet.has(r.title) &&
            ideaHasMandatoryType(r.title, mandatoryType, byTitle));
        for (const candidate of candidates) {
            if (coverage >= minCoverage)
                break;
            const lacking = result
                .map((item, idx) => ({ item, idx }))
                .filter(({ item }) => !ideaHasMandatoryType(item.title, mandatoryType, byTitle));
            if (!lacking.length)
                break;
            const worst = lacking.reduce((a, b) => (a.item.score <= b.item.score ? a : b));
            if (candidate.score <= worst.item.score)
                continue;
            result[worst.idx] = candidate;
            coverage = countWithType(result, mandatoryType);
        }
    }
    return result;
}
function pickTopCatalogIdeasLocally(ideas, brief, limit, generationHistory) {
    const mandatoryTypes = (0, concept_diversity_util_1.detectMandatoryConceptTypesFromBrief)(brief.userQuery ?? '');
    const brandColors = brief.colors ?? [];
    const byTitle = new Map(ideas.map((i) => [i.title, i]));
    const blockedTitles = generationHistory?.conceptTitles ?? [];
    const blockedAxes = new Set((generationHistory?.themeAxes ?? []).map((a) => (0, previous_generation_util_1.normalizeConceptKey)(a)));
    const ranked = ideas
        .map((idea) => {
        let score = scoreCatalogIdeaForBrief(idea, brief, mandatoryTypes, brandColors);
        if (blockedTitles.some((t) => (0, previous_generation_util_1.isSimilarConceptTitle)(t, idea.title)))
            score -= 250;
        const axis = (0, previous_generation_util_1.normalizeConceptKey)(idea.themeAxis ?? '');
        if (axis && blockedAxes.has(axis))
            score -= 120;
        return {
            title: idea.title,
            score,
            briefFitScore: score,
            conceptSummary: [idea.composition, idea.whyItFits].filter(Boolean).join(' ').slice(0, 500),
            reasons: [idea.whyItFits || 'Соответствует брифу и структуре набора'],
            risks: [],
            suggestedEdits: [],
        };
    })
        .sort((a, b) => b.score - a.score);
    const diverse = (0, catalog_concept_diversity_util_1.pickDiverseCatalogIdeas)(ranked, byTitle, limit, generationHistory);
    const top = enforceMandatoryTypeCoverage(diverse, ranked, byTitle, mandatoryTypes, limit);
    return { topIdeas: top };
}
//# sourceMappingURL=catalog-fast-select.util.js.map
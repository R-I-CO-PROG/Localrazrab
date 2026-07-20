"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildConceptNarrative = buildConceptNarrative;
exports.buildConcepts = buildConcepts;
exports.findConceptByTitle = findConceptByTitle;
exports.findIdeatorIdeaByTitle = findIdeatorIdeaByTitle;
const PRODUCT_RU = {
    pen: 'ручка',
    notebook: 'блокнот',
    mug: 'кружка',
    tshirt: 'футболка',
    bag: 'сумка',
    thermos: 'термос',
    hoodie: 'худи',
    bottle: 'бутылка',
    cap: 'кепка',
    powerbank: 'powerbank',
};
function formatItems(items) {
    if (!items.length)
        return '';
    return items
        .map((i) => PRODUCT_RU[i.productType] ?? i.productType)
        .join(', ');
}
function buildConceptNarrative(full, top) {
    if (top.conceptSummary?.trim() && top.conceptSummary.length > 60) {
        return top.conceptSummary.trim();
    }
    if (full?.description?.trim() && full.description.length > 40) {
        const parts = [];
        if (full.hook?.trim())
            parts.push(full.hook.trim());
        parts.push(full.description.trim());
        const products = formatItems(full.items);
        if (products)
            parts.push(`В набор входят: ${products}.`);
        if (full.whyItFits?.trim())
            parts.push(full.whyItFits.trim());
        if (top.reasons?.length)
            parts.push(top.reasons[0]);
        return parts.join(' ');
    }
    if (top.reasons?.length >= 2) {
        return top.reasons.join(' ');
    }
    return top.reasons?.[0] ?? top.title;
}
function buildConcepts(ideatorOutput, criticOutput, meta) {
    if (!criticOutput?.topIdeas?.length)
        return [];
    const ideaByTitle = new Map((ideatorOutput?.ideas ?? []).map((idea) => [idea.title, idea]));
    return criticOutput.topIdeas.slice(0, 5).map((top) => {
        const full = ideaByTitle.get(top.title);
        const narrative = buildConceptNarrative(full, top);
        return {
            ...mergeConcept(full, top, narrative),
            usedFallback: meta?.usedFallback,
            fallbackReason: meta?.fallbackReason,
        };
    });
}
function mergeConcept(full, top, narrative) {
    if (full) {
        return {
            title: full.title,
            narrative,
            description: full.description,
            items: full.items,
            styleTags: full.styleTags,
            colorPalette: full.colorPalette,
            whyItFits: full.whyItFits,
            score: top.score,
            reasons: top.reasons,
            risks: top.risks,
            suggestedEdits: top.suggestedEdits,
        };
    }
    return {
        title: top.title,
        narrative,
        description: narrative,
        items: [],
        styleTags: [],
        colorPalette: [],
        whyItFits: top.reasons[0] ?? '',
        score: top.score,
        reasons: top.reasons,
        risks: top.risks,
        suggestedEdits: top.suggestedEdits,
    };
}
function normalizeTitle(text) {
    return text
        .trim()
        .replace(/[\u00A0\u200B\u200C\u200D\uFEFF]/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/[«»""„'']/g, '"')
        .replace(/[–—]/g, '-')
        .toLowerCase();
}
function findConceptByTitle(concepts, title) {
    const norm = normalizeTitle(title);
    return (concepts.find((c) => c.title === title) ??
        concepts.find((c) => normalizeTitle(c.title) === norm));
}
function findIdeatorIdeaByTitle(ideatorOutput, title) {
    if (!ideatorOutput?.ideas)
        return undefined;
    const norm = normalizeTitle(title);
    return (ideatorOutput.ideas.find((i) => i.title === title) ??
        ideatorOutput.ideas.find((i) => normalizeTitle(i.title) === norm));
}
//# sourceMappingURL=concept.util.js.map
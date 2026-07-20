"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.critiqueConceptSetsWithLlm = critiqueConceptSetsWithLlm;
const promise_timeout_util_1 = require("../../common/promise-timeout.util");
const selection_constraints_1 = require("../../concept/selection-constraints");
const catalog_brief_relevance_util_1 = require("./catalog-brief-relevance.util");
const catalog_filter_util_1 = require("./catalog-filter.util");
const concept_diversity_util_1 = require("./concept-diversity.util");
const catalog_variant_util_1 = require("./catalog-variant.util");
const SYSTEM_PROMPT = `You are a merchandising QA reviewer for corporate gift sets.
Return ONLY valid JSON (no markdown):
{"reviews":[{"conceptIndex":0,"keep":["id1","id2"],"replace":[{"outId":"id3","inId":"id4","reason":"short"}]}]}

Rules:
- conceptIndex is 0-based.
- keep: product ids to retain from the current set (subset of input ids).
- replace: swap outId for inId; inId MUST come from that concept's shortlist only.
- Never invent product ids. At most 2 replacements per concept.`;
function extractJsonObject(text) {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced)
        return fenced[1].trim();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start)
        return text.slice(start, end + 1);
    return text.trim();
}
function parseCriticResponse(content) {
    const jsonText = extractJsonObject(content.trim());
    return JSON.parse(jsonText);
}
function buildShortlist(concept, catalog, brief, colors, filterInput, maxItems = 8) {
    const usedIds = new Set((concept.catalogProducts ?? []).map((p) => p.id));
    const usedVariants = new Set((concept.catalogProducts ?? []).map((p) => (0, catalog_variant_util_1.productVariantKey)(p)));
    return catalog
        .filter((p) => {
        if (usedIds.has(p.id))
            return false;
        if (usedVariants.has((0, catalog_variant_util_1.productVariantKey)(p)))
            return false;
        if ((p.price ?? 0) <= 0)
            return false;
        if (p.stockAvailable != null && p.stockAvailable <= 0)
            return false;
        if ((0, catalog_brief_relevance_util_1.scoreBriefRelevance)(p, brief, colors) <= -120)
            return false;
        return true;
    })
        .map((p) => ({
        product: p,
        score: (0, catalog_brief_relevance_util_1.scoreBriefRelevance)(p, brief, colors) +
            (filterInput ? (0, catalog_filter_util_1.scoreProductForBrief)(p, filterInput) * 0.3 : 0),
    }))
        .sort((a, b) => b.score - a.score)
        .slice(0, maxItems)
        .map((s) => s.product);
}
function mapProductToConceptShape(p, brandColors) {
    return {
        id: p.id,
        name: p.name,
        category: p.category,
        productType: (0, concept_diversity_util_1.detectConceptProductType)(p),
        price: p.price,
        stockAvailable: p.stockAvailable,
        colors: (p.colors ?? [])
            .map((c) => (typeof c === 'string' ? c : typeof c.name === 'string' ? c.name : ''))
            .filter(Boolean),
        catalogImageUrl: p.catalogImageUrl ?? undefined,
        imageUrl: p.catalogImageUrl ?? undefined,
        image: p.catalogImageUrl ?? undefined,
    };
}
function applyReviewToConcept(concept, review, catalog, brief, colors, filterInput, minProducts, maxProducts) {
    const shortlist = buildShortlist(concept, catalog, brief, colors, filterInput);
    const shortlistIds = new Set(shortlist.map((p) => p.id));
    const catalogById = new Map(catalog.map((p) => [p.id, p]));
    let products = [...(concept.catalogProducts ?? [])];
    if (review.replace?.length) {
        for (const pair of review.replace) {
            const outId = pair.outId?.trim();
            const inId = pair.inId?.trim();
            if (!outId || !inId || !shortlistIds.has(inId))
                continue;
            const replacement = catalogById.get(inId);
            if (!replacement)
                continue;
            if (!products.some((p) => p.id === outId))
                continue;
            products = products.map((p) => p.id === outId ? mapProductToConceptShape(replacement, colors) : p);
        }
    }
    else if (review.removeProductId?.trim()) {
        const removeId = review.removeProductId.trim();
        const replacement = shortlist[0];
        if (replacement && products.some((p) => p.id === removeId)) {
            products = products.map((p) => p.id === removeId ? mapProductToConceptShape(replacement, colors) : p);
        }
    }
    if (review.keep?.length) {
        const keepSet = new Set(review.keep);
        const kept = products.filter((p) => keepSet.has(p.id));
        if (kept.length >= Math.min(minProducts, products.length))
            products = kept;
    }
    const catalogProducts = products
        .map((cp) => catalogById.get(cp.id) ?? { id: cp.id, name: cp.name, category: cp.category ?? '' })
        .filter((p) => p.id);
    const selectionInput = (0, selection_constraints_1.selectionConstraintsFromFilterInput)(filterInput ?? {
        userPrompt: brief,
        colors,
        allowedItems: [],
        forbiddenItems: [],
    }, { min: minProducts, max: maxProducts });
    const { products: finalized } = (0, selection_constraints_1.finalizeConceptSelection)(catalogProducts, selectionInput, {
        catalog,
        filterInput,
        conceptTitle: concept.title,
        conceptComposition: concept.composition ?? '',
    });
    const nextProducts = finalized.map((p) => mapProductToConceptShape(p, colors));
    const risks = [...(concept.risks ?? [])];
    for (const pair of review.replace ?? []) {
        if (pair.reason)
            risks.push(`LLM critic: ${pair.reason}`);
    }
    if (review.reason && !review.replace?.length)
        risks.push(`LLM critic: ${review.reason}`);
    return {
        ...concept,
        catalogProducts: nextProducts,
        productIds: nextProducts.map((p) => p.id),
        score: concept.score,
        risks: risks.length ? risks : concept.risks,
    };
}
async function critiqueConceptSetsWithLlm(concepts, brief, catalog, colors, openrouter, config, logWarn, filterInput, minProductsPerSet = 4, maxProductsPerSet = 7) {
    if (config.get('CATALOG_LLM_CRITIC', 'false') !== 'true')
        return concepts;
    if (!openrouter.isEnabled())
        return concepts;
    if (!concepts.length)
        return concepts;
    const timeoutMs = Number(config.get('CATALOG_LLM_CRITIC_TIMEOUT_MS', 6000)) || 6000;
    const payload = {
        brief: brief.slice(0, 1200),
        concepts: concepts.map((c, index) => {
            const shortlist = buildShortlist(c, catalog, brief, colors, filterInput);
            return {
                index,
                title: c.title,
                composition: c.composition ?? '',
                products: (c.catalogProducts ?? []).map((p) => ({
                    id: p.id,
                    name: p.name,
                    type: p.productType,
                    price: p.price,
                })),
                shortlist: shortlist.map((p) => ({
                    id: p.id,
                    name: p.name,
                    type: (0, concept_diversity_util_1.detectConceptProductType)(p),
                    price: p.price,
                })),
            };
        }),
    };
    try {
        const content = await (0, promise_timeout_util_1.withTimeout)(openrouter.chatJson({
            systemPrompt: SYSTEM_PROMPT,
            userMessage: JSON.stringify(payload),
            modelEnvKey: 'CATALOG_LLM_CRITIC_MODEL',
            maxTokensEnvKey: 'CATALOG_LLM_CRITIC_MAX_TOKENS',
            defaultMaxTokens: 900,
            agentName: 'CatalogLlmSetCritic',
        }), timeoutMs, 'CATALOG_LLM_CRITIC');
        const parsed = parseCriticResponse(content);
        const reviews = parsed.reviews ?? [];
        if (!reviews.length)
            return concepts;
        return concepts.map((concept, index) => {
            const review = reviews.find((r) => r.conceptIndex === index);
            if (!review)
                return concept;
            return applyReviewToConcept(concept, review, catalog, brief, colors, filterInput, minProductsPerSet, maxProductsPerSet);
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logWarn(`CATALOG_LLM_CRITIC fallback: ${msg}`);
        return concepts;
    }
}
//# sourceMappingURL=catalog-llm-set-critic.util.js.map
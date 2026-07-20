"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.replacePreviousGenerationProducts = replacePreviousGenerationProducts;
exports.refillConceptsAvoidingPrevious = refillConceptsAvoidingPrevious;
const catalog_variant_util_1 = require("./catalog-variant.util");
const concept_diversity_util_1 = require("./concept-diversity.util");
const catalog_brief_relevance_util_1 = require("./catalog-brief-relevance.util");
const concept_product_picker_util_1 = require("./concept-product-picker.util");
const concept_diversity_util_2 = require("./concept-diversity.util");
function replacePreviousGenerationProducts(concepts, previousProductIds, catalog, brief, brandColors = [], regenerationSeed = 0) {
    if (!previousProductIds.size)
        return concepts;
    const globallyUsed = new Set();
    const globallyUsedVariants = new Set();
    return concepts.map((concept, conceptIndex) => {
        const products = concept.catalogProducts ?? [];
        if (!products.length)
            return concept;
        const resolved = products.map((p) => ({ ...p }));
        const localTypes = new Set();
        for (const p of resolved) {
            localTypes.add((0, concept_diversity_util_1.detectConceptProductType)(p));
        }
        let changed = false;
        for (let i = 0; i < resolved.length; i++) {
            const current = resolved[i];
            const vk = (0, catalog_variant_util_1.productVariantKey)(current);
            const blockedByPrevious = previousProductIds.has(current.id);
            const blockedGlobally = globallyUsed.has(current.id) || globallyUsedVariants.has(vk);
            if (!blockedByPrevious && !blockedGlobally) {
                globallyUsed.add(current.id);
                globallyUsedVariants.add(vk);
                continue;
            }
            const currentType = (0, concept_diversity_util_1.detectConceptProductType)(current);
            const altTypes = new Set(localTypes);
            altTypes.delete(currentType);
            const candidates = catalog
                .filter((c) => {
                if (c.id === current.id)
                    return false;
                if (previousProductIds.has(c.id))
                    return false;
                if (globallyUsed.has(c.id))
                    return false;
                if (globallyUsedVariants.has((0, catalog_variant_util_1.productVariantKey)(c)))
                    return false;
                const type = (0, concept_diversity_util_1.detectConceptProductType)(c);
                if (type !== currentType)
                    return false;
                if ((0, concept_diversity_util_1.typeConflictsInSet)(altTypes, type))
                    return false;
                return true;
            })
                .sort((a, b) => (0, catalog_brief_relevance_util_1.scoreBriefRelevance)(b, brief, brandColors) -
                (0, catalog_brief_relevance_util_1.scoreBriefRelevance)(a, brief, brandColors));
            if (!candidates.length) {
                globallyUsed.add(current.id);
                globallyUsedVariants.add(vk);
                continue;
            }
            const pick = candidates[(regenerationSeed + conceptIndex * 17 + i * 3) % candidates.length] ??
                candidates[0];
            resolved[i] = pick;
            localTypes.delete(currentType);
            localTypes.add((0, concept_diversity_util_1.detectConceptProductType)(pick));
            globallyUsed.add(pick.id);
            globallyUsedVariants.add((0, catalog_variant_util_1.productVariantKey)(pick));
            changed = true;
        }
        if (!changed)
            return concept;
        const productIds = resolved.map((p) => p.id);
        const catalogProducts = resolved.map((p, idx) => {
            const prev = concept.catalogProducts?.[idx];
            return {
                id: p.id,
                name: p.name,
                category: p.category,
                productType: prev?.productType ?? (0, concept_diversity_util_1.detectConceptProductType)(p),
                price: p.price,
                stockAvailable: p.stockAvailable,
                colors: prev?.colors ?? [],
                catalogImageUrl: prev?.catalogImageUrl ?? p.catalogImageUrl ?? undefined,
                hasCatalogImage: prev?.hasCatalogImage ?? Boolean(p.catalogImageUrl?.trim()),
                sourceUrl: prev?.sourceUrl ?? null,
            };
        });
        return {
            ...concept,
            catalogProducts,
            productIds,
            previewProductImageUrls: catalogProducts
                .map((p) => p.catalogImageUrl)
                .filter(Boolean),
        };
    });
}
function refillConceptsAvoidingPrevious(concepts, previousProductIds, catalog, desiredCount, brief, brandColors = [], regenerationSeed = 0) {
    if (!previousProductIds.size)
        return concepts;
    const mandatoryTypes = [];
    const tracker = new concept_diversity_util_2.ConceptDiversityTracker(new Set(mandatoryTypes));
    const globallyUsedIds = new Set();
    const globallyUsedVariants = new Set();
    return concepts.map((concept, conceptIndex) => {
        const current = (concept.catalogProducts ?? []);
        for (const p of current) {
            globallyUsedIds.add(p.id);
            globallyUsedVariants.add((0, catalog_variant_util_1.productVariantKey)(p));
        }
        if (current.length >= desiredCount)
            return concept;
        const blockedIds = new Set([
            ...previousProductIds,
            ...globallyUsedIds,
            ...current.map((p) => p.id),
        ]);
        const blockedVariants = new Set([
            ...globallyUsedVariants,
            ...current.map((p) => (0, catalog_variant_util_1.productVariantKey)(p)),
        ]);
        const filled = (0, concept_product_picker_util_1.ensureConceptProducts)(current, catalog.filter((p) => !blockedIds.has(p.id) && !blockedVariants.has((0, catalog_variant_util_1.productVariantKey)(p))), desiredCount, {
            title: concept.title,
            composition: concept.composition ?? concept.description ?? '',
            brief,
            style: concept.style,
        }, blockedIds, blockedVariants, tracker, regenerationSeed + conceptIndex * 41, false, (p) => (0, catalog_brief_relevance_util_1.scoreBriefRelevance)(p, brief, brandColors), mandatoryTypes);
        if (filled.length <= current.length)
            return concept;
        for (const p of filled) {
            globallyUsedIds.add(p.id);
            globallyUsedVariants.add((0, catalog_variant_util_1.productVariantKey)(p));
        }
        const catalogProducts = filled.map((p) => ({
            id: p.id,
            name: p.name,
            category: p.category,
            productType: (0, concept_diversity_util_1.detectConceptProductType)(p),
            price: p.price,
            stockAvailable: p.stockAvailable,
            colors: [],
            catalogImageUrl: p.catalogImageUrl ?? undefined,
            hasCatalogImage: Boolean(p.catalogImageUrl?.trim()),
            sourceUrl: null,
        }));
        return {
            ...concept,
            catalogProducts,
            productIds: filled.map((p) => p.id),
            previewProductImageUrls: catalogProducts
                .map((p) => p.catalogImageUrl)
                .filter(Boolean),
        };
    });
}
//# sourceMappingURL=regeneration-novelty.util.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedVariantKeysFromProductIds = seedVariantKeysFromProductIds;
exports.enforceGlobalConceptUniqueness = enforceGlobalConceptUniqueness;
const catalog_variant_util_1 = require("./catalog-variant.util");
const concept_diversity_util_1 = require("./concept-diversity.util");
const catalog_brief_relevance_util_1 = require("./catalog-brief-relevance.util");
const concept_product_picker_util_1 = require("./concept-product-picker.util");
const mandatory_types_util_1 = require("../../requests/mandatory-types.util");
const named_positions_util_1 = require("../../requests/named-positions.util");
const set_budget_util_1 = require("./set-budget.util");
function seedVariantKeysFromProductIds(productIds, catalogById) {
    const keys = new Set();
    for (const id of productIds) {
        const p = catalogById.get(id);
        if (p)
            keys.add((0, catalog_variant_util_1.productVariantKey)(p));
    }
    return keys;
}
function remapConceptProducts(concept, products) {
    const catalogProducts = products.map((p) => {
        const prev = concept.catalogProducts?.find((x) => x.id === p.id);
        return {
            id: p.id,
            name: p.name,
            category: p.category,
            productType: prev?.productType ?? (0, concept_diversity_util_1.detectConceptProductType)(p),
            price: p.price,
            stockAvailable: p.stockAvailable,
            colors: prev?.colors ?? [],
            catalogImageUrl: p.catalogImageUrl ?? prev?.catalogImageUrl,
            imageUrl: p.catalogImageUrl ?? prev?.imageUrl,
            image: p.catalogImageUrl ?? prev?.image,
            hasCatalogImage: Boolean(p.catalogImageUrl?.trim()),
            sourceUrl: prev?.sourceUrl ?? null,
        };
    });
    return {
        ...concept,
        catalogProducts,
        productIds: products.map((p) => p.id),
        previewProductImageUrls: catalogProducts
            .map((p) => p.catalogImageUrl)
            .filter(Boolean),
    };
}
function enforceGlobalConceptUniqueness(concepts, catalog, brief, brandColors = [], minProductsPerSet = 4, log, budgetPerSet = null, directedMode = false) {
    const usedIds = new Set();
    const usedVariants = new Set();
    const mandatoryTypes = (0, mandatory_types_util_1.resolveMandatoryTypesForBrief)(brief);
    const directed = directedMode || (0, named_positions_util_1.isDirectedBriefMode)((0, named_positions_util_1.resolveNamedItemsForBrief)(brief).namedTypes);
    const tracker = new concept_diversity_util_1.ConceptDiversityTracker(new Set(mandatoryTypes));
    const catalogById = new Map(catalog.map((p) => [p.id, p]));
    let repairCount = 0;
    const result = concepts.map((concept, conceptIndex) => {
        let products = (concept.catalogProducts ?? [])
            .map((cp) => catalogById.get(cp.id) ?? { ...cp })
            .filter(Boolean);
        const kept = [];
        for (const p of products) {
            const vk = (0, catalog_variant_util_1.productVariantKey)(p);
            if (usedIds.has(p.id) || usedVariants.has(vk)) {
                repairCount++;
                continue;
            }
            kept.push(p);
            usedIds.add(p.id);
            usedVariants.add(vk);
        }
        products = kept;
        if (products.length < minProductsPerSet && !directed) {
            const blockedIds = new Set([...usedIds, ...products.map((p) => p.id)]);
            const blockedVariants = new Set([
                ...usedVariants,
                ...products.map((p) => (0, catalog_variant_util_1.productVariantKey)(p)),
            ]);
            const pool = catalog.filter((p) => !blockedIds.has(p.id) &&
                !blockedVariants.has((0, catalog_variant_util_1.productVariantKey)(p)) &&
                (budgetPerSet == null || budgetPerSet <= 0 || (p.price ?? 0) <= budgetPerSet));
            products = (0, concept_product_picker_util_1.ensureConceptProducts)(products, pool.length >= minProductsPerSet ? pool : catalog.filter((p) => !blockedIds.has(p.id) && !blockedVariants.has((0, catalog_variant_util_1.productVariantKey)(p))), minProductsPerSet, {
                title: concept.title,
                composition: concept.composition ?? concept.description ?? '',
                brief,
                style: concept.style,
            }, blockedIds, blockedVariants, tracker, conceptIndex * 59 + repairCount, false, (p) => (0, catalog_brief_relevance_util_1.scoreBriefRelevance)(p, brief, brandColors), mandatoryTypes);
        }
        if (budgetPerSet != null && budgetPerSet > 0 && products.length > 0) {
            const crossBlockedIds = new Set(usedIds);
            const crossBlockedVariants = new Set(usedVariants);
            for (const p of products) {
                crossBlockedIds.delete(p.id);
                crossBlockedVariants.delete((0, catalog_variant_util_1.productVariantKey)(p));
            }
            products = (0, set_budget_util_1.enforceSetBudget)(products, catalog, budgetPerSet, crossBlockedIds, crossBlockedVariants, conceptIndex * 67, minProductsPerSet);
        }
        for (const p of products) {
            usedIds.add(p.id);
            usedVariants.add((0, catalog_variant_util_1.productVariantKey)(p));
        }
        return remapConceptProducts(concept, products);
    });
    if (repairCount > 0) {
        log?.(`Cross-concept dedup: removed/replaced ${repairCount} duplicate SKU(s) across sets`);
    }
    const allIds = [];
    const allVk = [];
    for (const c of result) {
        for (const p of c.catalogProducts ?? []) {
            allIds.push(p.id);
            allVk.push((0, catalog_variant_util_1.productVariantKey)({ ...p, silhouetteImageUrl: '' }));
        }
    }
    if (new Set(allIds).size !== allIds.length || new Set(allVk).size !== allVk.length) {
        log?.(`Cross-concept dedup: WARNING still has duplicates after repair`);
    }
    return result;
}
//# sourceMappingURL=cross-concept-uniqueness.util.js.map
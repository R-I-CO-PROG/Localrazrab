"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scoreSetCohesion = scoreSetCohesion;
exports.tryFixSetOutlier = tryFixSetOutlier;
const catalog_color_match_util_1 = require("./catalog-color-match.util");
const catalog_variant_util_1 = require("./catalog-variant.util");
const concept_diversity_util_1 = require("./concept-diversity.util");
const catalog_brief_relevance_util_1 = require("./catalog-brief-relevance.util");
function rgbDistance(a, b) {
    const dr = a[0] - b[0];
    const dg = a[1] - b[1];
    const db = a[2] - b[2];
    return Math.sqrt(dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11);
}
function scoreSetCohesion(products, options = {}) {
    if (products.length <= 1) {
        return { score: 100, outlierIndex: null, reason: null };
    }
    const brief = options.brief ?? '';
    const brandColors = options.brandColors ?? [];
    const forbiddenHints = (0, catalog_brief_relevance_util_1.parseBriefForbiddenColors)(brief);
    let score = 80;
    let outlierIndex = null;
    let reason = null;
    if (brief) {
        const relevanceScores = products.map((p) => (0, catalog_brief_relevance_util_1.scoreBriefRelevance)(p, brief, brandColors));
        const avgRel = relevanceScores.reduce((a, b) => a + b, 0) / relevanceScores.length;
        if (avgRel < 0)
            score -= 25;
        else if (avgRel > 30)
            score += 10;
        const worstRelIdx = relevanceScores.indexOf(Math.min(...relevanceScores));
        if (relevanceScores[worstRelIdx] < -50) {
            score -= 15;
            if (outlierIndex === null) {
                outlierIndex = worstRelIdx;
                reason = 'theme_outlier';
            }
        }
    }
    if (brandColors.length || forbiddenHints.length) {
        const paletteScores = products.map((p) => (0, catalog_color_match_util_1.scoreBriefPaletteMatch)(p, brandColors, forbiddenHints));
        const avgPalette = paletteScores.reduce((a, b) => a + b, 0) / paletteScores.length;
        if (avgPalette < -20)
            score -= 20;
        else if (avgPalette > 25)
            score += 8;
    }
    const prices = products.map((p) => p.price ?? 0).filter((p) => p > 0);
    if (prices.length >= 2) {
        const sorted = [...prices].sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];
        const maxRatio = sorted[sorted.length - 1] / Math.max(sorted[0], 0.01);
        if (maxRatio > 5) {
            score -= 20;
            const worstIdx = products.findIndex((p) => (p.price ?? 0) > 0 && ((p.price ?? 0) > median * 3 || (p.price ?? 0) < median / 3));
            if (worstIdx >= 0 && outlierIndex === null) {
                outlierIndex = worstIdx;
                reason = 'price_outlier';
            }
        }
        else if (maxRatio > 3) {
            score -= 8;
        }
    }
    const rgbs = [];
    for (let i = 0; i < products.length; i++) {
        const rgb = (0, catalog_color_match_util_1.inferProductRgb)(products[i]);
        if (rgb)
            rgbs.push({ rgb, idx: i });
    }
    if (rgbs.length >= 3) {
        const avgR = rgbs.reduce((s, c) => s + c.rgb[0], 0) / rgbs.length;
        const avgG = rgbs.reduce((s, c) => s + c.rgb[1], 0) / rgbs.length;
        const avgB = rgbs.reduce((s, c) => s + c.rgb[2], 0) / rgbs.length;
        const center = [avgR, avgG, avgB];
        const distances = rgbs.map((c) => ({
            dist: rgbDistance(c.rgb, center),
            idx: c.idx,
        }));
        distances.sort((a, b) => b.dist - a.dist);
        const worst = distances[0];
        const secondWorst = distances[1];
        if (worst && secondWorst && worst.dist > 90 && worst.dist > secondWorst.dist * 1.8) {
            score -= 18;
            if (outlierIndex === null) {
                outlierIndex = worst.idx;
                reason = 'color_outlier';
            }
        }
        else if (worst && worst.dist > 120) {
            score -= 10;
        }
    }
    return { score: Math.max(0, Math.min(100, score)), outlierIndex, reason };
}
function tryFixSetOutlier(products, outlierIndex, catalog, blockedIds, blockedVariants, brandColors, brief = '') {
    const outlier = products[outlierIndex];
    if (!outlier)
        return null;
    const outlierType = (0, concept_diversity_util_1.detectConceptProductType)(outlier);
    const otherTypes = new Set(products.filter((_, i) => i !== outlierIndex).map((p) => (0, concept_diversity_util_1.detectConceptProductType)(p)));
    const usedIds = new Set([...blockedIds, ...products.map((p) => p.id)]);
    const usedVariants = new Set([...blockedVariants, ...products.map((p) => (0, catalog_variant_util_1.productVariantKey)(p))]);
    usedIds.delete(outlier.id);
    usedVariants.delete((0, catalog_variant_util_1.productVariantKey)(outlier));
    const forbiddenHints = (0, catalog_brief_relevance_util_1.parseBriefForbiddenColors)(brief);
    const candidates = catalog
        .filter((p) => {
        if (usedIds.has(p.id) || usedVariants.has((0, catalog_variant_util_1.productVariantKey)(p)))
            return false;
        const type = (0, concept_diversity_util_1.detectConceptProductType)(p);
        if (type !== outlierType)
            return false;
        if ((0, concept_diversity_util_1.typeConflictsInSet)(otherTypes, type))
            return false;
        return true;
    })
        .sort((a, b) => (0, catalog_color_match_util_1.scoreBriefPaletteMatch)(b, brandColors, forbiddenHints) +
        (0, catalog_brief_relevance_util_1.scoreBriefRelevance)(b, brief, brandColors) -
        ((0, catalog_color_match_util_1.scoreBriefPaletteMatch)(a, brandColors, forbiddenHints) +
            (0, catalog_brief_relevance_util_1.scoreBriefRelevance)(a, brief, brandColors)));
    if (!candidates.length)
        return null;
    const replacement = candidates[0];
    const newProducts = [...products];
    newProducts[outlierIndex] = replacement;
    const oldScore = scoreSetCohesion(products, { brief, brandColors }).score;
    const newScore = scoreSetCohesion(newProducts, { brief, brandColors }).score;
    return newScore > oldScore ? newProducts : null;
}
//# sourceMappingURL=set-cohesion.util.js.map
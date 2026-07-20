"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeTypeCoverage = analyzeTypeCoverage;
const concept_diversity_util_1 = require("./concept-diversity.util");
function analyzeTypeCoverage(catalog) {
    const byType = new Map();
    const otherByCategory = new Map();
    for (const product of catalog) {
        const type = (0, concept_diversity_util_1.detectConceptProductType)(product);
        byType.set(type, (byType.get(type) ?? 0) + 1);
        if (type === 'other') {
            const cat = product.subcategory?.trim() || product.category || 'Без категории';
            const entry = otherByCategory.get(cat) ?? { count: 0, samples: [] };
            entry.count++;
            if (entry.samples.length < 5)
                entry.samples.push(product.name);
            otherByCategory.set(cat, entry);
        }
    }
    const total = catalog.length;
    const otherCount = byType.get('other') ?? 0;
    return {
        total,
        matched: total - otherCount,
        other: otherCount,
        otherPercent: total > 0 ? Math.round((otherCount / total) * 100) : 0,
        byType: [...byType.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([type, count]) => ({ type, count, percent: Math.round((count / total) * 100) })),
        topOtherCategories: [...otherByCategory.entries()]
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, 15)
            .map(([category, data]) => ({ category, ...data })),
    };
}
//# sourceMappingURL=catalog-type-coverage.diagnostic.js.map
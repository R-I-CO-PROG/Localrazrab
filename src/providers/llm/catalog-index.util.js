"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toCompactCatalogRow = toCompactCatalogRow;
exports.buildCatalogOverview = buildCatalogOverview;
exports.stratifiedCatalogForLlm = stratifiedCatalogForLlm;
exports.buildCatalogAgentPayload = buildCatalogAgentPayload;
const concept_diversity_util_1 = require("./concept-diversity.util");
const imba_category_overrides_1 = require("../../catalog/imba-category-overrides");
const catalog_filter_util_1 = require("./catalog-filter.util");
const yield_event_loop_1 = require("../../common/yield-event-loop");
const DEFAULT_STRATIFIED_MAX = 480;
function toCompactCatalogRow(product) {
    return {
        name: product.name,
        category: product.subcategory?.trim() || product.category,
        price: product.price ?? null,
        stock: product.stockAvailable ?? 0,
    };
}
function buildCatalogOverview(catalog, totalInDatabase) {
    const byCategory = new Map();
    const byType = new Map();
    for (const product of catalog) {
        const path = product.subcategory?.trim();
        const cat = path ? (0, imba_category_overrides_1.imbaCategoryBranch)(path, 2) : product.category || 'Прочее';
        const list = byCategory.get(cat) ?? [];
        list.push(product);
        byCategory.set(cat, list);
        const type = (0, concept_diversity_util_1.detectConceptProductType)(product);
        byType.set(type, (byType.get(type) ?? 0) + 1);
    }
    const categories = [...byCategory.entries()]
        .sort((a, b) => b[1].length - a[1].length)
        .map(([name, products]) => ({
        name,
        count: products.length,
        samples: products.slice(0, 4).map((p) => p.name),
    }));
    const productTypes = [...byType.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([type, count]) => ({ type, count }));
    return {
        totalProducts: catalog.length,
        totalInDatabase,
        categories,
        productTypes,
    };
}
async function stratifiedCatalogForLlm(catalog, input, maxItems = DEFAULT_STRATIFIED_MAX) {
    if (catalog.length <= maxItems)
        return catalog;
    const scored = catalog
        .map((p) => ({ product: p, score: (0, catalog_filter_util_1.scoreProductForBrief)(p, input) }))
        .sort((a, b) => b.score - a.score || (a.product.price ?? 0) - (b.product.price ?? 0));
    if (catalog.length > 2000)
        await (0, yield_event_loop_1.yieldEventLoop)();
    const perTypeCap = Math.max(6, Math.min(12, Math.floor(maxItems / 45)));
    const byType = new Map();
    for (const { product } of scored) {
        const type = (0, concept_diversity_util_1.detectConceptProductType)(product);
        const list = byType.get(type) ?? [];
        if (list.length >= perTypeCap)
            continue;
        list.push(product);
        byType.set(type, list);
    }
    const picked = new Map();
    for (const products of byType.values()) {
        for (const p of products)
            picked.set(p.id, p);
    }
    const byCategory = new Map();
    for (const { product } of scored) {
        const path = (0, imba_category_overrides_1.catalogImbaPath)(product);
        const cat = path.includes(' / ') ? (0, imba_category_overrides_1.imbaCategoryBranch)(path, 2) : path;
        const list = byCategory.get(cat) ?? [];
        if (list.length >= 2)
            continue;
        list.push(product);
        byCategory.set(cat, list);
    }
    for (const products of byCategory.values()) {
        for (const p of products)
            picked.set(p.id, p);
    }
    for (const { product } of scored) {
        if (picked.size >= maxItems)
            break;
        picked.set(product.id, product);
    }
    const exploreSlots = Math.min(40, Math.floor(maxItems * 0.08));
    const midStart = Math.floor(scored.length * 0.35);
    const midPool = scored.slice(midStart, midStart + exploreSlots * 4);
    let added = 0;
    for (const { product } of midPool) {
        if (picked.size >= maxItems || added >= exploreSlots)
            break;
        if (picked.has(product.id))
            continue;
        picked.set(product.id, product);
        added++;
    }
    return [...picked.values()].slice(0, maxItems);
}
function buildCatalogAgentPayload(catalogSample, overview, extra = {}) {
    return {
        catalog_overview: overview,
        catalog_total_in_scope: overview.totalProducts,
        catalog_sample_size: catalogSample.length,
        catalog_products: catalogSample.map(toCompactCatalogRow),
        catalog_note: 'catalog_products — репрезентативная выборка из всего каталога (по типам и IMBA-категориям). ' +
            'category в catalog_products — полный IMBA path (напр. «Продукция / Кухня и посуда / …»). ' +
            'catalog_overview.categories — агрегат по веткам IMBA (уровень 1–2). ' +
            'Выбирайте ТОЛЬКО name из catalog_products (точное совпадение). ' +
            'После отбора система сопоставит SKU с полным каталогом.',
        ...extra,
    };
}
//# sourceMappingURL=catalog-index.util.js.map
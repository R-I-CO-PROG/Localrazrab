"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.filterCatalogByNameConstraints = filterCatalogByNameConstraints;
exports.ensureMandatoryBriefProducts = ensureMandatoryBriefProducts;
const catalog_util_1 = require("./catalog.util");
const concept_diversity_util_1 = require("./concept-diversity.util");
const brief_constraints_util_1 = require("../../requests/brief-constraints.util");
function normalizeName(name) {
    return name.toLowerCase().replace(/ё/g, 'е');
}
const FORBIDDEN_NAME_PATTERNS = {
    Алкоголь: /алког|вино|виски|шампан|пив[оа]\b/i,
    Еда: /конфет|шоколад|сладост|печень|прян/i,
    Косметика: /космет|крем|парфюм|духи/i,
    'Пластиковые многоразовые': /фляг|flask|пластиков\w*\s+бутыл|многоразов\w*\s+стакан|pp\s*bottle/i,
    Одноразовое: /одноразов|disposable|бумажн\w*\s+стакан|пластиков\w*\s+тарелк/i,
    Пластик: /пластик|пластмасс|\bplastic\b|polypropylene|полипропилен/i,
    Электроника: /power\s*bank|пауэр|аккумулятор|зарядн|флеш|usb|flash|колонк|bluetooth|наушник|спикер/i,
};
function filterCatalogByNameConstraints(catalog, allowedItems, forbiddenItems, userPrompt = '') {
    let filtered = [...catalog];
    const textileAllowed = allowedItems.includes('Текстиль');
    const reconciled = (0, brief_constraints_util_1.reconcileBriefConstraints)(userPrompt, allowedItems, forbiddenItems);
    if (forbiddenItems.includes('Одежда') && !textileAllowed) {
        filtered = filtered.filter((p) => !(0, catalog_util_1.isClothingProductName)(p.name));
    }
    for (const forbidden of reconciled.forbiddenItems) {
        if (forbidden === 'Одежда')
            continue;
        const pattern = FORBIDDEN_NAME_PATTERNS[forbidden] ??
            FORBIDDEN_NAME_PATTERNS[forbidden.charAt(0).toUpperCase() + forbidden.slice(1).toLowerCase()] ??
            (/пластик/i.test(forbidden) ? FORBIDDEN_NAME_PATTERNS['Пластик'] : undefined);
        if (pattern) {
            filtered = filtered.filter((p) => {
                const name = normalizeName(p.name);
                if (!pattern.test(name))
                    return true;
                if (forbidden === 'Электроника' && /очк|sunglass|eyewear/i.test(name))
                    return true;
                return false;
            });
        }
    }
    if (reconciled.forbiddenMaterials.length) {
        const strict = filtered.filter((p) => !(0, brief_constraints_util_1.productViolatesMaterialBan)(p.name, p.description ?? '', p.category, reconciled.forbiddenMaterials));
        if (strict.length >= 12) {
            filtered = strict;
        }
    }
    if (reconciled.qualityFloor === 'premium') {
        const premiumFiltered = filtered.filter((p) => (p.price ?? 0) >= 80 || (p.price ?? 0) === 0);
        if (premiumFiltered.length >= 8)
            filtered = premiumFiltered;
    }
    return filtered.length > 0 ? filtered : catalog;
}
function ensureMandatoryBriefProducts(fullCatalog, filtered, userPrompt) {
    const mandatory = (0, concept_diversity_util_1.detectMandatoryConceptTypesFromBrief)(userPrompt);
    if (!mandatory.length)
        return filtered;
    const ids = new Set(filtered.map((p) => p.id));
    const extra = [];
    for (const product of fullCatalog) {
        if (ids.has(product.id))
            continue;
        const type = (0, concept_diversity_util_1.detectConceptProductType)(product);
        if (mandatory.some((m) => (0, concept_diversity_util_1.mandatoryTypeAliases)(m).includes(type))) {
            extra.push(product);
            ids.add(product.id);
        }
    }
    return extra.length ? [...filtered, ...extra] : filtered;
}
//# sourceMappingURL=catalog-name-match.util.js.map
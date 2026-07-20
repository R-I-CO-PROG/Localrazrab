"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveMandatoryTypesForBrief = resolveMandatoryTypesForBrief;
const concept_diversity_util_1 = require("../providers/llm/concept-diversity.util");
const brief_required_categories_util_1 = require("./brief-required-categories.util");
const named_positions_util_1 = require("./named-positions.util");
const REQUIRED_CATEGORY_TYPE_HINTS = {
    tech_accessories: ['powerbank', 'flash_drive', 'flash'],
    learning_materials: ['notebook', 'pen', 'diary'],
    eco_products: ['bottle', 'shopper'],
    premium_items: ['watch', 'diary'],
};
const NON_MANDATORY_OCCASION_TYPES = new Set(['welcome_pack', 'welcome_box', 'gift_set']);
function resolveMandatoryTypesForBrief(brief, uiAllowedItems = []) {
    const found = new Set((0, concept_diversity_util_1.detectMandatoryConceptTypesFromBrief)(brief));
    for (const req of (0, brief_required_categories_util_1.extractRequiredCategoriesFromBrief)(brief)) {
        for (const type of REQUIRED_CATEGORY_TYPE_HINTS[req.key] ?? []) {
            found.add(type);
        }
    }
    for (const type of (0, named_positions_util_1.resolveNamedItemsForBrief)(brief, uiAllowedItems).namedTypes) {
        found.add(type);
    }
    for (const occasion of NON_MANDATORY_OCCASION_TYPES)
        found.delete(occasion);
    return [...found];
}
//# sourceMappingURL=mandatory-types.util.js.map
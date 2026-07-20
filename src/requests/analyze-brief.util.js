"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeBrief = analyzeBrief;
const parse_brief_util_1 = require("./parse-brief.util");
const brief_constraints_util_1 = require("./brief-constraints.util");
const named_positions_util_1 = require("./named-positions.util");
const brief_category_buckets_util_1 = require("../catalog/brief-category-buckets.util");
const mandatory_types_util_1 = require("./mandatory-types.util");
const brief_required_categories_util_1 = require("./brief-required-categories.util");
function fieldSource(key, local, llm) {
    const fromLocal = local.updatedFields.includes(key);
    const fromLlm = llm ? Object.prototype.hasOwnProperty.call(llm, key) : false;
    if (fromLocal && fromLlm)
        return 'hybrid';
    if (fromLlm)
        return 'llm';
    return 'local';
}
function buildWarnings(text, reconciled, namedItems, namedTypes, mandatoryTypes) {
    const warnings = [];
    if (namedItems.length > 0 && namedTypes.length < namedItems.length) {
        const unresolved = namedItems.filter((label) => !(0, named_positions_util_1.resolveNamedItemsForBrief)('', [label]).namedTypes.length);
        if (unresolved.length) {
            warnings.push(`Не удалось сопоставить позиции с типами каталога: ${unresolved.join(', ')}`);
        }
    }
    if (reconciled.forbiddenItems.includes('Одежда') && /одежд|футбол|мерч/i.test(text)) {
        warnings.push('В брифе упоминается одежда, но в ограничениях стоит «без одежды»');
    }
    if (mandatoryTypes.length === 0 && /обязательн|должн\w*\s+быть|включ\w*/i.test(text)) {
        warnings.push('В брифе есть требования к составу, но обязательные типы не распознаны');
    }
    if (reconciled.qualityFloor === 'premium' && reconciled.forbiddenMaterials.includes('mass_market')) {
        warnings.push('Режим premium: масс-маркет позиции будут отфильтрованы');
    }
    return warnings;
}
function analyzeBrief(userPrompt, options = {}) {
    const text = userPrompt.trim();
    const local = (0, parse_brief_util_1.parseBriefLocally)(text);
    const merged = options.llmPartial
        ? (0, parse_brief_util_1.mergeParsedBrief)(text, local, options.llmPartial)
        : local;
    const uiSplit = (0, named_positions_util_1.splitAllowedItemsMixed)(options.uiAllowedItems ?? []);
    const categoryBuckets = [
        ...new Set([...(merged.allowedItems ?? []), ...uiSplit.categories]),
    ];
    const named = (0, named_positions_util_1.resolveNamedItemsForBrief)(text, [
        ...(merged.namedItems ?? []),
        ...uiSplit.namedItems,
    ]);
    const reconciled = (0, brief_constraints_util_1.reconcileBriefConstraints)(text, categoryBuckets, [...new Set([...(merged.forbiddenItems ?? []), ...(options.uiForbiddenItems ?? [])])], merged.budgetMax);
    const mandatoryTypes = [
        ...new Set([
            ...(0, mandatory_types_util_1.resolveMandatoryTypesForBrief)(text, options.uiAllowedItems ?? []),
            ...named.namedTypes,
        ]),
    ];
    const directedMode = named.namedTypes.length > 0;
    const warnings = [
        ...buildWarnings(text, reconciled, named.namedItems, named.namedTypes, mandatoryTypes),
        ...(reconciled.warnings ?? []),
    ];
    const sources = {};
    const track = (key, source) => {
        sources[key] = source;
    };
    const result = { warnings, sources };
    if (merged.category) {
        track('category', fieldSource('category', local, options.llmPartial));
        result.category = { value: merged.category, source: fieldSource('category', local, options.llmPartial) };
    }
    if (merged.quantity) {
        result.quantity = { value: merged.quantity, source: fieldSource('quantity', local, options.llmPartial) };
        track('quantity', result.quantity.source);
    }
    if (merged.setItemCount) {
        result.setItemCount = {
            value: merged.setItemCount,
            source: fieldSource('setItemCount', local, options.llmPartial),
        };
        track('setItemCount', result.setItemCount.source);
    }
    if (merged.budgetMin != null) {
        result.budgetMin = { value: merged.budgetMin, source: fieldSource('budgetMin', local, options.llmPartial) };
        track('budgetMin', result.budgetMin.source);
    }
    if (merged.budgetMax != null) {
        result.budgetMax = { value: merged.budgetMax, source: fieldSource('budgetMax', local, options.llmPartial) };
        track('budgetMax', result.budgetMax.source);
    }
    if (merged.budgetScope) {
        result.budgetScope = {
            value: merged.budgetScope,
            source: fieldSource('budgetMin', local, options.llmPartial),
        };
        track('budgetScope', result.budgetScope.source);
    }
    if (merged.colors?.length) {
        result.colors = { value: merged.colors, source: fieldSource('colors', local, options.llmPartial) };
        track('colors', result.colors.source);
    }
    result.allowedItems = {
        value: [
            ...new Set([
                ...(0, brief_category_buckets_util_1.normalizeBriefAllowedBuckets)(categoryBuckets),
                ...(0, brief_category_buckets_util_1.normalizeBriefAllowedBuckets)(reconciled.allowedItems),
            ]),
        ],
        source: uiSplit.categories.length ? 'ui' : 'reconciled',
    };
    track('allowedItems', result.allowedItems.source);
    if (named.namedItems.length) {
        result.namedItems = { value: named.namedItems, source: named.namedItems.some((n) => uiSplit.namedItems.includes(n)) ? 'hybrid' : 'local' };
        track('namedItems', result.namedItems.source);
    }
    if (reconciled.forbiddenItems.length) {
        result.forbiddenItems = {
            value: reconciled.forbiddenItems,
            source: options.uiForbiddenItems?.length ? 'ui' : 'reconciled',
        };
        track('forbiddenItems', result.forbiddenItems.source);
    }
    if (merged.alternativeTypeGroups?.length) {
        result.alternativeTypeGroups = {
            value: merged.alternativeTypeGroups,
            source: fieldSource('alternativeTypeGroups', local, options.llmPartial),
        };
        track('alternativeTypeGroups', result.alternativeTypeGroups.source);
    }
    result.mandatoryTypes = { value: mandatoryTypes, source: directedMode ? 'reconciled' : 'local' };
    track('mandatoryTypes', result.mandatoryTypes.source);
    const mandatoryCategories = (0, brief_required_categories_util_1.extractRequiredCategoriesFromBrief)(text);
    if (mandatoryCategories.length) {
        result.mandatoryCategories = { value: mandatoryCategories, source: 'local' };
        track('mandatoryCategories', 'local');
    }
    result.directedMode = { value: directedMode, source: 'reconciled' };
    track('directedMode', 'reconciled');
    if (merged.notes) {
        result.notes = { value: merged.notes, source: fieldSource('notes', local, options.llmPartial) };
        track('notes', result.notes.source);
    }
    return result;
}
//# sourceMappingURL=analyze-brief.util.js.map
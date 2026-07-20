"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateLocalCatalogIdeas = generateLocalCatalogIdeas;
const concept_diversity_util_1 = require("./concept-diversity.util");
const named_positions_util_1 = require("../../requests/named-positions.util");
const SLOT_ARCHETYPES = [
    ['notebook', 'pen', 'bottle'],
    ['thermos', 'mug', 'notebook'],
    ['powerbank', 'flash', 'pen'],
    ['shopper', 'umbrella', 'bottle'],
    ['backpack', 'thermos', 'notebook'],
    ['mug', 'pen', 'diary'],
    ['speaker', 'powerbank', 'bottle'],
    ['blanket', 'mug', 'candle'],
    ['tshirt', 'cap', 'bottle'],
    ['hoodie', 'shopper', 'bottle'],
];
const THEME_TITLES = [
    'Практичный welcome-набор',
    'Tech-набор для команды',
    'Эко-комплект',
    'Офисный daily kit',
    'Премиальный подарок',
    'Event-набор',
    'Комфорт и уют',
    'Динамичный спорт-набор',
];
function archetypeIndex(seed) {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
    }
    return hash % SLOT_ARCHETYPES.length;
}
function fillSlots(archetype, desiredCount, mandatoryTypes, conceptIndex, alternativeTypeGroups = []) {
    const allowed = new Set(concept_diversity_util_1.CATALOG_IDEATOR_TYPE_SLUGS);
    const seenFamilies = new Set();
    const seenTypes = new Set();
    const slots = [];
    const addType = (type, priority = 'nice') => {
        if (!allowed.has(type) || seenTypes.has(type))
            return;
        const family = (0, concept_diversity_util_1.getProductTypeFamily)(type);
        if (seenFamilies.has(family))
            return;
        slots.push({ type, priority });
        seenTypes.add(type);
        seenFamilies.add(family);
    };
    for (const type of mandatoryTypes) {
        addType(type, 'must');
    }
    const alt = (0, concept_diversity_util_1.pickAlternativeTypesForConcept)(alternativeTypeGroups, conceptIndex);
    for (const type of alt) {
        if (slots.length >= desiredCount)
            break;
        addType(type, 'must');
    }
    const arch = archetype.length ? archetype : SLOT_ARCHETYPES[0];
    for (const type of arch) {
        if (slots.length >= desiredCount)
            break;
        addType(type);
    }
    const extras = ['bottle', 'mug', 'pen', 'notebook', 'powerbank', 'shopper', 'thermos'];
    for (const type of extras) {
        if (slots.length >= desiredCount)
            break;
        addType(type);
    }
    return slots.slice(0, desiredCount);
}
function generateLocalCatalogIdeas(input) {
    const named = (0, named_positions_util_1.resolveNamedItemsForBrief)(input.userPrompt, []);
    const directedMode = input.directedMode ?? (0, named_positions_util_1.isDirectedBriefMode)(input.namedTypes ?? named.namedTypes);
    const namedTypes = input.namedTypes?.length ? input.namedTypes : named.namedTypes;
    const namedItems = input.namedItems?.length ? input.namedItems : named.namedItems;
    if (directedMode && namedTypes.length > 0) {
        const target = Math.max(3, Math.min(input.count ?? 8, 12));
        const briefSnippet = input.userPrompt.slice(0, 80);
        const slots = namedTypes.slice(0, input.desiredItemCount).map((type, i) => ({
            type,
            priority: 'must',
            notes: namedItems[i] ?? type,
            positionLabel: namedItems[i] ?? type,
        }));
        return Array.from({ length: target }, (_, i) => ({
            title: `Набор по позициям ${i + 1}`,
            composition: `Подбор по именованным позициям: ${namedItems.join(', ') || namedTypes.join(', ')}. ${briefSnippet}`,
            style: 'корпоративный',
            themeAxis: 'directed_positions',
            whyItFits: `Обязательные позиции из брифа: ${namedItems.join(', ') || namedTypes.join(', ')}`,
            productSlots: slots,
            items: namedItems,
        }));
    }
    const target = Math.max(3, Math.min(input.count ?? 8, 12));
    const ideas = [];
    const briefSnippet = input.userPrompt.slice(0, 80);
    for (let i = 0; i < target; i++) {
        const arch = SLOT_ARCHETYPES[(archetypeIndex(input.userPrompt) + i) % SLOT_ARCHETYPES.length];
        const altGroups = input.alternativeTypeGroups ?? [];
        const slots = fillSlots(arch, input.desiredItemCount, input.mandatoryTypes, i, altGroups);
        const title = THEME_TITLES[i % THEME_TITLES.length] ?? `Набор ${i + 1}`;
        ideas.push({
            title: `${title} ${i + 1}`,
            composition: `Локальный подбор под задачу: ${briefSnippet}`,
            style: input.category?.includes('Event') ? 'event' : 'корпоративный',
            themeAxis: input.category ?? 'general',
            whyItFits: `Соответствует брифу: ${briefSnippet}`,
            productSlots: slots,
            items: [],
        });
        if (altGroups.length)
            void altGroups;
    }
    return ideas;
}
//# sourceMappingURL=catalog-local-ideator.util.js.map
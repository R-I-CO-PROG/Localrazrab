import type { CatalogIdeatorIdea, CatalogProductSlot } from '../../agents/contracts';
import {
  CATALOG_IDEATOR_TYPE_SLUGS,
  getProductTypeFamily,
  pickAlternativeTypesForConcept,
} from './concept-diversity.util';
import {
  isDirectedBriefMode,
  resolveNamedItemsForBrief,
} from '../../requests/named-positions.util';

const SLOT_ARCHETYPES: string[][] = [
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

function archetypeIndex(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return hash % SLOT_ARCHETYPES.length;
}

function fillSlots(
  archetype: string[],
  desiredCount: number,
  mandatoryTypes: string[],
  conceptIndex: number,
  alternativeTypeGroups: string[][] = [],
): CatalogProductSlot[] {
  const allowed = new Set(CATALOG_IDEATOR_TYPE_SLUGS);
  const seenFamilies = new Set<string>();
  const seenTypes = new Set<string>();
  const slots: CatalogProductSlot[] = [];

  const addType = (type: string, priority: 'must' | 'nice' = 'nice') => {
    if (!allowed.has(type) || seenTypes.has(type)) return;
    const family = getProductTypeFamily(type);
    if (seenFamilies.has(family)) return;
    slots.push({ type, priority });
    seenTypes.add(type);
    seenFamilies.add(family);
  };

  for (const type of mandatoryTypes) {
    addType(type, 'must');
  }

  const alt = pickAlternativeTypesForConcept(alternativeTypeGroups, conceptIndex);
  for (const type of alt) {
    if (slots.length >= desiredCount) break;
    addType(type, 'must');
  }

  const arch = archetype.length ? archetype : SLOT_ARCHETYPES[0];
  for (const type of arch) {
    if (slots.length >= desiredCount) break;
    addType(type);
  }

  const extras = ['bottle', 'mug', 'pen', 'notebook', 'powerbank', 'shopper', 'thermos'];
  for (const type of extras) {
    if (slots.length >= desiredCount) break;
    addType(type);
  }

  return slots.slice(0, desiredCount);
}

/** Детерминированные идеи без LLM — гарантия непустого ideatorOutput */
export function generateLocalCatalogIdeas(input: {
  userPrompt: string;
  category?: string | null;
  desiredItemCount: number;
  mandatoryTypes: string[];
  namedTypes?: string[];
  namedItems?: string[];
  directedMode?: boolean;
  alternativeTypeGroups?: string[][];
  count?: number;
}): CatalogIdeatorIdea[] {
  const named = resolveNamedItemsForBrief(input.userPrompt, []);
  const directedMode = input.directedMode ?? isDirectedBriefMode(input.namedTypes ?? named.namedTypes);
  const namedTypes = input.namedTypes?.length ? input.namedTypes : named.namedTypes;
  const namedItems = input.namedItems?.length ? input.namedItems : named.namedItems;

  if (directedMode && namedTypes.length > 0) {
    const target = Math.max(3, Math.min(input.count ?? 8, 12));
    const briefSnippet = input.userPrompt.slice(0, 80);
    const slots: CatalogProductSlot[] = namedTypes.slice(0, input.desiredItemCount).map((type, i) => ({
      type,
      priority: 'must' as const,
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
      boldness: 0,
    }));
  }
  const target = Math.max(3, Math.min(input.count ?? 8, 12));
  const ideas: CatalogIdeatorIdea[] = [];
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
      // Распределение смелости: 1-я идея стандартная, каждая 4-я — смелая, остальные интересные.
      boldness: i === 0 ? 0 : i % 4 === 3 ? 2 : 1,
    });
    if (altGroups.length) void altGroups;
  }

  return ideas;
}

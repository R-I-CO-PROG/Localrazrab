import {
  detectMandatoryConceptTypesFromBrief,
  stripPastGiftsClause,
} from '../providers/llm/concept-diversity.util';
import { extractRequiredCategoriesFromBrief } from './brief-required-categories.util';
import { resolveNamedItemsForBrief } from './named-positions.util';

const REQUIRED_CATEGORY_TYPE_HINTS: Record<string, string[]> = {
  tech_accessories: ['powerbank', 'flash_drive', 'flash'],
  learning_materials: ['notebook', 'pen', 'diary'],
  eco_products: ['bottle', 'shopper'],
  premium_items: ['watch', 'diary'],
};

/**
 * Типы-поводы/бандлы: это НЕ конкретный товар, а тема набора. Не делаем их
 * обязательными в каждом наборе (иначе при единственном «welcome pack» в каталоге
 * кросс-концепт-уникальность не даёт собрать 5 наборов). Остаются доступными как бонус.
 */
const NON_MANDATORY_OCCASION_TYPES = new Set(['welcome_pack', 'welcome_box', 'gift_set']);

/** Обязательные типы + типы из requiredCategories брифа + именованные позиции */
export function resolveMandatoryTypesForBrief(
  rawBrief: string,
  uiAllowedItems: string[] = [],
): string[] {
  // «В прошлом дарили пледы» → плед НЕ обязательный (клиент их уже дарил). Вырезаем клаузу ДО всех
  // трёх извлекателей — иначе прошлые товары форсировались в набор через терминальный гейт.
  const brief = stripPastGiftsClause(rawBrief);
  const found = new Set(detectMandatoryConceptTypesFromBrief(brief));
  for (const req of extractRequiredCategoriesFromBrief(brief)) {
    for (const type of REQUIRED_CATEGORY_TYPE_HINTS[req.key] ?? []) {
      found.add(type);
    }
  }
  for (const type of resolveNamedItemsForBrief(brief, uiAllowedItems).namedTypes) {
    found.add(type);
  }
  for (const occasion of NON_MANDATORY_OCCASION_TYPES) found.delete(occasion);
  return [...found];
}

import { detectMandatoryConceptTypesFromBrief } from '../providers/llm/concept-diversity.util';
import { extractRequiredCategoriesFromBrief } from './brief-required-categories.util';

const REQUIRED_CATEGORY_TYPE_HINTS: Record<string, string[]> = {
  tech_accessories: ['powerbank', 'flash_drive', 'flash'],
  learning_materials: ['notebook', 'pen', 'diary'],
  eco_products: ['bottle', 'shopper'],
  premium_items: ['watch', 'diary'],
};

/** Обязательные типы + типы из requiredCategories брифа */
export function resolveMandatoryTypesForBrief(brief: string): string[] {
  const found = new Set(detectMandatoryConceptTypesFromBrief(brief));
  for (const req of extractRequiredCategoriesFromBrief(brief)) {
    for (const type of REQUIRED_CATEGORY_TYPE_HINTS[req.key] ?? []) {
      found.add(type);
    }
  }
  return [...found];
}

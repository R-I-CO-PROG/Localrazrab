import { type BriefAllowedCategory, type BriefCategory, type BriefForbiddenOption } from './brief-options';
import { type BudgetScope } from './parse-money-amount.util';
import { extractBriefColorPalette, extractBriefColorsFromText, extractBriefForbiddenColorHints, briefPrefersWarmColors, briefAvoidsCoolColors, type BriefColorPalette } from './brief-color-palette.util';
import { extractRequiredCategoriesFromBrief, type RequiredCategoryRequirement } from './brief-required-categories.util';
export type { BriefColorPalette, RequiredCategoryRequirement };
export { extractBriefColorPalette, extractBriefColorsFromText, extractBriefForbiddenColorHints, briefPrefersWarmColors, briefAvoidsCoolColors, extractRequiredCategoriesFromBrief, };
export interface ParsedBriefResult {
    category?: BriefCategory;
    quantity?: number;
    setItemCount?: number;
    budgetMin?: number;
    budgetMax?: number;
    budgetScope?: BudgetScope;
    colors?: string[];
    allowedItems?: BriefAllowedCategory[];
    namedItems?: string[];
    forbiddenItems?: BriefForbiddenOption[];
    alternativeTypeGroups?: string[][];
    notes?: string;
    updatedFields: string[];
}
export declare function parseBriefLocally(userPrompt: string): ParsedBriefResult;
export declare function mergeParsedBrief(userPrompt: string, local: ParsedBriefResult, llm: Partial<ParsedBriefResult>): ParsedBriefResult;

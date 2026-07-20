import type { BudgetScope } from './parse-money-amount.util';
import type { BriefAllowedCategory, BriefCategory, BriefForbiddenOption } from './brief-options';
import { type ParsedBriefResult } from './parse-brief.util';
import { type RequiredCategoryRequirement } from './brief-required-categories.util';
export interface BriefParameterField<T> {
    value: T;
    source: 'local' | 'llm' | 'ui' | 'reconciled' | 'hybrid';
}
export interface BriefParameters {
    category?: BriefParameterField<BriefCategory>;
    quantity?: BriefParameterField<number>;
    setItemCount?: BriefParameterField<number>;
    budgetMin?: BriefParameterField<number>;
    budgetMax?: BriefParameterField<number>;
    budgetScope?: BriefParameterField<BudgetScope>;
    colors?: BriefParameterField<string[]>;
    allowedItems?: BriefParameterField<BriefAllowedCategory[]>;
    namedItems?: BriefParameterField<string[]>;
    forbiddenItems?: BriefParameterField<BriefForbiddenOption[]>;
    alternativeTypeGroups?: BriefParameterField<string[][]>;
    mandatoryTypes?: BriefParameterField<string[]>;
    mandatoryCategories?: BriefParameterField<RequiredCategoryRequirement[]>;
    directedMode?: BriefParameterField<boolean>;
    notes?: BriefParameterField<string>;
    warnings: string[];
    sources: Record<string, string>;
}
export declare function analyzeBrief(userPrompt: string, options?: {
    uiAllowedItems?: string[];
    uiForbiddenItems?: string[];
    llmPartial?: Partial<ParsedBriefResult>;
}): BriefParameters;

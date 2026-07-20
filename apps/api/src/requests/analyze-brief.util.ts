import type { BudgetScope } from './parse-money-amount.util';
import type { BriefAllowedCategory, BriefCategory, BriefForbiddenOption } from './brief-options';
import {
  parseBriefLocally,
  mergeParsedBrief,
  type ParsedBriefResult,
} from './parse-brief.util';
import {
  reconcileBriefConstraints,
  type ReconciledBriefConstraints,
} from './brief-constraints.util';
import {
  resolveNamedItemsForBrief,
  splitAllowedItemsMixed,
} from './named-positions.util';
import { normalizeBriefAllowedBuckets } from '../catalog/brief-category-buckets.util';
import { resolveMandatoryTypesForBrief } from './mandatory-types.util';
import {
  extractRequiredCategoriesFromBrief,
  type RequiredCategoryRequirement,
} from './brief-required-categories.util';

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
  /** Категории-бакеты UI «можно предлагать» */
  allowedItems?: BriefParameterField<BriefAllowedCategory[]>;
  /** Именованные позиции из брифа / UI (Декантер, Штоф…) */
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

function fieldSource(
  key: string,
  local: ParsedBriefResult,
  llm?: Partial<ParsedBriefResult>,
): 'local' | 'llm' | 'hybrid' {
  const fromLocal = local.updatedFields.includes(key);
  const fromLlm = llm ? Object.prototype.hasOwnProperty.call(llm, key) : false;
  if (fromLocal && fromLlm) return 'hybrid';
  if (fromLlm) return 'llm';
  return 'local';
}

function buildWarnings(
  text: string,
  reconciled: ReconciledBriefConstraints,
  namedItems: string[],
  namedTypes: string[],
  mandatoryTypes: string[],
): string[] {
  const warnings: string[] = [];

  if (namedItems.length > 0 && namedTypes.length < namedItems.length) {
    const unresolved = namedItems.filter(
      (label) => !resolveNamedItemsForBrief('', [label]).namedTypes.length,
    );
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

/** Гибрид rules+LLM: локальный парсер + опциональный LLM-слой */
export function analyzeBrief(
  userPrompt: string,
  options: {
    uiAllowedItems?: string[];
    uiForbiddenItems?: string[];
    llmPartial?: Partial<ParsedBriefResult>;
  } = {},
): BriefParameters {
  const text = userPrompt.trim();
  const local = parseBriefLocally(text);
  const merged = options.llmPartial
    ? mergeParsedBrief(text, local, options.llmPartial)
    : local;

  const uiSplit = splitAllowedItemsMixed(options.uiAllowedItems ?? []);
  const categoryBuckets = [
    ...new Set([...(merged.allowedItems ?? []), ...uiSplit.categories]),
  ] as BriefAllowedCategory[];

  const named = resolveNamedItemsForBrief(text, [
    ...(merged.namedItems ?? []),
    ...uiSplit.namedItems,
  ]);

  const reconciled = reconcileBriefConstraints(
    text,
    categoryBuckets,
    [...new Set([...(merged.forbiddenItems ?? []), ...(options.uiForbiddenItems ?? [])])],
    merged.budgetMax,
  );

  const mandatoryTypes = [
    ...new Set([
      ...resolveMandatoryTypesForBrief(text, options.uiAllowedItems ?? []),
      ...named.namedTypes,
    ]),
  ];

  const directedMode = named.namedTypes.length > 0;
  const warnings = [
    ...buildWarnings(text, reconciled, named.namedItems, named.namedTypes, mandatoryTypes),
    ...(reconciled.warnings ?? []),
  ];

  const sources: Record<string, string> = {};
  const track = (key: string, source: string) => {
    sources[key] = source;
  };

  const result: BriefParameters = { warnings, sources };

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
        ...normalizeBriefAllowedBuckets(categoryBuckets),
        ...normalizeBriefAllowedBuckets(reconciled.allowedItems),
      ]),
    ] as BriefAllowedCategory[],
    source: uiSplit.categories.length ? 'ui' : 'reconciled',
  };
  track('allowedItems', result.allowedItems.source);

  if (named.namedItems.length) {
    result.namedItems = { value: named.namedItems, source: named.namedItems.some((n) => uiSplit.namedItems.includes(n)) ? 'hybrid' : 'local' };
    track('namedItems', result.namedItems.source);
  }

  if (reconciled.forbiddenItems.length) {
    result.forbiddenItems = {
      value: reconciled.forbiddenItems as BriefForbiddenOption[],
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

  const mandatoryCategories = extractRequiredCategoriesFromBrief(text);
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

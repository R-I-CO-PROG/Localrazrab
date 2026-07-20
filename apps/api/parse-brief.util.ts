import { normalizeBriefAllowedBuckets } from '../catalog/brief-category-buckets.util';
import {
  BRIEF_ALLOWED_CATEGORIES,
  BRIEF_CATEGORIES,
  BRIEF_FORBIDDEN_OPTIONS,
  type BriefAllowedCategory,
  type BriefCategory,
  type BriefForbiddenOption,
} from './brief-options';
import { reconcileBriefConstraints, briefRequestsClothing } from './brief-constraints.util';
import { parseDesiredItemCount, parseItemCountBounds } from '../providers/llm/parse-desired-count';
import {
  detectAlternativeTypeGroupsFromBrief,
} from '../providers/llm/concept-diversity.util';
import { LIMITS } from '../common/sanitize-request-integers';
import {
  inferBudgetScope,
  parseRussianMoneyAmount,
  type BudgetScope,
} from './parse-money-amount.util';
import {
  extractBriefColorPalette,
  extractBriefColorsFromText,
  extractBriefForbiddenColorHints,
  briefPrefersWarmColors,
  briefAvoidsCoolColors,
  type BriefColorPalette,
} from './brief-color-palette.util';
import {
  extractRequiredCategoriesFromBrief,
  type RequiredCategoryRequirement,
} from './brief-required-categories.util';
import { normalizeHex } from './brief-color-hex.util';

export type { BriefColorPalette, RequiredCategoryRequirement };
export {
  extractBriefColorPalette,
  extractBriefColorsFromText,
  extractBriefForbiddenColorHints,
  briefPrefersWarmColors,
  briefAvoidsCoolColors,
  extractRequiredCategoriesFromBrief,
};

export interface ParsedBriefResult {
  category?: BriefCategory;
  quantity?: number;
  setItemCount?: number;
  budgetMin?: number;
  budgetMax?: number;
  budgetScope?: BudgetScope;
  colors?: string[];
  allowedItems?: BriefAllowedCategory[];
  forbiddenItems?: BriefForbiddenOption[];
  /** Группы «или»: в набор — ровно один тип из каждой группы */
  alternativeTypeGroups?: string[][];
  notes?: string;
  updatedFields: string[];
}


function parseQuantity(text: string): number | null {
  const patterns = [
    /тираж[:\s]*(\d[\d\s]*)/i,
    /(\d[\d\s]*)\s*(?:человек|сотрудник|участник|персон|employees|people)/i,
    /(?:на|для)\s+(\d[\d\s]*)\s*(?:чел|человек|сотрудник|участник)/i,
    /(\d[\d\s]*)\s*(?:шт\.?|штук|единиц|копий|exemplars)/i,
    /заказ\s+(?:на\s+)?(\d[\d\s]*)/i,
    /(\d[\d\s]*)\s*(?:подарк|набор)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const n = parseInt(match[1].replace(/\s/g, ''), 10);
      if (n >= 1 && n <= 1_000_000) return n;
    }
  }
  return null;
}

function parseBudget(text: string): { min?: number; max?: number; scope?: BudgetScope } {
  const range =
    text.match(/(?:бюджет|budget)[^\d]{0,20}(\d[\d\s]*)\s*[-–—]\s*(\d[\d\s]*)/i) ??
    text.match(/(?:от)\s*(\d[\d\s]*)\s*(?:до|–|-)\s*(\d[\d\s]*)\s*(?:₽|руб)/i) ??
    text.match(/(\d[\d\s]*)\s*[-–—]\s*(\d[\d\s]*)\s*(?:₽|руб)/i);
  if (range) {
    const min = parseInt(range[1].replace(/\s/g, ''), 10);
    const max = parseInt(range[2].replace(/\s/g, ''), 10);
    if (min > 0 && max >= min) {
      return { min, max, scope: inferBudgetScope(text, max) };
    }
  }

  const budgetLead = text.match(/(?:бюджет|budget)\s*[:\-–—]?\s*([^.!\n]{0,60})/i);
  if (budgetLead) {
    const amount = parseRussianMoneyAmount(budgetLead[1]);
    if (amount != null && amount >= LIMITS.budget.min) {
      const scope = inferBudgetScope(text, amount);
      if (scope === 'per_set') {
        return {
          min: Math.max(LIMITS.budget.min, Math.round(amount * 0.6)),
          max: amount,
          scope,
        };
      }
      return {
        min: Math.max(LIMITS.budget.min, Math.round(amount * 0.85)),
        max: amount,
        scope,
      };
    }
  }

  const upTo = text.match(/(?:до|не\s+более)\s*([^.!\n]{0,40})/i);
  if (upTo) {
    const amount = parseRussianMoneyAmount(upTo[1]);
    if (amount != null && amount >= LIMITS.budget.min) {
      const scope = inferBudgetScope(text, amount);
      return {
        min: Math.max(LIMITS.budget.min, Math.round(amount * 0.2)),
        max: amount,
        scope,
      };
    }
  }

  const perUnit = text.match(/(\d[\d\s]*)\s*(?:₽|руб)\s*(?:\/|на)\s*(?:чел|единиц|шт)/i);
  if (perUnit) {
    const unit = parseInt(perUnit[1].replace(/\s/g, ''), 10);
    if (unit > 0) {
      return {
        min: Math.max(LIMITS.budget.min, Math.round(unit * 0.7)),
        max: Math.round(unit * 1.3),
        scope: 'per_set',
      };
    }
  }

  // Одиночное значение: «бюджет 5000 рублей», «бюджет 2000₽», «2000 руб на набор»
  const single =
    text.match(/(?:бюджет|budget)[^\d]{0,20}(\d[\d\s]*)\s*(?:₽|руб|rub)/i) ??
    text.match(/(\d[\d\s]*)\s*(?:₽|руб)\s*(?:на\s+набор|per\s+set)/i) ??
    text.match(/(\d[\d\s]*)\s*(?:₽|руб(?:л\w*)?)\s*(?:[.,]|$)/i);
  if (single) {
    const val = parseInt(single[1].replace(/\s/g, ''), 10);
    if (val >= 100 && val <= 50000) {
      return {
        min: Math.max(100, Math.round(val * 0.6)),
        max: val,
        scope: inferBudgetScope(text, val),
      };
    }
  }

  return {};
}

function parseCategory(text: string): BriefCategory | null {
  const t = text.toLowerCase();
  if (/welcome|велком|онбординг|new hire/i.test(t)) return 'Welcome Pack';
  if (/event|ивент|мероприят|конференц|форум|выставк/i.test(t)) return 'Event Kit';
  if (/мерч|merch|streetwear|скейт|фанат/i.test(t)) return 'Мерч';
  if (/корпоратив|подарк\s+клиент|b2b|партнер/i.test(t)) return 'Корпоративные подарки';
  return null;
}


function parseAllowedCategories(text: string): BriefAllowedCategory[] | null {
  const lower = text.toLowerCase();
  const onlyMatch = lower.match(/(?:только|исключительно|нужн\w*\s+только)\s+([^.!\n]{3,80})/i);
  const segment = onlyMatch?.[1] ?? lower;

  const picked: string[] = [];
  const rules: Array<{ cat: string; keys: string[] }> = [
    { cat: 'Текстиль', keys: ['текстил', 'одежд', 'футбол', 'худи', 'кепк', 'панам', 'мерч', 'дождевик', 'ветровк'] },
    { cat: 'Электроника', keys: ['электрон', 'powerbank', 'пауэр', 'флешк', 'usb', 'tech', 'it', 'гаджет', 'зарядк', 'колонк', 'наушник'] },
    { cat: 'Термосы и бутылки', keys: ['термос', 'бутыл', 'термокруж'] },
    { cat: 'Кружки', keys: ['круж', 'стакан', 'чашк', 'чайн'] },
    { cat: 'Ежедневники и блокноты', keys: ['ежедневник', 'блокнот', 'записн'] },
    { cat: 'Ручки', keys: ['ручк', 'pen '] },
    { cat: 'Сумки и рюкзаки', keys: ['сумк', 'рюкзак', 'шоппер', 'тоут'] },
    { cat: 'Зонты', keys: ['зонт'] },
    { cat: 'Часы', keys: ['часы', 'watch'] },
    { cat: 'Офис и канцелярия', keys: ['канцеляр', 'офис', 'папк', 'визитниц'] },
    { cat: 'Отдых и спорт', keys: ['спорт', 'фитнес', 'йог', 'outdoor'] },
    { cat: 'Подарочные наборы', keys: ['подароч', 'gift box', 'welcome box'] },
    { cat: 'Сувениры и награды', keys: ['сувенир', 'наград', 'статуэт'] },
    { cat: 'Посуда', keys: ['посуд'] },
    { cat: 'Канцелярия', keys: ['канцеляри'] },
    { cat: 'Эко', keys: ['эко', 'eco', 'переработ'] },
  ];

  for (const rule of rules) {
    if (rule.keys.some((k) => segment.includes(k))) picked.push(rule.cat);
  }

  if (picked.length === 0) {
    if (/it|айти|разработчик|программист|tech/i.test(lower)) {
      return normalizeBriefAllowedBuckets([
        'Электроника',
        'Офис и канцелярия',
        'Термосы и бутылки',
      ]);
    }
    if (/кофе|coffee|бариста/i.test(lower)) {
      return normalizeBriefAllowedBuckets(['Кружки', 'Термосы и бутылки']);
    }
    if (/vip|премиум|premium|luxury/i.test(lower)) {
      return normalizeBriefAllowedBuckets([
        'Термосы и бутылки',
        'Ежедневники и блокноты',
        'Сумки и рюкзаки',
      ]);
    }
    if (/банк|финанс|юрид/i.test(lower)) {
      return normalizeBriefAllowedBuckets([
        'Ежедневники и блокноты',
        'Ручки',
        'Офис и канцелярия',
      ]);
    }
    return null;
  }

  return normalizeBriefAllowedBuckets([...new Set(picked)]);
}

function parseForbidden(text: string): BriefForbiddenOption[] {
  const lower = text.toLowerCase();
  const found = new Set<BriefForbiddenOption>();

  if (/без\s+алкогол|не\s+алкогол|no\s+alcohol/i.test(lower)) found.add('Алкоголь');
  if (/без\s+еды|не\s+еда|no\s+food|без\s+продуктов/i.test(lower)) found.add('Еда');
  if (/без\s+одежд|не\s+одежд|no\s+clothing|без\s+футбол/i.test(lower)) found.add('Одежда');

  if (/алкогол|вино|шампан/i.test(lower) && /без|не\s+нужн|исключ/i.test(lower)) {
    found.add('Алкоголь');
  }

  return [...found].filter((f) => BRIEF_FORBIDDEN_OPTIONS.includes(f));
}

function parseSetItemCount(text: string): number | null {
  const bounds = parseItemCountBounds(text);
  if (bounds) return Math.round((bounds.min + bounds.max) / 2);

  const fromBrief = parseDesiredItemCount(text);
  if (fromBrief) return fromBrief;

  const patterns = [
    /(\d+)\s*(?:товар\w*|позици\w*|предмет\w*|sku|sku\s*в\s*набор)/i,
    /набор\s*(?:из|на)\s*(\d+)/i,
    /(\d+)\s*(?:разн\w*|вид\w*)\s*(?:товар|позици)/i,
    /(\d+)\s+в\s+набор/i,
    /в\s+набор[е]?\s*(\d+)/i,
    /(?:товар\w*|позици\w*|предмет\w*)\s+в\s+набор[е]?\s*[:\-]?\s*(\d+)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n >= 1 && n <= 8) return n;
    }
  }
  return null;
}

function clampBudget(min: number, max: number): { budgetMin: number; budgetMax: number } {
  const lo = Math.max(LIMITS.budget.min, Math.min(min, LIMITS.budget.max));
  const hi = Math.max(lo, Math.min(max, LIMITS.budget.max));
  return { budgetMin: lo, budgetMax: hi };
}

function finalizeParsedBrief(text: string, result: ParsedBriefResult): ParsedBriefResult {
  const reconciled = reconcileBriefConstraints(
    text,
    result.allowedItems ?? [],
    result.forbiddenItems ?? [],
  );

  result.forbiddenItems = reconciled.forbiddenItems as BriefForbiddenOption[];

  if (reconciled.allowedItems.length) {
    const mergedAllowed = [...new Set([...(result.allowedItems ?? []), ...reconciled.allowedItems])];
    result.allowedItems = mergedAllowed.filter((c) =>
      BRIEF_ALLOWED_CATEGORIES.includes(c as BriefAllowedCategory),
    ) as BriefAllowedCategory[];
  }

  if (briefRequestsClothing(text)) {
    if (!result.updatedFields.includes('forbiddenItems')) {
      result.updatedFields.push('forbiddenItems');
    }
    if (result.allowedItems?.length && !result.updatedFields.includes('allowedItems')) {
      result.updatedFields.push('allowedItems');
    }
  }

  return result;
}

export function parseBriefLocally(userPrompt: string): ParsedBriefResult {
  const text = userPrompt.trim();
  const updatedFields: string[] = [];
  const result: ParsedBriefResult = { updatedFields };

  if (text.length < 8) return result;

  const category = parseCategory(text);
  if (category && BRIEF_CATEGORIES.includes(category)) {
    result.category = category;
    updatedFields.push('category');
  }

  const quantity = parseQuantity(text);
  if (quantity) {
    result.quantity = quantity;
    updatedFields.push('quantity');
  }

  const budget = parseBudget(text);
  if (budget.min || budget.max) {
    const min = budget.min ?? budget.max!;
    const max = budget.max ?? budget.min!;
    const clamped = clampBudget(min, max);
    result.budgetMin = clamped.budgetMin;
    result.budgetMax = clamped.budgetMax;
    result.budgetScope = budget.scope ?? inferBudgetScope(text, max);
    updatedFields.push('budgetMin', 'budgetMax');
  }

  const palette = extractBriefColorPalette(text);
  if (palette.allowedColors.length > 0) {
    result.colors = palette.allowedColors;
    updatedFields.push('colors');
  }

  const allowed = parseAllowedCategories(text);
  if (allowed && allowed.length > 0) {
    result.allowedItems = allowed;
    updatedFields.push('allowedItems');
  }

  const forbidden = parseForbidden(text);
  if (forbidden.length > 0) {
    result.forbiddenItems = forbidden;
    updatedFields.push('forbiddenItems');
  }

  const setItemCount = parseSetItemCount(text);
  if (setItemCount) {
    result.setItemCount = setItemCount;
    updatedFields.push('setItemCount');
  }

  const altGroups = detectAlternativeTypeGroupsFromBrief(text);
  if (altGroups.length > 0) {
    result.alternativeTypeGroups = altGroups;
    updatedFields.push('alternativeTypeGroups');
  }

  result.updatedFields = updatedFields;
  return finalizeParsedBrief(text, result);
}

export function mergeParsedBrief(
  userPrompt: string,
  local: ParsedBriefResult,
  llm: Partial<ParsedBriefResult>,
): ParsedBriefResult {
  const updatedFields = new Set<string>(local.updatedFields);
  const merged: ParsedBriefResult = { ...local, updatedFields: [] };
  const localHas = (field: string) => local.updatedFields.includes(field);

  if (llm.category && BRIEF_CATEGORIES.includes(llm.category as BriefCategory)) {
    merged.category = llm.category as BriefCategory;
    updatedFields.add('category');
  }

  // Тираж — только если локальный парсер нашёл число в тексте (LLM копирует пример «300»)
  if (!localHas('quantity')) {
    updatedFields.delete('quantity');
    delete merged.quantity;
  }

  // Бюджет — локальный парсер точнее для «бюджет 5000 рублей»
  if ((llm.budgetMin || llm.budgetMax) && !localHas('budgetMin') && !localHas('budgetMax')) {
    const min = llm.budgetMin ?? llm.budgetMax!;
    const max = llm.budgetMax ?? llm.budgetMin!;
    const clamped = clampBudget(min, max);
    merged.budgetMin = clamped.budgetMin;
    merged.budgetMax = clamped.budgetMax;
    merged.budgetScope =
      llm.budgetScope ?? local.budgetScope ?? inferBudgetScope(userPrompt.trim(), max);
    updatedFields.add('budgetMin');
    updatedFields.add('budgetMax');
  }

  if (llm.colors?.length) {
    const llmColors = llm.colors
      .map((c) => normalizeHex(c) ?? c.toUpperCase())
      .filter(Boolean);
    if (!localHas('colors')) {
      merged.colors = llmColors.slice(0, 8);
      updatedFields.add('colors');
    }
  }

  if (llm.allowedItems?.length) {
    const llmValid = llm.allowedItems.filter(
      (c) =>
        BRIEF_ALLOWED_CATEGORIES.includes(c as BriefAllowedCategory) ||
        normalizeBriefAllowedBuckets([c]).length > 0,
    );
    const combined = [...new Set([...(local.allowedItems ?? []), ...llmValid])];
    merged.allowedItems = normalizeBriefAllowedBuckets(combined);
    if (merged.allowedItems.length) updatedFields.add('allowedItems');
  }

  // Запрещённые категории — только явные из текста, не из примера LLM
  if (!localHas('forbiddenItems')) {
    updatedFields.delete('forbiddenItems');
    delete merged.forbiddenItems;
  }

  if (llm.setItemCount && !localHas('setItemCount')) {
    merged.setItemCount = llm.setItemCount;
    updatedFields.add('setItemCount');
  }

  if (llm.alternativeTypeGroups?.length) {
    const localGroups = local.alternativeTypeGroups ?? [];
    const llmGroups = llm.alternativeTypeGroups.filter((g) => g.length >= 2);
    const mergedGroups = [...localGroups];
    for (const group of llmGroups) {
      const key = [...group].sort().join('|');
      if (!mergedGroups.some((g) => [...g].sort().join('|') === key)) {
        mergedGroups.push(group);
      }
    }
    if (mergedGroups.length) {
      merged.alternativeTypeGroups = mergedGroups;
      updatedFields.add('alternativeTypeGroups');
    }
  } else if (local.alternativeTypeGroups?.length) {
    merged.alternativeTypeGroups = local.alternativeTypeGroups;
  }

  if (llm.notes?.trim()) {
    merged.notes = llm.notes.trim().slice(0, 500);
    updatedFields.add('notes');
  }

  merged.updatedFields = [...updatedFields];
  return finalizeParsedBrief(userPrompt.trim(), merged);
}

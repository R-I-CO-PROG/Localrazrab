import {
  BUCKET_SOFT_KEYWORDS,
  normalizeBriefAllowedBuckets,
  type BriefAllowedBucket,
} from '../../catalog/brief-category-buckets.util';

export interface ProjectBriefProfile {
  goal: string | null;
  audience: string | null;
  occasion: string | null;
  brandTone: string | null;
  emotions: string[];
  industry: string | null;
  seasonality: string | null;
  budgetSignal: string | null;
  mustHave: string[];
  forbidden: string[];
  preferredCategories: string[];
  avoidedCategories: string[];
  colorPreferences: string[];
  communicationStyle: string | null;
  positioning: 'practical' | 'premium' | 'wow' | 'balanced' | null;
  usageScenario: string | null;
  projectCategory: string | null;
  briefSummary: string;
}

function normalizeText(text: unknown): string {
  return String(text ?? '').toLowerCase().replace(/ё/g, 'е').trim();
}

function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const p of patterns) {
    const m = text.match(p);
    if (m?.[1]) return m[1].trim().slice(0, 200);
  }
  return null;
}

function collectMatches(text: string, patterns: RegExp[]): string[] {
  const out: string[] = [];
  for (const p of patterns) {
    const m = text.match(p);
    if (m?.[1]) out.push(m[1].trim().slice(0, 120));
  }
  return [...new Set(out)];
}

const PREMIUM_HINTS = /премиум|vip|партн[её]р|люкс|элит|дорог|status|executive/i;
const PRACTICAL_HINTS = /офис|ежедневн|полезн|практич|utility|рабоч/i;
const WOW_HINTS = /вау|wow|необычн|запомина|имиджев|шоу/i;

const SUMMER_HINTS = /летн|outdoor|фестивал|пляж|open\s*air/i;
const WINTER_HINTS = /зимн|новогод|рождеств|ёлоч|елоч/i;

const AUDIENCE_PATTERNS = [
  /аудитория[:\s—-]+([^.!\n]{3,120})/i,
  /для\s+(сотрудник\w*|клиент\w*|партн[её]р\w*|участник\w*|гост\w*|it-?\w*|разработчик\w*)([^.!\n]{0,80})?/i,
  /целевая\s+аудитория[:\s—-]+([^.!\n]{3,120})/i,
];

const OCCASION_PATTERNS = [
  /(?:повод|событие|мероприятие)[:\s—-]+([^.!\n]{3,120})/i,
  /(конференц\w*|выставк\w*|форум\w*|ивент\w*|фестивал\w*|корпоратив\w*|онбординг\w*|welcome\s*pack)/i,
];

const GOAL_PATTERNS = [
  /цель[:\s—-]+([^.!\n]{3,160})/i,
  /нужно\s+([^.!\n]{8,160})/i,
  /задача[:\s—-]+([^.!\n]{3,160})/i,
];

const INDUSTRY_PATTERNS = [
  /(?:отрасль|индустрия|сфера)[:\s—-]+([^.!\n]{3,80})/i,
  /(it-компани\w*|финтех\w*|банк\w*|ритейл\w*|логистик\w*|медицин\w*|образован\w*)/i,
];

const USAGE_PATTERNS = [
  /сценарий[:\s—-]+([^.!\n]{3,120})/i,
  /(офис\w*|удал[её]н\w*|outdoor\w*|мероприяти\w*|конференц\w*|поездк\w*|путешеств\w*)/i,
];

/** Мягкие сигналы категории проекта → типы мерча */
const PROJECT_CATEGORY_SOFT_TYPES: Record<string, string[]> = {
  'welcome pack': ['notebook', 'mug', 'pen', 'bag', 'bottle', 'tshirt'],
  'корпоративный мерч': ['tshirt', 'hoodie', 'bag', 'mug', 'pen'],
  'подарки клиентам': ['premium_box', 'bottle', 'notebook', 'umbrella'],
  'подарки партнёрам': ['premium_box', 'bottle', 'umbrella', 'powerbank'],
  'подарки партнерам': ['premium_box', 'bottle', 'umbrella', 'powerbank'],
  конференция: ['pen', 'notebook', 'bag', 'bottle', 'powerbank', 'usb'],
  выставка: ['bag', 'pen', 'notebook', 'badge'],
  'новый год': ['christmas_decor', 'mug', 'premium_box'],
  'hr-мероприятие': ['tshirt', 'bag', 'mug', 'badge'],
  'брендированный набор': ['bag', 'mug', 'pen', 'notebook'],
};

export function extractProjectBriefProfile(input: {
  userPrompt: string;
  projectCategory?: string | null;
  colors?: string[];
  allowedItems?: string[];
  forbiddenItems?: string[];
}): ProjectBriefProfile {
  const brief = String(input.userPrompt ?? '').trim();
  const norm = normalizeText(brief);
  const category = String(input.projectCategory ?? '').trim();

  let positioning: ProjectBriefProfile['positioning'] = 'balanced';
  if (PREMIUM_HINTS.test(brief)) positioning = 'premium';
  else if (PRACTICAL_HINTS.test(brief)) positioning = 'practical';
  else if (WOW_HINTS.test(brief)) positioning = 'wow';

  let seasonality: string | null = null;
  if (SUMMER_HINTS.test(norm)) seasonality = 'summer';
  else if (WINTER_HINTS.test(norm)) seasonality = 'winter';

  const budgetSignal =
    /бюджет|до\s+\d|не\s+дороже|эконом/i.test(brief) ? brief.match(/бюджет[^.!\n]{0,80}/i)?.[0] ?? 'budget mentioned' : null;

  const mustHave = collectMatches(brief, [
    /обязательно[:\s—-]+([^.!\n]{3,120})/gi,
    /must[\s-]?have[:\s—-]+([^.!\n]{3,120})/gi,
  ]);

  const forbiddenFromBrief = collectMatches(brief, [
    /нельзя[:\s—-]+([^.!\n]{3,120})/gi,
    /запрещ[а-я]+[:\s—-]+([^.!\n]{3,120})/gi,
    /без\s+([^.!\n]{3,80})/gi,
  ]);

  const summaryParts = [
    brief.slice(0, 400),
    category ? `Категория проекта: ${category}` : '',
    positioning !== 'balanced' ? `Позиционирование: ${positioning}` : '',
    seasonality ? `Сезонность: ${seasonality}` : '',
  ].filter(Boolean);

  return {
    goal: firstMatch(brief, GOAL_PATTERNS),
    audience: firstMatch(brief, AUDIENCE_PATTERNS),
    occasion: firstMatch(brief, OCCASION_PATTERNS),
    brandTone: /тон\s+бренд|tone\s+of\s+voice|фирменн\w+\s+стил/i.test(brief)
      ? brief.match(/тон[^.!\n]{0,100}/i)?.[0] ?? null
      : null,
    emotions: collectMatches(brief, [/эмоци\w+[:\s—-]+([^.!\n]{3,80})/gi]),
    industry: firstMatch(brief, INDUSTRY_PATTERNS),
    seasonality,
    budgetSignal,
    mustHave,
    forbidden: [...forbiddenFromBrief, ...(input.forbiddenItems ?? [])],
    preferredCategories: input.allowedItems ?? [],
    avoidedCategories: input.forbiddenItems ?? [],
    colorPreferences: input.colors ?? [],
    communicationStyle: /делов\w+|дружелюбн\w+|строг\w+|молодежн\w+/i.test(brief)
      ? brief.match(/(делов\w+|дружелюбн\w+|строг\w+|молодежн\w+)/i)?.[0] ?? null
      : null,
    positioning,
    usageScenario: firstMatch(brief, USAGE_PATTERNS),
    projectCategory: category || null,
    briefSummary: summaryParts.join(' · ').slice(0, 600),
  };
}

/** Мягкий буст типа товара под категорию проекта (не жёсткий фильтр) */
export function scoreProjectCategorySoftMatch(
  productType: string,
  projectCategory: string | null | undefined,
): number {
  if (!projectCategory) return 0;
  const key = normalizeText(projectCategory);
  let best = 0;
  for (const [cat, types] of Object.entries(PROJECT_CATEGORY_SOFT_TYPES)) {
    if (key.includes(cat) || cat.includes(key)) {
      if (types.includes(productType)) best = Math.max(best, 12);
      else best = Math.max(best, 2);
    }
  }
  return best;
}

export function scoreAllowedItemSoftMatch(
  productName: string,
  productDescription: string,
  allowedItems: string[],
): number {
  if (!allowedItems.length) return 0;
  const text = normalizeText(`${productName} ${productDescription}`);
  const buckets = normalizeBriefAllowedBuckets(allowedItems);
  let score = 0;

  for (const bucket of buckets) {
    const keywords = BUCKET_SOFT_KEYWORDS[bucket as BriefAllowedBucket] ?? [];
    for (const kw of keywords) {
      if (text.includes(kw)) score += 14;
    }
  }

  for (const item of allowedItems) {
    const token = normalizeText(item);
    if (!token || token.length < 3) continue;
    if (text.includes(token)) score += 10;
    else if (token.split(/\s+/).some((w) => w.length >= 4 && text.includes(w))) score += 5;
  }
  return score;
}

export function profileToLlmPayload(profile: ProjectBriefProfile) {
  return {
    briefSummary: profile.briefSummary,
    goal: profile.goal,
    audience: profile.audience,
    occasion: profile.occasion,
    brandTone: profile.brandTone,
    desiredEmotions: profile.emotions,
    industry: profile.industry,
    seasonality: profile.seasonality,
    budgetConstraints: profile.budgetSignal,
    mustHaveElements: profile.mustHave,
    prohibitions: profile.forbidden,
    preferredMerchTypes: profile.preferredCategories,
    avoidedMerchTypes: profile.avoidedCategories,
    colorPreferences: profile.colorPreferences,
    communicationStyle: profile.communicationStyle,
    positioning: profile.positioning,
    usageScenario: profile.usageScenario,
    projectCategorySoftSignal: profile.projectCategory,
  };
}

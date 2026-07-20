import {
  extractProjectBriefProfile,
  profileToLlmPayload,
  type ProjectBriefProfile,
} from '../providers/llm/project-brief-profile.util';

export interface AgentBriefContext {
  userQuery: string;
  category?: string;
  budgetMin?: number | null;
  budgetMax?: number | null;
  quantity?: number | null;
  colors?: string[];
  notes?: string | null;
  allowedItems?: string[];
  forbiddenItems?: string[];
  hasLogo?: boolean;
  includeCatalogConstraints?: boolean;
  projectProfile?: ProjectBriefProfile;
  /** Повод/аудитория набора из LLM-классификации намерения брифа (VIP, Новый год, Раздаточные
   *  материалы для ивентов, …) — тон/стиль для Ideator, НЕ фильтр категорий каталога. */
  occasion?: string | null;
  /** Материал ВСЕГО набора из LLM-классификации намерения брифа («полностью кожаный», «из дерева») —
   *  жёсткое требование к каждой позиции. Ideator должен учитывать это в productSlots.notes; реальный
   *  жёсткий фильтр пула кандидатов — в neuralSelector (requiredMaterial), это лишь доп. сигнал LLM. */
  requiredMaterial?: string | null;
}

/** Единый payload брифа для Ideator и Critic */
export function buildAgentBriefPayload(ctx: AgentBriefContext) {
  // ИСКЛЮЧЕНИЯ («не предлагать алкоголь») — обещание пользователю в ЛЮБОМ режиме, включая
  // креативный: LLM не должна придумывать набор с запрещённым предметом. Раньше при
  // includeCatalogConstraints=false (креатив) mustAvoid обнулялся, и запреты просто исчезали.
  // `themesToExplore` (allowedItems) — бакеты категорий КАТАЛОГА, для креатива не применимы.
  const profile =
    ctx.projectProfile ??
    extractProjectBriefProfile({
      userPrompt: ctx.userQuery,
      projectCategory: ctx.category,
      colors: ctx.colors,
      allowedItems: ctx.includeCatalogConstraints ? ctx.allowedItems : [],
      forbiddenItems: ctx.forbiddenItems,
    });

  const catalogConstraints = {
    themesToExplore:
      ctx.includeCatalogConstraints !== false && ctx.allowedItems?.length ? ctx.allowedItems : null,
    mustAvoid: ctx.forbiddenItems?.length ? ctx.forbiddenItems : null,
  };

  return {
    clientBrief: (!ctx.userQuery || String(ctx.userQuery).trim() === '' || String(ctx.userQuery).trim() === 'undefined') ? 'Бриф отсутствует (userQuery пуст или undefined)' : String(ctx.userQuery).trim(),
    briefSummary: profile.briefSummary,
    projectProfile: profileToLlmPayload(profile),
    category: ctx.category ?? null,
    categoryNote:
      'Project category is a SOFT signal only — do not treat catalog rawCategory as hard filter. ' +
      'Match products by name, description, tags, use case and brief fit.',
    budgetRubPerUnit:
      (typeof ctx.budgetMin === 'number' && !isNaN(ctx.budgetMin)) ||
      (typeof ctx.budgetMax === 'number' && !isNaN(ctx.budgetMax))
        ? { min: (typeof ctx.budgetMin === 'number' && !isNaN(ctx.budgetMin)) ? ctx.budgetMin : null, max: (typeof ctx.budgetMax === 'number' && !isNaN(ctx.budgetMax)) ? ctx.budgetMax : null }
        : { min: null, max: null },
    runQuantity: ctx.quantity ?? null,
    brandColors: ctx.colors ?? [],
    occasion: ctx.occasion ?? null,
    requiredMaterial: ctx.requiredMaterial ?? null,
    constraints: catalogConstraints,
    extraNotes: ctx.notes ?? null,
    hasLogo: Boolean(ctx.hasLogo),
    ideaRequirements: {
      explainBriefFit: true,
      explainProductRoles: true,
      cohesiveSetNotRandomPick: true,
      eachIdeaMustStateWhyProductsFit: true,
    },
  };
}

/** Компактная карточка идеи для Critic (меньше токенов) */
export function compactIdeaForCritic(idea: {
  title: string;
  hook?: string;
  description: string;
  styleTags?: string[];
  whyItFits?: string;
}) {
  return {
    title: idea.title,
    hook: idea.hook ?? '',
    description: idea.description,
    styleTags: idea.styleTags ?? [],
    whyItFits: idea.whyItFits ?? '',
  };
}

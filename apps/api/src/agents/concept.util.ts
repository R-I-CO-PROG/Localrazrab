import type {
  Concept,
  CriticOutput,
  CriticTopIdea,
  IdeatorIdea,
  IdeatorOutput,
} from './contracts';

const PRODUCT_RU: Record<string, string> = {
  pen: 'ручка',
  notebook: 'блокнот',
  mug: 'кружка',
  tshirt: 'футболка',
  bag: 'сумка',
  thermos: 'термос',
  hoodie: 'худи',
  bottle: 'бутылка',
  cap: 'кепка',
  powerbank: 'powerbank',
};

function formatItems(items: IdeatorIdea['items']): string {
  if (!items.length) return '';
  return items
    .map((i) => PRODUCT_RU[i.productType] ?? i.productType)
    .join(', ');
}

/** Связный текст концепции для карточки */
export function buildConceptNarrative(
  full: IdeatorIdea | undefined,
  top: CriticTopIdea,
): string {
  if (top.conceptSummary?.trim() && top.conceptSummary.length > 60) {
    return top.conceptSummary.trim();
  }
  if (full?.description?.trim() && full.description.length > 40) {
    const parts: string[] = [];
    if (full.hook?.trim()) parts.push(full.hook.trim());
    parts.push(full.description.trim());
    const products = formatItems(full.items);
    if (products) parts.push(`В набор входят: ${products}.`);
    if (full.whyItFits?.trim()) parts.push(full.whyItFits.trim());
    if (top.reasons?.length) parts.push(top.reasons[0]);
    return parts.join(' ');
  }
  if (top.reasons?.length >= 2) {
    return top.reasons.join(' ');
  }
  return top.reasons?.[0] ?? top.title;
}

export function buildConcepts(
  ideatorOutput: IdeatorOutput | null,
  criticOutput: CriticOutput | null,
  meta?: { usedFallback?: boolean; fallbackReason?: string },
): Array<Concept & { usedFallback?: boolean; fallbackReason?: string }> {
  if (!criticOutput?.topIdeas?.length) return [];

  const ideaByTitle = new Map(
    (ideatorOutput?.ideas ?? []).map((idea) => [idea.title, idea]),
  );

  return criticOutput.topIdeas.slice(0, 5).map((top) => {
    const full = ideaByTitle.get(top.title);
    const narrative = buildConceptNarrative(full, top);
    return {
      ...mergeConcept(full, top, narrative),
      usedFallback: meta?.usedFallback,
      fallbackReason: meta?.fallbackReason,
    };
  });
}

function mergeConcept(
  full: IdeatorIdea | undefined,
  top: CriticTopIdea,
  narrative: string,
): Concept {
  if (full) {
    return {
      title: full.title,
      narrative,
      description: full.description,
      items: full.items,
      styleTags: full.styleTags,
      colorPalette: full.colorPalette,
      whyItFits: full.whyItFits,
      score: top.score,
      reasons: top.reasons,
      risks: top.risks,
      suggestedEdits: top.suggestedEdits,
    };
  }
  return {
    title: top.title,
    narrative,
    description: narrative,
    items: [],
    styleTags: [],
    colorPalette: [],
    whyItFits: top.reasons[0] ?? '',
    score: top.score,
    reasons: top.reasons,
    risks: top.risks,
    suggestedEdits: top.suggestedEdits,
  };
}

function normalizeTitle(text: string): string {
  return text
    .trim()
    .replace(/[\u00A0\u200B\u200C\u200D\uFEFF]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[«»""„'']/g, '"')
    .replace(/[–—]/g, '-')
    .toLowerCase();
}

export function findConceptByTitle(concepts: Concept[], title: string): Concept | undefined {
  const norm = normalizeTitle(title);
  return (
    concepts.find((c) => c.title === title) ??
    concepts.find((c) => normalizeTitle(c.title) === norm)
  );
}

export function findIdeatorIdeaByTitle(
  ideatorOutput: IdeatorOutput | null,
  title: string,
): IdeatorIdea | undefined {
  if (!ideatorOutput?.ideas) return undefined;
  const norm = normalizeTitle(title);
  return (
    ideatorOutput.ideas.find((i) => i.title === title) ??
    ideatorOutput.ideas.find((i) => normalizeTitle(i.title) === norm)
  );
}

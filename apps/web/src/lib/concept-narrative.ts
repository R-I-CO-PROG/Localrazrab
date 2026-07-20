/** Сборка текста концепции из выхода Ideator/Critic (как в suvenir-portable) */
export interface ConceptParts {
  title: string;
  description?: string;
  whyItFits?: string;
  conceptSummary?: string;
  reasons?: string[];
  styleTags?: string[];
}

export function buildConceptNarrativeFromParts(
  idea: { description?: string; whyItFits?: string; styleTags?: string[] } | undefined,
  criticTop: { conceptSummary?: string; reasons?: string[] },
): string {
  const parts = [
    criticTop.conceptSummary,
    idea?.description,
    idea?.whyItFits,
    criticTop.reasons?.length ? criticTop.reasons.join('. ') : '',
    idea?.styleTags?.length ? `Стиль: ${idea.styleTags.join(', ')}` : '',
  ].filter(Boolean);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

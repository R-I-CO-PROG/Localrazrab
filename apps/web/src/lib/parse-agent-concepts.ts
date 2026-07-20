import type { AgentRun } from "@/lib/suvenir-types";
import type { AgentConcept } from "@/lib/agent-types";import { buildConceptNarrativeFromParts } from "@/lib/concept-narrative";

export function parseAgentConceptsFromRun(run: AgentRun | null | undefined): AgentConcept[] {
  if (!run) return [];
  if (run.conceptsOutput?.length) {
    return run.conceptsOutput.map((c) => ({
      title: c.title,
      narrative: c.narrative || c.description,
      description: c.description,
      score: c.score,
      styleTags: (c as AgentConcept).styleTags,
      items: (c as AgentConcept).items,
      colorPalette: (c as { colorPalette?: string[] }).colorPalette,
      previewImageUrl: (c as { previewImageUrl?: string }).previewImageUrl,
      previewProductImageUrls: (c as { previewProductImageUrls?: string[] }).previewProductImageUrls,
      productIds: (c as { productIds?: string[] }).productIds,
      catalogProducts: (c as AgentConcept).catalogProducts,
    }));
  }
  const critic = run.criticOutput as {
    topIdeas?: Array<{ title: string; score: number; conceptSummary?: string; reasons: string[] }>;
  } | null;
  const ideator = run.ideatorOutput as {
    ideas?: Array<{
      title: string;
      description: string;
      whyItFits: string;
      styleTags: string[];
      items?: Array<{ productType?: string; notes?: string }>;
      colorPalette?: string[];
    }>;
  } | null;
  if (!critic?.topIdeas?.length) return [];
  const byTitle = new Map((ideator?.ideas ?? []).map((i) => [i.title, i]));
  return critic.topIdeas.slice(0, 5).map((top) => {
    const full = byTitle.get(top.title);
    return {
      title: top.title,
      narrative: buildConceptNarrativeFromParts(full, top),
      description: full?.description ?? top.conceptSummary ?? top.title,
      score: top.score,
      styleTags: full?.styleTags,
      whyItFits: full?.whyItFits,
      items: full?.items,
      colorPalette: full?.colorPalette,
    };
  });
}

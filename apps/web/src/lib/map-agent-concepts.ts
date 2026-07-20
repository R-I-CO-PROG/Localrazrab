import { mapIdeatorItemsToConceptItems } from "@/lib/creative-schematic.util";
import type { AgentConcept } from "@/lib/agent-types";
import type { GeneratedConcept, ConceptRenderSession } from "@/lib/types";

export function mapAgentConceptsToGenerated(
  concepts: AgentConcept[],
  requestId: string,
  briefColors: string[] = [],
): { concepts: GeneratedConcept[]; sessions: Record<string, ConceptRenderSession> } {
  const ts = Date.now();
  const sessions: Record<string, ConceptRenderSession> = {};

  const generated = concepts.map((c, i) => {
    const id = `concept-${ts}-${i}`;
    sessions[id] = {
      requestId,
      projectId: requestId,
      chosenIdeaTitle: c.title,
    };
    return {
      id,
      name: c.title,
      description: (c.narrative || c.description).slice(0, 2000),
      items: mapIdeatorItemsToConceptItems(c.items, c.colorPalette, briefColors),
      totalCost: 0,
      tags: c.styleTags?.length ? c.styleTags : c.score != null ? [`Score ${c.score}`] : [],
      previewImageUrl: undefined,
    };
  });

  return { concepts: generated, sessions };
}

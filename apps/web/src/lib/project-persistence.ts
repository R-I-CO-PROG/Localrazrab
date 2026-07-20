import type { BriefFormValues } from "@/components/generation/generation-brief-form";
import type { AgentConcept } from "@/lib/agent-types";
import type { GeneratedConcept, GenerationMode, ProjectSummary } from "@/lib/types";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\u0400-\u04ff]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function suggestProjectTitle(brief: BriefFormValues, conceptTitle?: string | null): string {
  if (conceptTitle?.trim()) return conceptTitle.trim().slice(0, 80);
  const prompt = brief.userPrompt.trim();
  if (prompt.length >= 8) return prompt.slice(0, 80);
  return `${brief.category} · ${new Date().toLocaleDateString("ru-RU")}`;
}

export function agentConceptsToGenerated(
  concepts: AgentConcept[],
  projectId: string,
): GeneratedConcept[] {
  return concepts.map((c, i) => ({
    id: `${projectId}-${slugify(c.title) || `concept-${i}`}`,
    name: c.title,
    description: (c.narrative || c.description).slice(0, 500),
    items: [],
    totalCost: 0,
    tags: c.styleTags?.length ? c.styleTags : c.score != null ? [`Score ${c.score}`] : [],
  }));
}

export function buildProjectSummary(params: {
  id: string;
  title: string;
  brief: BriefFormValues;
  conceptsCount: number;
  status: ProjectSummary["status"];
  generationMode: GenerationMode;
  requestId?: string;
  selectedConceptTitle?: string;
  resultImageUrl?: string;
  briefExcerpt?: string;
  createdAt?: string;
}): ProjectSummary {
  const now = new Date().toISOString();
  return {
    id: params.id,
    title: params.title.trim().slice(0, 120),
    category: params.brief.category,
    budget: params.brief.budgetMax,
    quantity: params.brief.quantity,
    conceptsCount: params.conceptsCount,
    createdAt: params.createdAt ?? now,
    updatedAt: now,
    status: params.status,
    generationMode: params.generationMode,
    requestId: params.requestId ?? params.id,
    selectedConceptTitle: params.selectedConceptTitle,
    resultImageUrl: params.resultImageUrl,
    briefExcerpt: params.briefExcerpt ?? params.brief.userPrompt.trim().slice(0, 160),
  };
}

export function catalogConceptFromBrief(
  projectId: string,
  brief: BriefFormValues,
  productNames: string[],
): GeneratedConcept {
  return {
    id: `${projectId}-catalog`,
    name: suggestProjectTitle(brief),
    description: brief.userPrompt.trim().slice(0, 500),
    items: productNames.map((name) => ({ name, description: name, price: 0 })),
    totalCost: 0,
    tags: ["Каталог"],
  };
}

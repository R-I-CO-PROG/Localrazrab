import { Injectable, Logger } from '@nestjs/common';
import { OpenrouterAgentClient } from './openrouter-agent.client';
import { parseCriticOutput } from './json-repair.util';
import { SYSTEM_PROMPT_CRITIC_CATALOG } from './prompts';
import { CRITIC_TOP_N } from './agent.constants';
import { AgentBriefContext, buildAgentBriefPayload } from './brief-context.util';
import type { CatalogIdeatorIdea, CriticOutput, CriticTopIdea } from './contracts';
import type { AgentDebugTraceFn } from './agent-debug.types';
import { pickDiverseCatalogIdeas } from '../providers/llm/catalog-concept-diversity.util';

/** LLM иногда возвращает briefFitScore вне заявленной в промпте шкалы 0-100 (напр. 117) — обрезаем. */
function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

@Injectable()
export class CatalogCriticAgent {
  private readonly logger = new Logger(CatalogCriticAgent.name);

  constructor(private readonly openrouter: OpenrouterAgentClient) {}

  async pickTop5(
    ideas: CatalogIdeatorIdea[],
    brief: AgentBriefContext & {
      desiredItemCount: number;
      budgetPerSet: number | null;
      mandatoryTypes: string[];
    },
    trace?: AgentDebugTraceFn,
  ): Promise<CriticOutput> {
    if (!this.openrouter.isEnabled()) {
      throw new Error('OpenRouter отключён — задайте OPENROUTER_API_KEY');
    }

    if (ideas.length < CRITIC_TOP_N) {
      throw new Error(`CatalogCritic: мало идей от Ideator (${ideas.length})`);
    }

    const payload = {
      ...buildAgentBriefPayload(brief),
      mode: 'catalog',
      desired_item_count: brief.desiredItemCount,
      budget_per_set: brief.budgetPerSet,
      mandatory_types_from_brief: brief.mandatoryTypes,
      brandColors: brief.colors ?? [],
      colorRequirement:
        brief.colors?.length ?
          'Each set must work with brandColors — prefer apparel/headwear in those colors; note color in productSlots.notes when relevant.'
        : null,
      candidateCount: ideas.length,
      ideas: ideas.map((idea) => ({
        title: idea.title,
        composition: idea.composition,
        style: idea.style,
        themeAxis: idea.themeAxis,
        productSlots: idea.productSlots,
        whyItFits: idea.whyItFits,
      })),
      task: `Select exactly ${CRITIC_TOP_N} best gift sets for this client brief. ` +
        'Prioritize literal brief fit — what the client explicitly asked for.',
    };

    const content = await this.openrouter.chatJson({
      systemPrompt: SYSTEM_PROMPT_CRITIC_CATALOG,
      userMessage: JSON.stringify(payload),
      modelEnvKey: 'OPENROUTER_MODEL_CATALOG_CRITIC',
      maxTokensEnvKey: 'OPENROUTER_MAX_TOKENS_CATALOG_CRITIC',
      defaultMaxTokens: 3200,
      agentName: 'CatalogCriticAgent',
      trace,
    });

    const parsed = parseCriticOutput(content);
    const normalized = this.normalize(parsed, ideas, brief);

    if (normalized.topIdeas.length < CRITIC_TOP_N) {
      this.logger.warn(
        `CatalogCritic picked ${normalized.topIdeas.length}/${CRITIC_TOP_N} — supplementing`,
      );
      return this.supplementToFive(normalized, ideas, brief);
    }

    this.logger.log(`CatalogCritic OK: top ${CRITIC_TOP_N} from ${ideas.length} candidates`);
    return normalized;
  }

  private normalize(
    parsed: CriticOutput,
    ideas: CatalogIdeatorIdea[],
    brief: AgentBriefContext,
  ): CriticOutput {
    const byTitle = new Map(ideas.map((i) => [i.title, i]));
    const forbidden = (brief.forbiddenItems ?? []).map((s) => s.toLowerCase());

    const scored = (parsed.topIdeas ?? [])
      .filter((t) => byTitle.has(t.title))
      .filter((t) => !this.violatesForbidden(t, forbidden))
      .map((t) => {
        const full = byTitle.get(t.title)!;
        const fit = clampScore(Number(t.briefFitScore ?? t.score) || 80);
        return {
          ...t,
          briefFitScore: fit,
          score: fit,
          conceptSummary:
            t.conceptSummary?.trim() ||
            [full.composition, full.whyItFits].filter(Boolean).join(' ').slice(0, 500),
        };
      })
      .sort((a, b) => (b.briefFitScore ?? b.score) - (a.briefFitScore ?? a.score));

    const diverse = pickDiverseCatalogIdeas(scored, byTitle, CRITIC_TOP_N);

    const top = diverse
      .slice(0, CRITIC_TOP_N)
      .map((t, idx) => {
        const full = byTitle.get(t.title)!;
        const fit = clampScore(Number(t.briefFitScore ?? t.score) || 85 - idx * 2);
        return {
          title: t.title,
          score: fit,
          briefFitScore: fit,
          conceptSummary: (t.conceptSummary ?? full.composition).slice(0, 500),
          reasons: (t.reasons ?? []).slice(0, 4).length
            ? (t.reasons ?? []).slice(0, 4)
            : [full.whyItFits || 'Соответствует брифу клиента'],
          risks: (t.risks ?? []).slice(0, 3),
          suggestedEdits: (t.suggestedEdits ?? []).slice(0, 3),
        };
      });

    return { topIdeas: top };
  }

  private violatesForbidden(top: CriticTopIdea, forbidden: string[]): boolean {
    if (!forbidden.length) return false;
    const blob = `${top.title} ${top.conceptSummary ?? ''}`.toLowerCase();
    return forbidden.some((f) => f.length > 2 && blob.includes(f));
  }

  private supplementToFive(
    parsed: CriticOutput,
    ideas: CatalogIdeatorIdea[],
    brief: AgentBriefContext,
  ): CriticOutput {
    const picked = new Set(parsed.topIdeas.map((t) => t.title));
    const byTitle = new Map(ideas.map((i) => [i.title, i]));
    const ranked = ideas
      .filter((i) => !picked.has(i.title))
      .map((idea) => ({
        title: idea.title,
        score: 70,
        briefFitScore: 70,
        conceptSummary: [idea.composition, idea.whyItFits].filter(Boolean).join(' ').slice(0, 500),
        reasons: [idea.whyItFits || 'Резервный отбор из пула Ideator'],
        risks: [] as string[],
        suggestedEdits: [] as string[],
      }));

    const diverse = pickDiverseCatalogIdeas(ranked, byTitle, CRITIC_TOP_N - parsed.topIdeas.length);

    const top: CriticTopIdea[] = [...parsed.topIdeas];
    for (const item of diverse) {
      if (top.length >= CRITIC_TOP_N) break;
      top.push({
        title: item.title,
        score: item.score,
        briefFitScore: item.briefFitScore,
        conceptSummary: item.conceptSummary,
        reasons: item.reasons,
        risks: item.risks,
        suggestedEdits: item.suggestedEdits,
      });
    }

    return { topIdeas: top.slice(0, CRITIC_TOP_N) };
  }
}

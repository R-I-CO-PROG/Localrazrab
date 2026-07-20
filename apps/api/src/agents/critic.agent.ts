import { Injectable, Logger } from '@nestjs/common';
import { OpenrouterAgentClient } from './openrouter-agent.client';
import { parseCriticOutput } from './json-repair.util';
import { SYSTEM_PROMPT_CRITIC_CREATIVE } from './prompts';
import { CRITIC_TOP_N } from './agent.constants';
import {
  AgentBriefContext,
  buildAgentBriefPayload,
  compactIdeaForCritic,
} from './brief-context.util';
import { adjustedBriefFitScore, briefAllowsFuturism } from './brief-realism.util';
import type { CriticOutput, CriticTopIdea, IdeatorIdea } from './contracts';
import type { AgentDebugTraceFn } from './agent-debug.types';

@Injectable()
export class CriticAgent {
  private readonly logger = new Logger(CriticAgent.name);

  constructor(private readonly openrouter: OpenrouterAgentClient) {}

  async pickTop5(
    ideas: IdeatorIdea[],
    brief: AgentBriefContext,
    trace?: AgentDebugTraceFn,
  ): Promise<CriticOutput> {
    if (!this.openrouter.isEnabled()) {
      throw new Error('OpenRouter отключён — задайте OPENROUTER_API_KEY');
    }

    if (ideas.length < CRITIC_TOP_N) {
      throw new Error(`Critic: мало идей от Ideator (${ideas.length})`);
    }

    const payload = {
      ...buildAgentBriefPayload(brief),
      mode: 'creative',
      candidateCount: ideas.length,
      ideas: ideas.map(compactIdeaForCritic),
      task: briefAllowsFuturism(brief.userQuery)
        ? `Select exactly ${CRITIC_TOP_N} best ideas for this brief.`
        : `Select exactly ${CRITIC_TOP_N} best ideas. Prefer realistic real-world expansion of the brief subject; reject gimmick drones/gadgets/tubes unless they match the brief.`,
    };

    const content = await this.openrouter.chatJson({
      systemPrompt: SYSTEM_PROMPT_CRITIC_CREATIVE,
      userMessage: JSON.stringify(payload),
      modelEnvKey: 'OPENROUTER_MODEL_CRITIC',
      maxTokensEnvKey: 'OPENROUTER_MAX_TOKENS_CRITIC',
      defaultMaxTokens: 3200,
      agentName: 'CriticAgent',
      trace,
    });

    const parsed = parseCriticOutput(content);
    const normalized = this.normalize(parsed, ideas, brief);

    if (normalized.topIdeas.length < CRITIC_TOP_N) {
      this.logger.warn(
        `Critic picked ${normalized.topIdeas.length}/${CRITIC_TOP_N} — supplementing from Ideator pool`,
      );
      return this.supplementToFive(normalized, ideas, brief);
    }

    this.logger.log(`Critic OK: top ${CRITIC_TOP_N} from ${ideas.length} candidates`);
    return normalized;
  }

  private normalize(
    parsed: CriticOutput,
    ideas: IdeatorIdea[],
    brief: AgentBriefContext,
  ): CriticOutput {
    const byTitle = new Map(ideas.map((i) => [i.title, i]));
    const forbidden = (brief.forbiddenItems ?? []).map((s) => s.toLowerCase());

    const top = (parsed.topIdeas ?? [])
      .map((t) => {
        const full = byTitle.get(t.title);
        const blob = `${t.title} ${t.conceptSummary ?? ''} ${full?.description ?? ''} ${full?.hook ?? ''}`;
        const fit = adjustedBriefFitScore(
          Number(t.briefFitScore ?? t.score) || 0,
          blob,
          brief.userQuery,
        );
        return {
          ...t,
          briefFitScore: fit,
          score: fit,
        };
      })
      .filter((t) => byTitle.has(t.title))
      .filter((t) => !this.violatesForbidden(t, forbidden))
      .sort((a, b) => (b.briefFitScore ?? b.score) - (a.briefFitScore ?? a.score))
      .slice(0, CRITIC_TOP_N)
      .map((t, idx) => {
        const full = byTitle.get(t.title)!;
        return {
          title: t.title,
          score: Number(t.briefFitScore ?? t.score) || 85 - idx * 2,
          briefFitScore: Number(t.briefFitScore ?? t.score) || 85 - idx * 2,
          conceptSummary: (
            t.conceptSummary?.trim() ||
            [full.hook, full.description, full.whyItFits].filter(Boolean).join(' ')
          ).slice(0, 500),
          reasons: (t.reasons ?? []).slice(0, 4).length
            ? (t.reasons ?? []).slice(0, 4)
            : [full.whyItFits || 'Соответствует брифу клиента'],
          risks: (t.risks ?? []).slice(0, 3).filter((r) => !/каталог|наличи|sku|склад/i.test(r)),
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

  /** Если LLM не добрал 5 — добираем из пула Ideator по whyItFits */
  private supplementToFive(parsed: CriticOutput, ideas: IdeatorIdea[], brief: AgentBriefContext): CriticOutput {
    const picked = new Set(parsed.topIdeas.map((t) => t.title));
    const rest = ideas
      .filter((i) => !picked.has(i.title))
      .map((idea) => {
        const blob = `${idea.title} ${idea.description} ${idea.hook ?? ''}`;
        return {
          idea,
          score: adjustedBriefFitScore(70, blob, brief.userQuery),
        };
      })
      .sort((a, b) => b.score - a.score);

    const top: CriticTopIdea[] = [...parsed.topIdeas];

    for (const { idea, score } of rest) {
      if (top.length >= CRITIC_TOP_N) break;
      top.push({
        title: idea.title,
        score,
        briefFitScore: score,
        conceptSummary: [idea.hook, idea.description, idea.whyItFits].filter(Boolean).join(' ').slice(0, 500),
        reasons: [idea.whyItFits || 'Резервный отбор из пула Ideator'],
        risks: [],
        suggestedEdits: [],
      });
    }

    return { topIdeas: top.slice(0, CRITIC_TOP_N) };
  }
}

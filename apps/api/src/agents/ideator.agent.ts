import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenrouterAgentClient } from './openrouter-agent.client';
import { parseIdeatorOutput } from './json-repair.util';
import { SYSTEM_PROMPT_IDEATOR_CREATIVE, SYSTEM_PROMPT_IDEATOR_MORE } from './prompts';
import {
  CRITIC_TOP_N,
  IDEATOR_MAX_IDEAS,
  IDEATOR_MIN_IDEAS,
  IDEATOR_MIN_IDEAS_FAST,
  IDEATOR_MAX_ATTEMPTS_FAST,
  IDEATOR_SOFT_MIN_IDEAS,
  IDEATOR_TARGET_IDEAS,
  IDEATOR_TARGET_IDEAS_FAST,
} from './agent.constants';
import {
  AgentBriefContext,
  buildAgentBriefPayload,
} from './brief-context.util';
import { AGENT_BLACKLIST, IdeatorIdea, IdeatorOutput } from './contracts';
import { gimmickPenalty, briefAllowsFuturism } from './brief-realism.util';
import { mapProductRolesToItems } from '../generation/creative-merch-visual.util';
import type { AgentDebugTraceFn } from './agent-debug.types';
import { generateLocalCreativeIdeas } from '../providers/llm/creative-local-ideator.util';
import { withTimeout } from '../common/promise-timeout.util';

export type IdeatorResult = IdeatorOutput & { usedFallback: boolean; fallbackReason?: string };

@Injectable()
export class IdeatorAgent {
  private readonly logger = new Logger(IdeatorAgent.name);

  constructor(
    private readonly openrouter: OpenrouterAgentClient,
    private readonly config: ConfigService,
  ) {}

  private isFastPipeline(): boolean {
    return this.config.get<string>('CREATIVE_FAST_PIPELINE', 'true') !== 'false';
  }

  private ideatorTargets() {
    if (!this.isFastPipeline()) {
      return {
        target: IDEATOR_TARGET_IDEAS,
        min: IDEATOR_MIN_IDEAS,
        maxAttempts: 4,
      };
    }
    return {
      target: IDEATOR_TARGET_IDEAS_FAST,
      min: IDEATOR_MIN_IDEAS_FAST,
      maxAttempts: IDEATOR_MAX_ATTEMPTS_FAST,
    };
  }

  private ideatorTimeoutMs(): number {
    if (this.isFastPipeline()) {
      return Number(this.config.get('CREATIVE_IDEATOR_FAST_TIMEOUT_MS', 35_000)) || 35_000;
    }
    return Number(this.config.get('CREATIVE_IDEATOR_TIMEOUT_MS', 55_000)) || 55_000;
  }

  private ideatorMaxTokens(): number {
    if (this.isFastPipeline()) {
      return Number(this.config.get('OPENROUTER_MAX_TOKENS_IDEATOR_FAST', 4500)) || 4500;
    }
    return Number(this.config.get('OPENROUTER_MAX_TOKENS_IDEATOR', 6500)) || 6500;
  }

  async generateIdeas(
    input: AgentBriefContext & { trace?: AgentDebugTraceFn },
  ): Promise<IdeatorResult> {
    const { min } = this.ideatorTargets();

    if (!this.openrouter.isEnabled()) {
      this.logger.warn('OpenRouter disabled — using local creative ideator');
      return this.buildLocalResult(input, 'openrouter_disabled');
    }

    try {
      const llmResult = await withTimeout(
        this.generateIdeasFromLlm(input),
        this.ideatorTimeoutMs(),
        'IdeatorAgent',
      );
      if (llmResult.ideas.length >= min) {
        return { ...llmResult, usedFallback: false };
      }
      this.logger.warn(
        `Ideator: only ${llmResult.ideas.length}/${min} ideas from LLM — topping up locally`,
      );
      return this.mergeWithLocal(input, llmResult.ideas, 'insufficient_llm_ideas');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Ideator LLM failed (${msg}) — local fallback`);
      return this.buildLocalResult(input, msg.slice(0, 120));
    }
  }

  private buildLocalResult(input: AgentBriefContext, reason: string): IdeatorResult {
    const ideas = generateLocalCreativeIdeas({
      userPrompt: input.userQuery,
      colors: input.colors,
      count: IDEATOR_TARGET_IDEAS_FAST,
    });
    return { ideas, usedFallback: true, fallbackReason: reason };
  }

  private mergeWithLocal(
    input: AgentBriefContext,
    existing: IdeatorIdea[],
    reason: string,
  ): IdeatorResult {
    const local = generateLocalCreativeIdeas({
      userPrompt: input.userQuery,
      colors: input.colors,
      count: IDEATOR_TARGET_IDEAS_FAST,
    });
    const merged = this.mergeUniqueIdeas(existing, local);
    return {
      ideas: merged.slice(0, IDEATOR_MAX_IDEAS),
      usedFallback: existing.length === 0,
      fallbackReason: reason,
    };
  }

  private async generateIdeasFromLlm(
    input: AgentBriefContext & { trace?: AgentDebugTraceFn },
  ): Promise<IdeatorOutput> {
    const { target, min, maxAttempts } = this.ideatorTargets();
    const brief = buildAgentBriefPayload(input);
    let allIdeas: IdeatorIdea[] = [];
    let lastParseErr: Error | null = null;
    const maxTokens = this.ideatorMaxTokens();

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const isTopUp = allIdeas.length > 0 && allIdeas.length < min;
      const need = target - allIdeas.length;

      const userMessage = isTopUp
        ? JSON.stringify({
            ...brief,
            mode: 'creative',
            task: `Add exactly ${Math.min(need, 8)} NEW merch gift-set ideas with 3-5 physical products each. Do not repeat existing titles.`,
            existingTitles: allIdeas.map((i) => i.title),
            count: Math.min(need, 8),
          })
        : JSON.stringify({
            ...brief,
            mode: 'creative',
            task: `Generate exactly ${target} MAXIMALLY DIFFERENT corporate MERCH GIFT SET ideas (each a distinct angle/hero/mood — no near-duplicates). Each idea has items with productType + notes (specific design, creative twists welcome). VARY the item count per set: mix 3, 4 and 5-item sets — prefer 4-5, use 3 only for minimalist ones; it is wrong to make every set 3 items. Every item must fit the concept and brief. Industry from brief = audience/mood ONLY — do NOT propose street photos, fleets, or vehicles as the deliverable.`,
          });

      const content = await this.openrouter.chatJson({
        systemPrompt: isTopUp ? SYSTEM_PROMPT_IDEATOR_MORE : SYSTEM_PROMPT_IDEATOR_CREATIVE,
        userMessage,
        modelEnvKey: 'OPENROUTER_MODEL_IDEATOR',
        maxTokensEnvKey: this.isFastPipeline()
          ? 'OPENROUTER_MAX_TOKENS_IDEATOR_FAST'
          : 'OPENROUTER_MAX_TOKENS_IDEATOR',
        defaultMaxTokens: maxTokens,
        agentName: isTopUp ? 'IdeatorAgent(topup)' : 'IdeatorAgent',
        trace: input.trace,
      });

      try {
        const batch = this.normalize(parseIdeatorOutput(content), input);
        allIdeas = this.mergeUniqueIdeas(allIdeas, batch.ideas);
        this.logger.log(
          `Ideator batch ${attempt}: +${batch.ideas.length} → ${allIdeas.length} total`,
        );

        if (allIdeas.length >= min) {
          this.logger.log(`Ideator OK: ${allIdeas.length} concepts`);
          return { ideas: allIdeas.slice(0, IDEATOR_MAX_IDEAS) };
        }
      } catch (err) {
        lastParseErr = err instanceof Error ? err : new Error(String(err));
        this.logger.warn(`Ideator parse attempt ${attempt}: ${lastParseErr.message.slice(0, 140)}`);
      }
    }

    if (allIdeas.length >= min) {
      return { ideas: allIdeas.slice(0, IDEATOR_MAX_IDEAS) };
    }

    const softMin = Math.max(IDEATOR_SOFT_MIN_IDEAS, CRITIC_TOP_N);
    if (allIdeas.length >= softMin) {
      this.logger.warn(
        `Ideator soft OK: ${allIdeas.length}/${min} (достаточно для Critic)`,
      );
      return { ideas: allIdeas.slice(0, IDEATOR_MAX_IDEAS) };
    }

    if (allIdeas.length > 0) {
      return { ideas: allIdeas.slice(0, IDEATOR_MAX_IDEAS) };
    }

    throw (
      lastParseErr ??
      new Error(`Ideator: недостаточно идей (${allIdeas.length}/${min})`)
    );
  }

  private mergeUniqueIdeas(existing: IdeatorIdea[], incoming: IdeatorIdea[]): IdeatorIdea[] {
    const seen = new Set(existing.map((i) => this.normTitle(i.title)));
    const merged = [...existing];
    for (const idea of incoming) {
      const key = this.normTitle(idea.title);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(idea);
    }
    return merged;
  }

  private normTitle(title: string): string {
    return title.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  private normalize(output: IdeatorOutput, input: AgentBriefContext): IdeatorOutput {
    const allowGimmick = briefAllowsFuturism(input.userQuery);

    const ideas: IdeatorIdea[] = (output.ideas ?? [])
      .filter((idea) => idea.title && idea.description)
      .filter((idea) => !this.isBlacklisted(`${idea.title} ${idea.description} ${idea.hook ?? ''}`))
      .filter((idea) => {
        if (allowGimmick) return true;
        const blob = `${idea.title} ${idea.description} ${idea.hook ?? ''}`;
        return gimmickPenalty(blob, input.userQuery) < 36;
      })
      .map((idea) => ({
        title: idea.title?.slice(0, 80) || 'Концепция',
        hook: idea.hook?.slice(0, 120) || undefined,
        description: idea.description?.slice(0, 280) || '',
        items: mapProductRolesToItems(idea)
          .map((i) => ({
            productType: String(i.productType).slice(0, 40),
            notes: i.notes?.slice(0, 120),
            priority: i.priority === 'must' ? ('must' as const) : ('nice' as const),
          })),
        styleTags: (idea.styleTags ?? []).slice(0, 3),
        colorPalette: (idea.colorPalette ?? input.colors ?? []).slice(0, 5),
        whyItFits: idea.whyItFits?.slice(0, 160) || '',
      }));

    return { ideas };
  }

  private isBlacklisted(text: string): boolean {
    const t = text.toLowerCase();
    return AGENT_BLACKLIST.some((b) => t.includes(b));
  }
}

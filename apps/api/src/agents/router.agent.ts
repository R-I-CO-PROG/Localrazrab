import { Injectable, Logger } from '@nestjs/common';
import { OpenrouterAgentClient } from './openrouter-agent.client';
import { parseAgentJson } from './json-repair.util';
import { SYSTEM_PROMPT_ROUTER } from './prompts';
import type { RouterOutput } from './contracts';
import type { AgentDebugTraceFn } from './agent-debug.types';

const DIRECT_KEYWORDS = [
  'ручка',
  'кружка',
  'футболка',
  'худи',
  'блокнот',
  'pen',
  'mug',
  'tshirt',
  'notebook',
  'cap',
  'кепка',
];

const IDEATION_KEYWORDS = [
  'набор',
  'welcome',
  'pack',
  'идеи',
  'идея',
  'сотрудник',
  'конференц',
  'партнёр',
  'партнер',
  'merch',
  'мерч',
  'gift',
  'подар',
];

@Injectable()
export class RouterAgent {
  private readonly logger = new Logger(RouterAgent.name);

  constructor(private readonly openrouter: OpenrouterAgentClient) {}

  async route(input: {
    userQuery: string;
    category?: string;
    selectedProductNames?: string[];
    catalogCategories?: string[];
    trace?: AgentDebugTraceFn;
  }): Promise<RouterOutput> {
    if (this.openrouter.isEnabled()) {
      try {
        const content = await this.openrouter.chatJson({
          systemPrompt: SYSTEM_PROMPT_ROUTER,
          userMessage: JSON.stringify(input),
          modelEnvKey: 'OPENROUTER_MODEL_ROUTER',
          maxTokensEnvKey: 'OPENROUTER_MAX_TOKENS_ROUTER',
          defaultMaxTokens: 400,
          agentName: 'RouterAgent',
          trace: input.trace,
        });
        const parsed = parseAgentJson<RouterOutput>(content);
        return this.normalize(parsed, input.userQuery);
      } catch (err) {
        this.logger.warn(`Router LLM fallback: ${err instanceof Error ? err.message : err}`);
      }
    }
    const result = this.ruleBasedRoute(input.userQuery);
    await input.trace?.({
      step: 'router_fallback',
      actor: 'RouterAgent',
      direction: 'internal',
      summary: 'Rule-based route',
      response: result,
    });
    return result;
  }

  ruleBasedRoute(userQuery: string): RouterOutput {
    const q = userQuery.trim().toLowerCase();
    const words = q.split(/\s+/).filter(Boolean);
    const hasIdeation = IDEATION_KEYWORDS.some((k) => q.includes(k));
    const hasDirectItem = DIRECT_KEYWORDS.some((k) => q.includes(k));
    const shortQuery = words.length <= 8;

    let route: RouterOutput['route'] = 'IDEATION_PIPELINE';
    let confidence = 0.55;
    let reason = 'Broad or ambiguous query';

    if (hasIdeation) {
      route = 'IDEATION_PIPELINE';
      confidence = 0.85;
      reason = 'Pack/concept keywords detected';
    } else if (shortQuery && hasDirectItem) {
      route = 'DIRECT_PRODUCT';
      confidence = 0.82;
      reason = 'Short query with concrete product';
    }

    if (confidence < 0.6) {
      route = 'IDEATION_PIPELINE';
    }

    return {
      route,
      confidence,
      reason,
      directProductQuery: {
        keywords: words.filter((w) => w.length > 2),
        colors: this.extractColors(q),
        categoryHints: [],
        mustInclude: [],
        mustNotInclude: [],
      },
    };
  }

  private extractColors(q: string): string[] {
    const map: Record<string, string> = {
      красн: 'red',
      чёрн: 'black',
      черн: 'black',
      бел: 'white',
      син: 'blue',
      зел: 'green',
      фиол: 'purple',
    };
    return Object.entries(map)
      .filter(([k]) => q.includes(k))
      .map(([, v]) => v);
  }

  private normalize(parsed: RouterOutput, userQuery: string): RouterOutput {
    const fallback = this.ruleBasedRoute(userQuery);
    const confidence = Number(parsed.confidence) || fallback.confidence;
    let route: RouterOutput['route'] =
      parsed.route === 'DIRECT_PRODUCT' ? 'DIRECT_PRODUCT' : 'IDEATION_PIPELINE';
    if (confidence < 0.6) route = 'IDEATION_PIPELINE';

    return {
      route,
      confidence,
      reason: parsed.reason?.slice(0, 200) || fallback.reason,
      directProductQuery: {
        keywords: parsed.directProductQuery?.keywords?.slice(0, 12) ?? fallback.directProductQuery.keywords,
        colors: parsed.directProductQuery?.colors?.slice(0, 6) ?? [],
        categoryHints: parsed.directProductQuery?.categoryHints?.slice(0, 6) ?? [],
        mustInclude: parsed.directProductQuery?.mustInclude?.slice(0, 6) ?? [],
        mustNotInclude: parsed.directProductQuery?.mustNotInclude?.slice(0, 6) ?? [],
      },
    };
  }
}

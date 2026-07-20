import { Injectable, Logger } from '@nestjs/common';
import { OpenrouterAgentClient } from './openrouter-agent.client';
import { parseAgentJson } from './json-repair.util';
import { SYSTEM_PROMPT_PROMPTBUILDER_CREATIVE } from './prompts';
import type { CriticTopIdea, IdeatorIdea, PromptBuilderOutput, Concept } from './contracts';
import type { AgentDebugTraceFn } from './agent-debug.types';

@Injectable()
export class PromptBuilderAgent {
  private readonly logger = new Logger(PromptBuilderAgent.name);

  constructor(private readonly openrouter: OpenrouterAgentClient) {}

  async buildPrompt(input: {
    userQuery: string;
    chosenIdea: IdeatorIdea | CriticTopIdea | Concept | { title: string; description?: string };
    category?: string;
    budgetMin?: number | null;
    budgetMax?: number | null;
    quantity?: number | null;
    colors?: string[];
    allowedItems?: string[];
    forbiddenItems?: string[];
    notes?: string | null;
    hasLogo?: boolean;
    /** Пожелание пользователя к сцене/фону визуализации («серый фон»). LLM ОБЯЗАН его учесть
     *  при сборке imagePrompt/background — иначе он придумает интерьер вслепую, и приписка в
     *  финальном промпте будет с ним воевать. */
    sceneWish?: string | null;
    trace?: AgentDebugTraceFn;
  }): Promise<PromptBuilderOutput> {
    if (!this.openrouter.isEnabled()) {
      throw new Error('OpenRouter отключён — невозможно собрать промпт для SeeDream');
    }

    const content = await this.openrouter.chatJson({
      systemPrompt: SYSTEM_PROMPT_PROMPTBUILDER_CREATIVE,
      userMessage: JSON.stringify({
        brief: {
          task: input.userQuery,
          category: input.category,
          budget: { min: input.budgetMin, max: input.budgetMax },
          quantity: input.quantity,
          colors: input.colors,
          notes: input.notes,
          hasLogo: input.hasLogo,
          // Пожелание пользователя к фону/сцене — приоритетнее дефолтного «neutral/dark surface».
          ...(input.sceneWish?.trim() ? { sceneWish: input.sceneWish.trim().slice(0, 400) } : {}),
          mode: 'creative',
        },
        chosenConcept: input.chosenIdea,
      }),
      modelEnvKey: 'OPENROUTER_MODEL_PROMPT',
      maxTokensEnvKey: 'OPENROUTER_MAX_TOKENS_PROMPT',
      defaultMaxTokens: 800,
      agentName: 'PromptBuilderAgent',
      trace: input.trace,
    });
    return this.normalize(parseAgentJson<PromptBuilderOutput>(content), input);
  }

  private normalize(parsed: PromptBuilderOutput, input: Parameters<PromptBuilderAgent['buildPrompt']>[0]): PromptBuilderOutput {
    const title = parsed.chosenIdeaTitle || ('title' in input.chosenIdea ? input.chosenIdea.title : 'Concept');
    const imagePrompt = parsed.imagePrompt?.trim().slice(0, 1200);
    if (!imagePrompt) {
      throw new Error('PromptBuilder вернул пустой imagePrompt');
    }
    return {
      chosenIdeaTitle: title,
      imagePrompt,
      negativePrompt:
        parsed.negativePrompt?.slice(0, 500) ||
        'taxi, street, car, vehicle, city traffic, office scene, people, watermark, blurry, cartoon',
      style: parsed.style || 'cinematic photo',
      background: parsed.background || 'describe scene',
      loopSafe: Boolean(parsed.loopSafe),
    };
  }
}

import { Injectable, BadRequestException } from '@nestjs/common';
import { AgentRunStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PromptBuilderAgent } from './prompt-builder.agent';
import { buildConcepts, findConceptByTitle, findIdeatorIdeaByTitle } from './concept.util';
import type { Concept, IdeatorOutput, PromptBuilderOutput } from './contracts';
import type { AgentDebugTraceFn } from './agent-debug.types';

@Injectable()
export class ConceptPromptService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly promptBuilder: PromptBuilderAgent,
  ) {}

  async buildPromptForGeneration(
    requestId: string,
    chosenIdeaTitle: string,
    trace?: AgentDebugTraceFn,
    sceneBrief?: string | null,
  ): Promise<{ promptOutput: PromptBuilderOutput; concept: Concept }> {
    const run = await this.prisma.agentRun.findUnique({ where: { requestId } });
    if (!run) {
      throw new BadRequestException('Сначала подберите концепции (запустите агентов)');
    }
    if (!run.ideatorOutput || !run.criticOutput) {
      throw new BadRequestException('Концепции ещё не готовы — дождитесь завершения агентов');
    }

    const ideatorOutput = run.ideatorOutput as unknown as IdeatorOutput;
    const concepts =
      (run.conceptsOutput as Concept[] | null) ??
      buildConcepts(ideatorOutput, run.criticOutput as unknown as import('./contracts').CriticOutput);

    const concept = findConceptByTitle(concepts, chosenIdeaTitle);
    if (!concept) {
      throw new BadRequestException(`Концепция «${chosenIdeaTitle}» не найдена среди топ‑5`);
    }

    const request = await this.prisma.request.findUniqueOrThrow({
      where: { id: requestId },
      include: { assets: true },
    });

    // ЕДИНЫЙ ИСТОЧНИК СОСТАВА НАБОРА: промпт картинки должен описывать ТОТ ЖЕ набор, что персистнут
    // в conceptsOutput и показан пользователю. ideatorOutput хранит ИСХОДНУЮ идею — трим размера
    // набора (CREATIVE_VARY_SET_SIZE) применялся только к conceptsOutput. Раньше PromptBuilder брал
    // необрезанную идею и нарративил 5 предметов, тогда как счётчик «Exactly N products» и список
    // товаров ниже по пайплайну считались по обрезанному concept → само-противоречивый промпт.
    // Берём богатый нарратив идеатора, но состав — строго из выбранной (обрезанной) концепции.
    const ideatorIdea = findIdeatorIdeaByTitle(ideatorOutput, chosenIdeaTitle);
    const chosenIdea = ideatorIdea ? { ...ideatorIdea, items: concept.items } : concept;
    const logoAsset = request.assets.find((a) => a.type === 'logo');

    const promptOutput = await this.promptBuilder.buildPrompt({
      userQuery: request.userPrompt,
      chosenIdea,
      category: request.category,
      budgetMin: request.budgetMin,
      budgetMax: request.budgetMax,
      quantity: request.quantity,
      colors: (request.colors as string[]) ?? [],
      notes: request.notes,
      hasLogo: Boolean(logoAsset),
      sceneWish: sceneBrief,
      trace,
    });

    await this.prisma.agentRun.update({
      where: { id: run.id },
      data: {
        chosenIdeaTitle,
        promptOutput: promptOutput as object,
        status: AgentRunStatus.idea_selected,
      },
    });

    return { promptOutput, concept };
  }
}

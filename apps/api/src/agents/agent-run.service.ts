import {

  BadRequestException,

  ConflictException,

  Injectable,

  NotFoundException,

  ServiceUnavailableException,

} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';
import { resolveDebugFlag } from '../security/env.util';

import { InjectQueue } from '../generation/generation-queue.decorator';

import { Queue } from 'bullmq';

import { PrismaService } from '../prisma/prisma.service';

import { AgentRunStatus } from '@prisma/client';

import { AGENT_RUN_QUEUE, AgentRunJobData, isAgentsEnabled, isCreativeAgentPipelineEnabled } from './agent-run.queue';
import {
  extractFromConceptsOutput,
  mergeGenerationHistory,
  readGenerationHistory,
  type GenerationHistory,
} from './previous-generation.util';



@Injectable()

export class AgentRunService {

  constructor(

    private readonly prisma: PrismaService,

    private readonly config: ConfigService,

    @InjectQueue(AGENT_RUN_QUEUE) private readonly queue: Queue<AgentRunJobData>,

  ) {}



  private assertEnabled() {

    if (!isCreativeAgentPipelineEnabled(this.config) && !isAgentsEnabled(this.config)) {

      throw new ServiceUnavailableException(

        'Agent pipeline disabled — включите OPENROUTER_ENABLED или AGENTS_ENABLED',

      );

    }

  }



  /** Ideator → Critic → 5 концепций (креатив) или 5 наборов из каталога */
  async start(requestId: string, options: { debug?: boolean; aiStyle?: 'catalog' | 'creative' } = {}) {
    this.assertEnabled();

    const aiStyle = options.aiStyle ?? 'creative';
    if (aiStyle !== 'creative' && aiStyle !== 'catalog') {
      throw new BadRequestException('aiStyle must be creative or catalog');
    }

    const request = await this.prisma.request.findUnique({
      where: { id: requestId },
      include: { agentRun: true },
    });
    if (!request) throw new NotFoundException('Request not found');
    if (!request.userPrompt?.trim()) {
      throw new BadRequestException('Опишите задачу в брифе');
    }

    await this.prisma.requestItem.deleteMany({ where: { requestId } });

    if (request.agentRun && ['queued', 'running'].includes(request.agentRun.status)) {
      throw new ConflictException('Подбор концепций уже выполняется');
    }

    let generationHistory: GenerationHistory | null = readGenerationHistory(
      request.agentRun?.routerOutput,
    );
    if (request.agentRun?.conceptsOutput) {
      const latest = extractFromConceptsOutput(request.agentRun.conceptsOutput);
      if (latest.productIds.length || latest.conceptTitles.length) {
        generationHistory = mergeGenerationHistory(generationHistory, latest);
      }
    }

    const debug = resolveDebugFlag(options.debug);

    const agentRun = await this.prisma.agentRun.upsert({

      where: { requestId },

      create: {

        requestId,

        status: AgentRunStatus.queued,

        currentStep: 'ideator',

        debugEnabled: debug,

        debugLog: debug ? [] : undefined,

      },

      update: {

        status: AgentRunStatus.queued,

        currentStep: 'ideator',

        debugEnabled: debug,

        debugLog: debug ? [] : undefined,

        route: null,

        routerOutput: generationHistory
          ? ({ generationHistory } as object)
          : undefined,

        ideatorOutput: undefined,

        criticOutput: undefined,

        conceptsOutput: undefined,

        promptOutput: undefined,

        directProducts: undefined,

        chosenIdeaTitle: null,

        imageResultUrl: null,

        error: null,

        startedAt: null,

        finishedAt: null,

      },

    });



    await this.queue.add(

      'concepts',

      {
        agentRunId: agentRun.id,
        requestId,
        debug,
        aiStyle,
        generationHistory,
      },

      { jobId: `${agentRun.id}-${Date.now()}` },

    );



    return this.getByRequestId(requestId);

  }



  /** Пользователь выбрал концепцию — сохраняем до генерации фото */

  async selectConcept(requestId: string, chosenIdeaTitle: string) {

    this.assertEnabled();

    const run = await this.prisma.agentRun.findUnique({ where: { requestId } });

    if (!run) throw new NotFoundException('Сначала подберите концепции');



    if (run.status !== AgentRunStatus.awaiting_idea_selection && run.status !== AgentRunStatus.idea_selected) {

      throw new BadRequestException(`Нельзя выбрать концепцию в статусе ${run.status}`);

    }



    const title = chosenIdeaTitle.trim();

    if (!title) throw new BadRequestException('chosenIdeaTitle required');

    const concepts = (run.conceptsOutput as Array<{ title: string; productIds?: string[] }> | null) ?? [];
    const picked = concepts.find((c) => c.title === title);
    if (picked?.productIds?.length) {
      await this.prisma.requestItem.deleteMany({ where: { requestId } });
      await this.prisma.requestItem.createMany({
        data: picked.productIds.map((productId) => ({ requestId, productId })),
      });
    }

    await this.prisma.agentRun.update({

      where: { id: run.id },

      data: {

        chosenIdeaTitle: title,

        status: AgentRunStatus.idea_selected,

        currentStep: 'await_selection',

      },

    });



    return this.getByRequestId(requestId);

  }



  /** @deprecated use selectConcept */

  async continue(requestId: string, body: { chosenIdeaTitle?: string; productIds?: string[] }) {

    if (body.chosenIdeaTitle) {

      return this.selectConcept(requestId, body.chosenIdeaTitle);

    }

    throw new BadRequestException('chosenIdeaTitle required');

  }



  async retry(requestId: string, options?: { aiStyle?: 'catalog' | 'creative' }) {
    let aiStyle = options?.aiStyle;
    if (!aiStyle) {
      const existing = await this.prisma.agentRun.findUnique({ where: { requestId } });
      const stored = (existing as { aiStyle?: string } | null)?.aiStyle;
      aiStyle = stored === 'catalog' || stored === 'creative' ? stored : 'creative';
    }
    return this.start(requestId, { aiStyle });
  }



  async getByRequestId(requestId: string) {

    const run = await this.prisma.agentRun.findUnique({ where: { requestId } });

    if (!run) return null;

    return run;

  }

}



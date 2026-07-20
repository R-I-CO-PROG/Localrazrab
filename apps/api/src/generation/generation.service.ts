import {

  Injectable,

  ConflictException,

  BadRequestException,

  Inject,

  forwardRef,

} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import { InjectQueue } from './generation-queue.decorator';

import { Queue } from 'bullmq';

import { PrismaService } from '../prisma/prisma.service';

import { RequestsService } from '../requests/requests.service';

import { GENERATION_QUEUE, GenerationJobData } from './generation.queue';

import { GenerationStatus, Prisma, RequestStatus, AgentRunStatus } from '@prisma/client';

import { buildGenerationInputSnapshot } from './generation-snapshot.util';
import { isCreativeAgentPipelineEnabled } from '../agents/agent-run.queue';
import { resolveDebugFlag } from '../security/env.util';



@Injectable()

export class GenerationService {

  constructor(

    private readonly prisma: PrismaService,

    private readonly config: ConfigService,

    @Inject(forwardRef(() => RequestsService))

    private readonly requestsService: RequestsService,

    @InjectQueue(GENERATION_QUEUE) private readonly queue: Queue<GenerationJobData>,

  ) {}



  private async syncRequestProducts(requestId: string, productIds: string[]) {

    await this.prisma.requestItem.deleteMany({ where: { requestId } });

    if (productIds.length === 0) return;

    await this.prisma.requestItem.createMany({

      data: productIds.map((productId) => ({ requestId, productId })),

    });

  }



  private validateGenerationInput(

    aiStyle: 'catalog' | 'creative',

    request: { items: unknown[]; assets: Array<{ type: string }> },

  ) {

    if (aiStyle === 'creative') {

      const hasLogo = request.assets.some((a) => a.type === 'logo');

      if (!hasLogo) {

        throw new BadRequestException(

          'Загрузите логотип — в креативном режиме он обязателен и передаётся в генерацию',

        );

      }

      return;

    }

    if (request.items.length === 0) {

      throw new BadRequestException('Выберите хотя бы один товар перед генерацией');

    }

  }



  private async validateCatalogConcept(requestId: string, chosenIdeaTitle?: string) {
    const title = chosenIdeaTitle?.trim();
    if (!title) {
      throw new BadRequestException('Выберите одну из 5 концепций перед генерацией фото');
    }

    const run = await this.prisma.agentRun.findUnique({ where: { requestId } });
    if (!run?.conceptsOutput) {
      throw new BadRequestException('Сначала подберите концепции из каталога');
    }

    const okStatus =
      run.status === AgentRunStatus.awaiting_idea_selection ||
      run.status === AgentRunStatus.idea_selected;
    if (!okStatus) {
      throw new BadRequestException(
        run.status === AgentRunStatus.running || run.status === AgentRunStatus.queued
          ? 'Дождитесь завершения подбора концепций'
          : 'Подберите концепции заново',
      );
    }
  }

  private async validateCreativeConcept(requestId: string, chosenIdeaTitle?: string) {
    if (!isCreativeAgentPipelineEnabled(this.config)) return;

    const title = chosenIdeaTitle?.trim();
    if (!title) {
      throw new BadRequestException(
        'Выберите одну из 5 концепций перед генерацией фото',
      );
    }

    const run = await this.prisma.agentRun.findUnique({ where: { requestId } });
    if (!run?.ideatorOutput || !run.criticOutput) {
      throw new BadRequestException(
        'Сначала подберите концепции — нажмите «Подобрать концепции»',
      );
    }

    const okStatus =
      run.status === AgentRunStatus.awaiting_idea_selection ||
      run.status === AgentRunStatus.idea_selected;
    if (!okStatus) {
      throw new BadRequestException(
        run.status === AgentRunStatus.running || run.status === AgentRunStatus.queued
          ? 'Дождитесь завершения подбора концепций'
          : 'Подберите концепции заново',
      );
    }
  }

  async startGeneration(

    requestId: string,

    options: {

      debug?: boolean;

      mode?: 'mockup' | 'ai';

      productIds?: string[];

      aiStyle?: 'catalog' | 'creative';

      chosenIdeaTitle?: string;

      productTargetColors?: Array<{ productId: string; color: string }>;

      sceneBrief?: string;

      giftBoxEnabled?: boolean;

    } = {},

    callerUserId?: string | null,

  ) {

    const debug = resolveDebugFlag(options.debug);

    const mode = options.mode ?? 'mockup';

    const aiStyle = options.aiStyle ?? 'catalog';

    const chosenIdeaTitle = options.chosenIdeaTitle?.trim();

    // Проверка владения — до любых мутаций (syncRequestProducts ниже пишет в БД).
    // Результат не переиспользуем: он ещё не отражает продукты, синхронизированные ниже.
    await this.requestsService.findOne(requestId, callerUserId);

    if (aiStyle === 'creative') {
      await this.syncRequestProducts(requestId, []);
    } else if (options.productIds?.length) {
      await this.syncRequestProducts(requestId, options.productIds);
    }



    const request = await this.requestsService.findOne(requestId, callerUserId);

    this.validateGenerationInput(aiStyle, request);

    if (aiStyle === 'creative' && mode === 'ai') {
      await this.validateCreativeConcept(requestId, chosenIdeaTitle);
    }

    if (aiStyle === 'catalog' && mode === 'ai') {
      await this.validateCatalogConcept(requestId, chosenIdeaTitle);
    }

    if (request.generationCount > 0 || request.generation) {

      throw new ConflictException('Generation already started for this request');

    }

    if (request.status !== RequestStatus.ready) {

      throw new BadRequestException('Request must be in ready status');

    }



    const publicApiUrl = this.config.get<string>('PUBLIC_API_URL', '');

    const inputSnapshot = buildGenerationInputSnapshot(request, {

      mode,

      aiStyle,

      debug,

      publicApiUrl,

      revision: 1,

      chosenIdeaTitle,

      productTargetColors: options.productTargetColors,

      sceneBrief: options.sceneBrief,

      giftBoxEnabled: options.giftBoxEnabled,

    });



    const generation = await this.prisma.$transaction(async (tx) => {

      const locked = await tx.request.updateMany({

        where: {

          id: requestId,

          status: RequestStatus.ready,

          generationCount: 0,

        },

        data: {

          status: RequestStatus.generating,

          generationCount: { increment: 1 },

          generationLockedAt: new Date(),

        },

      });



      if (locked.count !== 1) {

        throw new ConflictException('Generation already started for this request');

      }



      const gen = await tx.generation.create({

        data: {

          requestId,

          status: GenerationStatus.queued,

          inputSnapshot: inputSnapshot as Prisma.InputJsonValue,

        },

      });



      return gen;

    });



    const job = await this.queue.add(

      'generate',

      { generationId: generation.id, requestId, debug, mode },

      { jobId: generation.id },

    );



    return { jobId: job.id, requestId, debug, regenerated: false };

  }



  async regenerateGeneration(

    requestId: string,

    options: {

      debug?: boolean;

      mode?: 'mockup' | 'ai';

      productIds?: string[];

      aiStyle?: 'catalog' | 'creative';

      chosenIdeaTitle?: string;

      productTargetColors?: Array<{ productId: string; color: string }>;

      sceneBrief?: string;

      giftBoxEnabled?: boolean;

    } = {},

    callerUserId?: string | null,

  ) {

    const debug = resolveDebugFlag(options.debug);

    const mode = options.mode ?? 'mockup';

    const aiStyle = options.aiStyle ?? 'catalog';

    const chosenIdeaTitle = options.chosenIdeaTitle?.trim();

    // Проверка владения — до любых мутаций (syncRequestProducts ниже пишет в БД).
    await this.requestsService.findOne(requestId, callerUserId);

    if (aiStyle === 'creative') {
      await this.syncRequestProducts(requestId, []);
    } else if (options.productIds !== undefined) {
      await this.syncRequestProducts(requestId, options.productIds);
    }

    const request = await this.requestsService.findOne(requestId, callerUserId);

    if (!request.generation) {
      throw new BadRequestException('Нет предыдущей генерации для перегенерации');
    }

    if (request.status !== RequestStatus.done && request.status !== RequestStatus.failed) {

      throw new BadRequestException('Перегенерация доступна только для готовой или неудачной концепции');

    }



    this.validateGenerationInput(aiStyle, request);

    if (aiStyle === 'creative' && mode === 'ai') {
      await this.validateCreativeConcept(requestId, chosenIdeaTitle);
    }

    if (aiStyle === 'catalog' && mode === 'ai') {
      await this.validateCatalogConcept(requestId, chosenIdeaTitle);
    }

    const revision = request.generationCount + 1;

    const publicApiUrl = this.config.get<string>('PUBLIC_API_URL', '');

    const inputSnapshot = buildGenerationInputSnapshot(request, {

      mode,

      aiStyle,

      debug,

      publicApiUrl,

      revision,

      chosenIdeaTitle,

      productTargetColors: options.productTargetColors,

      sceneBrief: options.sceneBrief,

      giftBoxEnabled: options.giftBoxEnabled,

    });



    const generationId = request.generation.id;



    await this.prisma.$transaction(async (tx) => {

      const locked = await tx.request.updateMany({

        where: {

          id: requestId,

          status: { in: [RequestStatus.done, RequestStatus.failed] },

        },

        data: {

          status: RequestStatus.generating,

          generationCount: { increment: 1 },

          generationLockedAt: new Date(),

        },

      });



      if (locked.count !== 1) {

        throw new ConflictException('Концепция уже перегенерируется');

      }



      await tx.generation.update({

        where: { id: generationId },

        data: {

          status: GenerationStatus.queued,

          inputSnapshot: inputSnapshot as Prisma.InputJsonValue,

          llmOutput: Prisma.DbNull,

          imagePrompt: null,

          negativePrompt: null,

          resultImageUrl: null,

          startedAt: null,

          finishedAt: null,

        },

      });

    });



    const job = await this.queue.add(

      'generate',

      { generationId, requestId, debug, mode },

      { jobId: `${generationId}-r${revision}` },

    );



    return { jobId: job.id, requestId, debug, regenerated: true, revision };

  }

  async getActiveJobProgress(
    generationId: string,
    generationCount: number,
  ): Promise<number | null> {
    const candidates = [
      `${generationId}-refine-${generationCount + 1}`,
      `${generationId}-refine-${generationCount}`,
      `${generationId}-r${generationCount + 1}`,
      `${generationId}-r${generationCount}`,
      generationId,
    ];
    const seen = new Set<string>();

    for (const jobId of candidates) {
      if (seen.has(jobId)) continue;
      seen.add(jobId);

      const job = await this.queue.getJob(jobId);
      if (!job) continue;

      const state = await job.getState();
      if (state === 'active' || state === 'waiting' || state === 'delayed') {
        const progress = job.progress;
        return typeof progress === 'number' ? progress : 5;
      }
    }

    return null;
  }

}



import {
  Injectable,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from './generation-queue.decorator';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { RequestsService } from '../requests/requests.service';
import { GENERATION_QUEUE, GenerationJobData } from './generation.queue';
import { GenerationStatus, RequestStatus } from '@prisma/client';
import { forwardRef, Inject } from '@nestjs/common';
import { getConceptResult } from '../generation/concept-result.util';
import { normalizeAssetPath } from '../generation/logo-reference.util';

@Injectable()
export class RefineVisualizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(forwardRef(() => RequestsService))
    private readonly requestsService: RequestsService,
    @InjectQueue(GENERATION_QUEUE) private readonly queue: Queue<GenerationJobData>,
  ) {}

  async startRefinement(
    requestId: string,
    options: { refinementBrief: string; sourceImageUrl?: string; chosenIdeaTitle?: string },
    callerUserId?: string | null,
  ) {
    const brief = options.refinementBrief?.trim();
    if (!brief || brief.length < 8) {
      throw new BadRequestException('Опишите, что изменить в визуализации (минимум 8 символов)');
    }

    const request = await this.requestsService.findOne(requestId, callerUserId);
    if (!request.generation?.resultImageUrl) {
      throw new BadRequestException('Сначала создайте визуализацию');
    }
    if (request.status === RequestStatus.generating) {
      throw new ConflictException('Генерация уже выполняется');
    }
    if (request.status !== RequestStatus.done) {
      throw new BadRequestException('Перегенерация доступна только для готовой визуализации');
    }

    const snapshot = request.generation.inputSnapshot as Record<string, unknown> | null;
    const chosenIdeaTitle =
      options.chosenIdeaTitle?.trim() ||
      (snapshot?.chosenIdeaTitle as string | null)?.trim() ||
      '';
    let sourceImageUrl = options.sourceImageUrl?.trim();
    if (sourceImageUrl) {
      sourceImageUrl = normalizeAssetPath(sourceImageUrl);
    } else if (chosenIdeaTitle) {
      const conceptResult = getConceptResult(request.generation.conceptResults, chosenIdeaTitle);
      sourceImageUrl = conceptResult?.resultImageUrl ?? undefined;
    }
    sourceImageUrl = sourceImageUrl || request.generation.resultImageUrl;
    if (!sourceImageUrl?.trim()) {
      throw new BadRequestException('Не найдено исходное фото для перегенерации');
    }
    const generationId = request.generation.id;
    const revision = request.generationCount + 1;

    await this.prisma.$transaction(async (tx) => {
      const locked = await tx.request.updateMany({
        where: { id: requestId, status: RequestStatus.done },
        data: {
          status: RequestStatus.generating,
          generationCount: { increment: 1 },
          generationLockedAt: new Date(),
        },
      });
      if (locked.count !== 1) {
        throw new ConflictException('Перегенерация уже выполняется');
      }

      await tx.generation.update({
        where: { id: generationId },
        data: { status: GenerationStatus.generating, startedAt: new Date() },
      });
    });

    const job = await this.queue.add(
      'refine',
      {
        generationId,
        requestId,
        jobType: 'refine',
        refinementBrief: brief,
        sourceImageUrl,
        chosenIdeaTitle: chosenIdeaTitle || undefined,
        mode: 'ai',
      },
      { jobId: `${generationId}-refine-${revision}` },
    );

    return {
      jobId: job.id,
      requestId,
      revision,
      refining: true,
    };
  }
}

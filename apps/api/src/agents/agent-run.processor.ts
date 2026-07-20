import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker, Job } from 'bullmq';
import { AgentRunStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AGENT_RUN_QUEUE, AgentRunJobData } from './agent-run.queue';
import { IdeatorAgent } from './ideator.agent';
import { CriticAgent } from './critic.agent';
import { ConceptPreviewService } from './concept-preview.service';
import { AgentDebugService } from './agent-debug.service';
import { CatalogConceptService } from './catalog-concept.service';
import { buildConcepts } from './concept.util';
import { CRITIC_TOP_N } from './agent.constants';
import type { AgentBriefContext } from './brief-context.util';
import type { AgentDebugTraceFn } from './agent-debug.types';
import type { CriticOutput, IdeatorOutput } from './contracts';
import { pickTopCreativeIdeasLocally } from '../providers/llm/creative-fast-select.util';
import { trimItemsPreservingMust } from './creative-set-size.util';

@Injectable()
export class AgentRunProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AgentRunProcessor.name);
  private worker: Worker<AgentRunJobData> | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly ideator: IdeatorAgent,
    private readonly critic: CriticAgent,
    private readonly conceptPreview: ConceptPreviewService,
    private readonly catalogConcepts: CatalogConceptService,
    private readonly agentDebug: AgentDebugService,
  ) {}

  onModuleInit() {
    const redisUrl = this.config.get<string>('REDIS_URL', 'redis://localhost:6379');
    this.worker = new Worker<AgentRunJobData>(
      AGENT_RUN_QUEUE,
      async (job) => this.process(job),
      {
        connection: { url: redisUrl },
        lockDuration: 600_000,
        concurrency: Number(this.config.get('AGENT_RUN_CONCURRENCY', '3')) || 3,
      },
    );
    this.worker.on('failed', (job, err) => {
      this.logger.error(`Agent job ${job?.id} failed: ${err.message}`);
    });
    this.logger.log(`Agent run worker started (Ideator → Critic / CatalogIdeator → CatalogCritic)`);
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }

  private async process(job: Job<AgentRunJobData>) {
    const { agentRunId, requestId, aiStyle = 'creative' } = job.data;
    const isCatalog = aiStyle === 'catalog';
    const run = await this.prisma.agentRun.findUniqueOrThrow({ where: { id: agentRunId } });
    const debug = run.debugEnabled || job.data.debug === true;
    const trace = this.agentDebug.trace(agentRunId, debug);

    const request = await this.prisma.request.findUniqueOrThrow({
      where: { id: requestId },
      include: { assets: true },
    });

    await this.prisma.agentRun.update({
      where: { id: agentRunId },
      data: { status: AgentRunStatus.running, startedAt: run.startedAt ?? new Date(), error: null },
    });

    await trace({
      step: 'concepts_start',
      actor: 'AgentWorker',
      direction: 'internal',
      summary: isCatalog ? 'CatalogIdeator → CatalogCritic' : 'Ideator → Critic',
      request: { requestId, userPrompt: request.userPrompt.slice(0, 200) },
    });

    try {
      const briefInput = this.buildBriefInput(request, isCatalog);

      if (isCatalog) {
        await job.updateProgress(15);
        await this.setStep(agentRunId, 'catalog_ideator');

        const result = await this.catalogConcepts.discoverConcepts(briefInput, request, {
          trace,
          generationHistory: job.data.generationHistory ?? null,
        });

        await trace({
          step: 'catalog_ideator_done',
          actor: 'CatalogIdeatorAgent',
          direction: 'internal',
          summary: `${result.ideatorOutput?.ideas.length ?? 0} catalog set ideas`,
        });

        await trace({
          step: 'catalog_discover_done',
          actor: 'CatalogConceptService',
          direction: 'internal',
          summary: `${result.concepts.length} concepts (${result.pipeline}) in ${result.timingMs ?? '?'}ms`,
          ms: result.timingMs,
          response: {
            pipeline: result.pipeline,
            conceptCount: result.concepts.length,
            timingMs: result.timingMs,
            timingStages: result.timingStages,
          },
        });

        await job.updateProgress(55);
        await this.setStep(agentRunId, 'catalog_critic');

        await trace({
          step: 'catalog_critic_done',
          actor: 'CatalogCriticAgent',
          direction: 'internal',
          summary: `${result.criticOutput?.topIdeas.length ?? 0} top sets (${result.pipeline})`,
        });

        await job.updateProgress(90);
        await this.setStep(agentRunId, 'catalog_previews');

        // ПУСТОЙ РЕЗУЛЬТАТ — ЭТО ПРОВАЛ, А НЕ УСПЕХ. discoverConcepts глушит ЛЮБОЙ throw и отдаёт
        // `{ concepts: [], pipeline: 'fallback' }`, а финальный фильтр выбрасывает концепции без
        // товаров. Раньше прогон всё равно уходил в awaiting_idea_selection с error:null — полный
        // отказ (БД/pgvector легли, пустой каталог, необработанный throw) был неотличим от успеха
        // и пользователь видел «готово», но без наборов. Бросаем — внешний catch проставит
        // status=failed + error и пробросит дальше (ретрай очереди).
        if (result.concepts.length === 0) {
          throw new Error(
            `Catalog pipeline returned 0 concepts (pipeline=${result.pipeline}); ` +
              `treating as failure instead of empty success`,
          );
        }

        await this.prisma.agentRun.update({
          where: { id: agentRunId },
          data: {
            ideatorOutput: (result.ideatorOutput ?? null) as unknown as Prisma.InputJsonValue,
            criticOutput: (result.criticOutput ?? null) as unknown as Prisma.InputJsonValue,
            conceptsOutput: result.concepts as unknown as Prisma.InputJsonValue,
            status: AgentRunStatus.awaiting_idea_selection,
            currentStep: 'await_selection',
            finishedAt: new Date(),
          },
        });

        await job.updateProgress(100);
        this.logger.log(
          `Catalog run ${agentRunId}: ${result.concepts.length} concepts (${result.pipeline}) in ${result.timingMs ?? '?'}ms`,
        );
        return;
      }

      await job.updateProgress(15);
      await this.setStep(agentRunId, 'ideator');

      const ideatorResult = await this.ideator.generateIdeas({
        ...briefInput,
        trace,
      });
      const ideatorOutput: IdeatorOutput = ideatorResult;

      await trace({
        step: 'ideator_done',
        actor: 'IdeatorAgent',
        direction: 'internal',
        summary: `${ideatorOutput.ideas.length} ideas${ideatorResult.usedFallback ? ' (fallback)' : ''}`,
        response: { count: ideatorOutput.ideas.length, usedFallback: ideatorResult.usedFallback },
      });

      await this.prisma.agentRun.update({
        where: { id: agentRunId },
        data: { ideatorOutput: ideatorOutput as unknown as Prisma.InputJsonValue },
      });

      await job.updateProgress(55);
      await this.setStep(agentRunId, 'critic');

      const fastCreative =
        this.config.get<string>('CREATIVE_FAST_PIPELINE', 'true') !== 'false';
      let criticOutput: CriticOutput;
      if (fastCreative) {
        criticOutput = pickTopCreativeIdeasLocally(
          ideatorOutput.ideas,
          briefInput,
          CRITIC_TOP_N,
        );
        await trace({
          step: 'critic_local',
          actor: 'CriticAgent',
          direction: 'internal',
          summary: `${criticOutput.topIdeas.length} top ideas (local fast select, no LLM)`,
        });
        this.logger.log(
          `Creative fast select: ${ideatorOutput.ideas.length} ideas → ${criticOutput.topIdeas.length} concepts`,
        );
      } else {
        try {
          criticOutput = await this.critic.pickTop5(
            ideatorOutput.ideas,
            briefInput,
            trace,
          );
        } catch (criticErr) {
          const msg = criticErr instanceof Error ? criticErr.message : String(criticErr);
          this.logger.warn(`Critic LLM failed (${msg}) — local fallback`);
          criticOutput = pickTopCreativeIdeasLocally(
            ideatorOutput.ideas,
            briefInput,
            CRITIC_TOP_N,
          );
        }
      }

      let concepts = buildConcepts(ideatorOutput, criticOutput, {
        usedFallback: ideatorResult.usedFallback,
        fallbackReason: ideatorResult.fallbackReason,
      });

      // РАЗНОЕ ЧИСЛО ТОВАРОВ (см. creative-set-size.util): трим к паттерну 5/3/4/…, но НИКОГДА не
      // выбрасываем must-позицию — порядок items не гарантирует «must первыми».
      if (process.env.CREATIVE_VARY_SET_SIZE !== 'false') {
        concepts = concepts.map((c, i) => {
          const items = (c as { items?: Array<{ priority?: string }> }).items;
          if (!Array.isArray(items)) return c;
          const kept = trimItemsPreservingMust(items, i);
          return kept === items ? c : ({ ...c, items: kept } as typeof c);
        });
      }

      await trace({
        step: 'critic_done',
        actor: 'CriticAgent',
        direction: 'internal',
        summary: `${concepts.length} concepts for user`,
        response: criticOutput,
      });

      await job.updateProgress(72);
      await this.setStep(agentRunId, 'previews');

      // Тот же инвариант, что и в каталожной ветке: ноль концепций = пользователю нечего выбирать.
      if (concepts.length === 0) {
        throw new Error('Creative pipeline returned 0 concepts; treating as failure instead of empty success');
      }

      const fluxPreviewCreative =
        this.config.get<string>('CREATIVE_FLUX_PREVIEW_ENABLED', 'false') === 'true';
      if (fluxPreviewCreative && this.conceptPreview.isEnabled() && concepts.length > 0) {
        concepts = await this.conceptPreview.attachPreviews(concepts, {
          agentRunId,
          colors: briefInput.colors ?? [],
        });
        await trace({
          step: 'previews_done',
          actor: 'ConceptPreviewService',
          direction: 'internal',
          summary: `${concepts.filter((c) => c.previewImageUrl).length}/${concepts.length} Flux Klein previews`,
        });
      }

      await this.prisma.agentRun.update({
        where: { id: agentRunId },
        data: {
          criticOutput: criticOutput as unknown as Prisma.InputJsonValue,
          conceptsOutput: concepts as unknown as Prisma.InputJsonValue,
          status: AgentRunStatus.awaiting_idea_selection,
          currentStep: 'await_selection',
          finishedAt: new Date(),
        },
      });

      await job.updateProgress(100);
      this.logger.log(`Agent run ${agentRunId}: ${concepts.length} concepts ready for selection`);
    } catch (err) {
      let message = err instanceof Error ? err.message : String(err);
      if (/openrouter|429|rate.?limit/i.test(message)) {
        message = `OpenRouter недоступен: ${message}. Повторите через 1–2 минуты.`;
      }
      await trace({
        step: 'concepts_failed',
        actor: 'AgentWorker',
        direction: 'internal',
        error: message,
      });
      await this.prisma.agentRun.update({
        where: { id: agentRunId },
        data: { status: AgentRunStatus.failed, error: message, finishedAt: new Date() },
      });
      throw err;
    }
  }

  private buildBriefInput(request: {
    userPrompt: string;
    category: string;
    budgetMin: number | null;
    budgetMax: number | null;
    quantity: number | null;
    colors: unknown;
    notes: string | null;
    allowedItems: unknown;
    forbiddenItems: unknown;
    assets: Array<{ type: string }>;
  }, includeCatalogMode = true): AgentBriefContext {
    // РАЗВЯЗКА ДВУХ РАЗНЫХ ПОНЯТИЙ. `includeCatalogMode` означает «набор привязан к реальным SKU
    // каталога» — и НЕ должен обнулять БРИФ-уровневые обещания пользователю. Раньше для креатива
    // (isCatalog=false) обнулялись budget + forbiddenItems + allowedItems, из-за чего вся
    // downstream-логика запретов/бюджета получала пустые данные и НЕ срабатывала (forbidden-скор в
    // creative-fast-select и бюджет для PromptBuilder были мёртвым кодом).
    // Исключения и бюджет — обещания пользователю в ЛЮБОМ режиме, поэтому передаём всегда.
    // allowedItems («можно только X») — это бакеты категорий каталога, для креатива не применимы.
    return {
      userQuery: request.userPrompt,
      category: request.category,
      budgetMin: request.budgetMin,
      budgetMax: request.budgetMax,
      quantity: request.quantity,
      colors: (request.colors as string[]) ?? [],
      notes: request.notes,
      allowedItems: includeCatalogMode ? ((request.allowedItems as string[]) ?? []) : [],
      forbiddenItems: (request.forbiddenItems as string[]) ?? [],
      hasLogo: request.assets.some((a) => a.type === 'logo'),
      includeCatalogConstraints: includeCatalogMode,
    };
  }

  private async setStep(agentRunId: string, step: string) {
    await this.prisma.agentRun.update({
      where: { id: agentRunId },
      data: { currentStep: step },
    });
    this.logger.log(`AgentRun ${agentRunId} → ${step}`);
  }
}

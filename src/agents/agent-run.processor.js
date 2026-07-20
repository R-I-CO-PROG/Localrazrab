"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var AgentRunProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentRunProcessor = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const bullmq_1 = require("bullmq");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const agent_run_queue_1 = require("./agent-run.queue");
const ideator_agent_1 = require("./ideator.agent");
const critic_agent_1 = require("./critic.agent");
const concept_preview_service_1 = require("./concept-preview.service");
const agent_debug_service_1 = require("./agent-debug.service");
const catalog_concept_service_1 = require("./catalog-concept.service");
const concept_util_1 = require("./concept.util");
let AgentRunProcessor = AgentRunProcessor_1 = class AgentRunProcessor {
    constructor(config, prisma, ideator, critic, conceptPreview, catalogConcepts, agentDebug) {
        this.config = config;
        this.prisma = prisma;
        this.ideator = ideator;
        this.critic = critic;
        this.conceptPreview = conceptPreview;
        this.catalogConcepts = catalogConcepts;
        this.agentDebug = agentDebug;
        this.logger = new common_1.Logger(AgentRunProcessor_1.name);
        this.worker = null;
    }
    onModuleInit() {
        const redisUrl = this.config.get('REDIS_URL', 'redis://localhost:6379');
        this.worker = new bullmq_1.Worker(agent_run_queue_1.AGENT_RUN_QUEUE, async (job) => this.process(job), {
            connection: { url: redisUrl },
            lockDuration: 600_000,
            concurrency: Number(this.config.get('AGENT_RUN_CONCURRENCY', '3')) || 3,
        });
        this.worker.on('failed', (job, err) => {
            this.logger.error(`Agent job ${job?.id} failed: ${err.message}`);
        });
        this.logger.log(`Agent run worker started (Ideator → Critic / CatalogIdeator → CatalogCritic)`);
    }
    async onModuleDestroy() {
        await this.worker?.close();
    }
    async process(job) {
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
            data: { status: client_1.AgentRunStatus.running, startedAt: run.startedAt ?? new Date(), error: null },
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
                await this.prisma.agentRun.update({
                    where: { id: agentRunId },
                    data: {
                        ideatorOutput: (result.ideatorOutput ?? null),
                        criticOutput: (result.criticOutput ?? null),
                        conceptsOutput: result.concepts,
                        status: client_1.AgentRunStatus.awaiting_idea_selection,
                        currentStep: 'await_selection',
                        finishedAt: new Date(),
                    },
                });
                await job.updateProgress(100);
                this.logger.log(`Catalog run ${agentRunId}: ${result.concepts.length} concepts (${result.pipeline}) in ${result.timingMs ?? '?'}ms`);
                return;
            }
            await job.updateProgress(15);
            await this.setStep(agentRunId, 'ideator');
            const ideatorResult = await this.ideator.generateIdeas({
                ...briefInput,
                trace,
            });
            const ideatorOutput = ideatorResult;
            await trace({
                step: 'ideator_done',
                actor: 'IdeatorAgent',
                direction: 'internal',
                summary: `${ideatorOutput.ideas.length} ideas${ideatorResult.usedFallback ? ' (fallback)' : ''}`,
                response: { count: ideatorOutput.ideas.length, usedFallback: ideatorResult.usedFallback },
            });
            await this.prisma.agentRun.update({
                where: { id: agentRunId },
                data: { ideatorOutput: ideatorOutput },
            });
            await job.updateProgress(55);
            await this.setStep(agentRunId, 'critic');
            const criticOutput = await this.critic.pickTop5(ideatorOutput.ideas, briefInput, trace);
            let concepts = (0, concept_util_1.buildConcepts)(ideatorOutput, criticOutput, {
                usedFallback: ideatorResult.usedFallback,
                fallbackReason: ideatorResult.fallbackReason,
            });
            await trace({
                step: 'critic_done',
                actor: 'CriticAgent',
                direction: 'internal',
                summary: `${concepts.length} concepts for user`,
                response: criticOutput,
            });
            await job.updateProgress(72);
            await this.setStep(agentRunId, 'previews');
            const fluxPreviewCreative = this.config.get('CREATIVE_FLUX_PREVIEW_ENABLED', 'false') === 'true';
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
                    criticOutput: criticOutput,
                    conceptsOutput: concepts,
                    status: client_1.AgentRunStatus.awaiting_idea_selection,
                    currentStep: 'await_selection',
                    finishedAt: new Date(),
                },
            });
            await job.updateProgress(100);
            this.logger.log(`Agent run ${agentRunId}: ${concepts.length} concepts ready for selection`);
        }
        catch (err) {
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
                data: { status: client_1.AgentRunStatus.failed, error: message, finishedAt: new Date() },
            });
            throw err;
        }
    }
    buildBriefInput(request, includeCatalogMode = true) {
        return {
            userQuery: request.userPrompt,
            category: request.category,
            budgetMin: includeCatalogMode ? request.budgetMin : null,
            budgetMax: includeCatalogMode ? request.budgetMax : null,
            quantity: request.quantity,
            colors: request.colors ?? [],
            notes: request.notes,
            allowedItems: includeCatalogMode ? (request.allowedItems ?? []) : [],
            forbiddenItems: includeCatalogMode ? (request.forbiddenItems ?? []) : [],
            hasLogo: request.assets.some((a) => a.type === 'logo'),
            includeCatalogConstraints: includeCatalogMode,
        };
    }
    async setStep(agentRunId, step) {
        await this.prisma.agentRun.update({
            where: { id: agentRunId },
            data: { currentStep: step },
        });
        this.logger.log(`AgentRun ${agentRunId} → ${step}`);
    }
};
exports.AgentRunProcessor = AgentRunProcessor;
exports.AgentRunProcessor = AgentRunProcessor = AgentRunProcessor_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        prisma_service_1.PrismaService,
        ideator_agent_1.IdeatorAgent,
        critic_agent_1.CriticAgent,
        concept_preview_service_1.ConceptPreviewService,
        catalog_concept_service_1.CatalogConceptService,
        agent_debug_service_1.AgentDebugService])
], AgentRunProcessor);
//# sourceMappingURL=agent-run.processor.js.map
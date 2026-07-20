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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GenerationService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const generation_queue_decorator_1 = require("./generation-queue.decorator");
const bullmq_1 = require("bullmq");
const prisma_service_1 = require("../prisma/prisma.service");
const requests_service_1 = require("../requests/requests.service");
const generation_queue_1 = require("./generation.queue");
const client_1 = require("@prisma/client");
const generation_snapshot_util_1 = require("./generation-snapshot.util");
const agent_run_queue_1 = require("../agents/agent-run.queue");
const env_util_1 = require("../security/env.util");
let GenerationService = class GenerationService {
    constructor(prisma, config, requestsService, queue) {
        this.prisma = prisma;
        this.config = config;
        this.requestsService = requestsService;
        this.queue = queue;
    }
    async syncRequestProducts(requestId, productIds) {
        await this.prisma.requestItem.deleteMany({ where: { requestId } });
        if (productIds.length === 0)
            return;
        await this.prisma.requestItem.createMany({
            data: productIds.map((productId) => ({ requestId, productId })),
        });
    }
    validateGenerationInput(aiStyle, request) {
        if (aiStyle === 'creative') {
            const hasLogo = request.assets.some((a) => a.type === 'logo');
            if (!hasLogo) {
                throw new common_1.BadRequestException('Загрузите логотип — в креативном режиме он обязателен и передаётся в генерацию');
            }
            return;
        }
        if (request.items.length === 0) {
            throw new common_1.BadRequestException('Выберите хотя бы один товар перед генерацией');
        }
    }
    async validateCatalogConcept(requestId, chosenIdeaTitle) {
        const title = chosenIdeaTitle?.trim();
        if (!title) {
            throw new common_1.BadRequestException('Выберите одну из 5 концепций перед генерацией фото');
        }
        const run = await this.prisma.agentRun.findUnique({ where: { requestId } });
        if (!run?.conceptsOutput) {
            throw new common_1.BadRequestException('Сначала подберите концепции из каталога');
        }
        const okStatus = run.status === client_1.AgentRunStatus.awaiting_idea_selection ||
            run.status === client_1.AgentRunStatus.idea_selected;
        if (!okStatus) {
            throw new common_1.BadRequestException(run.status === client_1.AgentRunStatus.running || run.status === client_1.AgentRunStatus.queued
                ? 'Дождитесь завершения подбора концепций'
                : 'Подберите концепции заново');
        }
    }
    async validateCreativeConcept(requestId, chosenIdeaTitle) {
        if (!(0, agent_run_queue_1.isCreativeAgentPipelineEnabled)(this.config))
            return;
        const title = chosenIdeaTitle?.trim();
        if (!title) {
            throw new common_1.BadRequestException('Выберите одну из 5 концепций перед генерацией фото');
        }
        const run = await this.prisma.agentRun.findUnique({ where: { requestId } });
        if (!run?.ideatorOutput || !run.criticOutput) {
            throw new common_1.BadRequestException('Сначала подберите концепции — нажмите «Подобрать концепции»');
        }
        const okStatus = run.status === client_1.AgentRunStatus.awaiting_idea_selection ||
            run.status === client_1.AgentRunStatus.idea_selected;
        if (!okStatus) {
            throw new common_1.BadRequestException(run.status === client_1.AgentRunStatus.running || run.status === client_1.AgentRunStatus.queued
                ? 'Дождитесь завершения подбора концепций'
                : 'Подберите концепции заново');
        }
    }
    async startGeneration(requestId, options = {}) {
        const debug = (0, env_util_1.resolveDebugFlag)(options.debug);
        const mode = options.mode ?? 'mockup';
        const aiStyle = options.aiStyle ?? 'catalog';
        const chosenIdeaTitle = options.chosenIdeaTitle?.trim();
        if (aiStyle === 'creative') {
            await this.syncRequestProducts(requestId, []);
        }
        else if (options.productIds?.length) {
            await this.syncRequestProducts(requestId, options.productIds);
        }
        const request = await this.requestsService.findOne(requestId);
        this.validateGenerationInput(aiStyle, request);
        if (aiStyle === 'creative' && mode === 'ai') {
            await this.validateCreativeConcept(requestId, chosenIdeaTitle);
        }
        if (aiStyle === 'catalog' && mode === 'ai') {
            await this.validateCatalogConcept(requestId, chosenIdeaTitle);
        }
        if (request.generationCount > 0 || request.generation) {
            throw new common_1.ConflictException('Generation already started for this request');
        }
        if (request.status !== client_1.RequestStatus.ready) {
            throw new common_1.BadRequestException('Request must be in ready status');
        }
        const publicApiUrl = this.config.get('PUBLIC_API_URL', '');
        const inputSnapshot = (0, generation_snapshot_util_1.buildGenerationInputSnapshot)(request, {
            mode,
            aiStyle,
            debug,
            publicApiUrl,
            revision: 1,
            chosenIdeaTitle,
            productTargetColors: options.productTargetColors,
            sceneBrief: options.sceneBrief,
        });
        const generation = await this.prisma.$transaction(async (tx) => {
            const locked = await tx.request.updateMany({
                where: {
                    id: requestId,
                    status: client_1.RequestStatus.ready,
                    generationCount: 0,
                },
                data: {
                    status: client_1.RequestStatus.generating,
                    generationCount: { increment: 1 },
                    generationLockedAt: new Date(),
                },
            });
            if (locked.count !== 1) {
                throw new common_1.ConflictException('Generation already started for this request');
            }
            const gen = await tx.generation.create({
                data: {
                    requestId,
                    status: client_1.GenerationStatus.queued,
                    inputSnapshot: inputSnapshot,
                },
            });
            return gen;
        });
        const job = await this.queue.add('generate', { generationId: generation.id, requestId, debug, mode }, { jobId: generation.id });
        return { jobId: job.id, requestId, debug, regenerated: false };
    }
    async regenerateGeneration(requestId, options = {}) {
        const debug = (0, env_util_1.resolveDebugFlag)(options.debug);
        const mode = options.mode ?? 'mockup';
        const aiStyle = options.aiStyle ?? 'catalog';
        const chosenIdeaTitle = options.chosenIdeaTitle?.trim();
        if (aiStyle === 'creative') {
            await this.syncRequestProducts(requestId, []);
        }
        else if (options.productIds !== undefined) {
            await this.syncRequestProducts(requestId, options.productIds);
        }
        const request = await this.requestsService.findOne(requestId);
        if (!request.generation) {
            throw new common_1.BadRequestException('Нет предыдущей генерации для перегенерации');
        }
        if (request.status !== client_1.RequestStatus.done && request.status !== client_1.RequestStatus.failed) {
            throw new common_1.BadRequestException('Перегенерация доступна только для готовой или неудачной концепции');
        }
        this.validateGenerationInput(aiStyle, request);
        if (aiStyle === 'creative' && mode === 'ai') {
            await this.validateCreativeConcept(requestId, chosenIdeaTitle);
        }
        if (aiStyle === 'catalog' && mode === 'ai') {
            await this.validateCatalogConcept(requestId, chosenIdeaTitle);
        }
        const revision = request.generationCount + 1;
        const publicApiUrl = this.config.get('PUBLIC_API_URL', '');
        const inputSnapshot = (0, generation_snapshot_util_1.buildGenerationInputSnapshot)(request, {
            mode,
            aiStyle,
            debug,
            publicApiUrl,
            revision,
            chosenIdeaTitle,
            productTargetColors: options.productTargetColors,
            sceneBrief: options.sceneBrief,
        });
        const generationId = request.generation.id;
        await this.prisma.$transaction(async (tx) => {
            const locked = await tx.request.updateMany({
                where: {
                    id: requestId,
                    status: { in: [client_1.RequestStatus.done, client_1.RequestStatus.failed] },
                },
                data: {
                    status: client_1.RequestStatus.generating,
                    generationCount: { increment: 1 },
                    generationLockedAt: new Date(),
                },
            });
            if (locked.count !== 1) {
                throw new common_1.ConflictException('Концепция уже перегенерируется');
            }
            await tx.generation.update({
                where: { id: generationId },
                data: {
                    status: client_1.GenerationStatus.queued,
                    inputSnapshot: inputSnapshot,
                    llmOutput: client_1.Prisma.DbNull,
                    imagePrompt: null,
                    negativePrompt: null,
                    resultImageUrl: null,
                    startedAt: null,
                    finishedAt: null,
                },
            });
        });
        const job = await this.queue.add('generate', { generationId, requestId, debug, mode }, { jobId: `${generationId}-r${revision}` });
        return { jobId: job.id, requestId, debug, regenerated: true, revision };
    }
    async getActiveJobProgress(generationId, generationCount) {
        const candidates = [
            `${generationId}-refine-${generationCount + 1}`,
            `${generationId}-refine-${generationCount}`,
            `${generationId}-r${generationCount + 1}`,
            `${generationId}-r${generationCount}`,
            generationId,
        ];
        const seen = new Set();
        for (const jobId of candidates) {
            if (seen.has(jobId))
                continue;
            seen.add(jobId);
            const job = await this.queue.getJob(jobId);
            if (!job)
                continue;
            const state = await job.getState();
            if (state === 'active' || state === 'waiting' || state === 'delayed') {
                const progress = job.progress;
                return typeof progress === 'number' ? progress : 5;
            }
        }
        return null;
    }
};
exports.GenerationService = GenerationService;
exports.GenerationService = GenerationService = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, common_1.Inject)((0, common_1.forwardRef)(() => requests_service_1.RequestsService))),
    __param(3, (0, generation_queue_decorator_1.InjectQueue)(generation_queue_1.GENERATION_QUEUE)),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        config_1.ConfigService,
        requests_service_1.RequestsService,
        bullmq_1.Queue])
], GenerationService);
//# sourceMappingURL=generation.service.js.map
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
exports.AgentRunService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const env_util_1 = require("../security/env.util");
const generation_queue_decorator_1 = require("../generation/generation-queue.decorator");
const bullmq_1 = require("bullmq");
const prisma_service_1 = require("../prisma/prisma.service");
const client_1 = require("@prisma/client");
const agent_run_queue_1 = require("./agent-run.queue");
const previous_generation_util_1 = require("./previous-generation.util");
let AgentRunService = class AgentRunService {
    constructor(prisma, config, queue) {
        this.prisma = prisma;
        this.config = config;
        this.queue = queue;
    }
    assertEnabled() {
        if (!(0, agent_run_queue_1.isCreativeAgentPipelineEnabled)(this.config) && !(0, agent_run_queue_1.isAgentsEnabled)(this.config)) {
            throw new common_1.ServiceUnavailableException('Agent pipeline disabled — включите OPENROUTER_ENABLED или AGENTS_ENABLED');
        }
    }
    async start(requestId, options = {}) {
        this.assertEnabled();
        const aiStyle = options.aiStyle ?? 'creative';
        if (aiStyle !== 'creative' && aiStyle !== 'catalog') {
            throw new common_1.BadRequestException('aiStyle must be creative or catalog');
        }
        const request = await this.prisma.request.findUnique({
            where: { id: requestId },
            include: { agentRun: true },
        });
        if (!request)
            throw new common_1.NotFoundException('Request not found');
        if (!request.userPrompt?.trim()) {
            throw new common_1.BadRequestException('Опишите задачу в брифе');
        }
        await this.prisma.requestItem.deleteMany({ where: { requestId } });
        if (request.agentRun && ['queued', 'running'].includes(request.agentRun.status)) {
            throw new common_1.ConflictException('Подбор концепций уже выполняется');
        }
        let generationHistory = (0, previous_generation_util_1.readGenerationHistory)(request.agentRun?.routerOutput);
        if (request.agentRun?.conceptsOutput) {
            const latest = (0, previous_generation_util_1.extractFromConceptsOutput)(request.agentRun.conceptsOutput);
            if (latest.productIds.length || latest.conceptTitles.length) {
                generationHistory = (0, previous_generation_util_1.mergeGenerationHistory)(generationHistory, latest);
            }
        }
        const debug = (0, env_util_1.resolveDebugFlag)(options.debug);
        const agentRun = await this.prisma.agentRun.upsert({
            where: { requestId },
            create: {
                requestId,
                status: client_1.AgentRunStatus.queued,
                currentStep: 'ideator',
                debugEnabled: debug,
                debugLog: debug ? [] : undefined,
            },
            update: {
                status: client_1.AgentRunStatus.queued,
                currentStep: 'ideator',
                debugEnabled: debug,
                debugLog: debug ? [] : undefined,
                route: null,
                routerOutput: generationHistory
                    ? { generationHistory }
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
        await this.queue.add('concepts', {
            agentRunId: agentRun.id,
            requestId,
            debug,
            aiStyle,
            generationHistory,
        }, { jobId: `${agentRun.id}-${Date.now()}` });
        return this.getByRequestId(requestId);
    }
    async selectConcept(requestId, chosenIdeaTitle) {
        this.assertEnabled();
        const run = await this.prisma.agentRun.findUnique({ where: { requestId } });
        if (!run)
            throw new common_1.NotFoundException('Сначала подберите концепции');
        if (run.status !== client_1.AgentRunStatus.awaiting_idea_selection && run.status !== client_1.AgentRunStatus.idea_selected) {
            throw new common_1.BadRequestException(`Нельзя выбрать концепцию в статусе ${run.status}`);
        }
        const title = chosenIdeaTitle.trim();
        if (!title)
            throw new common_1.BadRequestException('chosenIdeaTitle required');
        const concepts = run.conceptsOutput ?? [];
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
                status: client_1.AgentRunStatus.idea_selected,
                currentStep: 'await_selection',
            },
        });
        return this.getByRequestId(requestId);
    }
    async continue(requestId, body) {
        if (body.chosenIdeaTitle) {
            return this.selectConcept(requestId, body.chosenIdeaTitle);
        }
        throw new common_1.BadRequestException('chosenIdeaTitle required');
    }
    async retry(requestId, options) {
        let aiStyle = options?.aiStyle;
        if (!aiStyle) {
            const existing = await this.prisma.agentRun.findUnique({ where: { requestId } });
            const stored = existing?.aiStyle;
            aiStyle = stored === 'catalog' || stored === 'creative' ? stored : 'creative';
        }
        return this.start(requestId, { aiStyle });
    }
    async getByRequestId(requestId) {
        const run = await this.prisma.agentRun.findUnique({ where: { requestId } });
        if (!run)
            return null;
        return run;
    }
};
exports.AgentRunService = AgentRunService;
exports.AgentRunService = AgentRunService = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, generation_queue_decorator_1.InjectQueue)(agent_run_queue_1.AGENT_RUN_QUEUE)),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        config_1.ConfigService,
        bullmq_1.Queue])
], AgentRunService);
//# sourceMappingURL=agent-run.service.js.map
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
exports.RefineVisualizationService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const generation_queue_decorator_1 = require("./generation-queue.decorator");
const bullmq_1 = require("bullmq");
const prisma_service_1 = require("../prisma/prisma.service");
const requests_service_1 = require("../requests/requests.service");
const generation_queue_1 = require("./generation.queue");
const client_1 = require("@prisma/client");
const common_2 = require("@nestjs/common");
const concept_result_util_1 = require("../generation/concept-result.util");
const logo_reference_util_1 = require("../generation/logo-reference.util");
let RefineVisualizationService = class RefineVisualizationService {
    constructor(prisma, config, requestsService, queue) {
        this.prisma = prisma;
        this.config = config;
        this.requestsService = requestsService;
        this.queue = queue;
    }
    async startRefinement(requestId, options) {
        const brief = options.refinementBrief?.trim();
        if (!brief || brief.length < 8) {
            throw new common_1.BadRequestException('Опишите, что изменить в визуализации (минимум 8 символов)');
        }
        const request = await this.requestsService.findOne(requestId);
        if (!request.generation?.resultImageUrl) {
            throw new common_1.BadRequestException('Сначала создайте визуализацию');
        }
        if (request.status === client_1.RequestStatus.generating) {
            throw new common_1.ConflictException('Генерация уже выполняется');
        }
        if (request.status !== client_1.RequestStatus.done) {
            throw new common_1.BadRequestException('Перегенерация доступна только для готовой визуализации');
        }
        const snapshot = request.generation.inputSnapshot;
        const chosenIdeaTitle = options.chosenIdeaTitle?.trim() ||
            snapshot?.chosenIdeaTitle?.trim() ||
            '';
        let sourceImageUrl = options.sourceImageUrl?.trim();
        if (sourceImageUrl) {
            sourceImageUrl = (0, logo_reference_util_1.normalizeAssetPath)(sourceImageUrl);
        }
        else if (chosenIdeaTitle) {
            const conceptResult = (0, concept_result_util_1.getConceptResult)(request.generation.conceptResults, chosenIdeaTitle);
            sourceImageUrl = conceptResult?.resultImageUrl ?? undefined;
        }
        sourceImageUrl = sourceImageUrl || request.generation.resultImageUrl;
        if (!sourceImageUrl?.trim()) {
            throw new common_1.BadRequestException('Не найдено исходное фото для перегенерации');
        }
        const generationId = request.generation.id;
        const revision = request.generationCount + 1;
        await this.prisma.$transaction(async (tx) => {
            const locked = await tx.request.updateMany({
                where: { id: requestId, status: client_1.RequestStatus.done },
                data: {
                    status: client_1.RequestStatus.generating,
                    generationCount: { increment: 1 },
                    generationLockedAt: new Date(),
                },
            });
            if (locked.count !== 1) {
                throw new common_1.ConflictException('Перегенерация уже выполняется');
            }
            await tx.generation.update({
                where: { id: generationId },
                data: { status: client_1.GenerationStatus.generating, startedAt: new Date() },
            });
        });
        const job = await this.queue.add('refine', {
            generationId,
            requestId,
            jobType: 'refine',
            refinementBrief: brief,
            sourceImageUrl,
            chosenIdeaTitle: chosenIdeaTitle || undefined,
            mode: 'ai',
        }, { jobId: `${generationId}-refine-${revision}` });
        return {
            jobId: job.id,
            requestId,
            revision,
            refining: true,
        };
    }
};
exports.RefineVisualizationService = RefineVisualizationService;
exports.RefineVisualizationService = RefineVisualizationService = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, common_2.Inject)((0, common_2.forwardRef)(() => requests_service_1.RequestsService))),
    __param(3, (0, generation_queue_decorator_1.InjectQueue)(generation_queue_1.GENERATION_QUEUE)),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        config_1.ConfigService,
        requests_service_1.RequestsService,
        bullmq_1.Queue])
], RefineVisualizationService);
//# sourceMappingURL=refine-visualization.service.js.map
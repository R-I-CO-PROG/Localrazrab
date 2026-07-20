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
exports.RequestsController = void 0;
const common_1 = require("@nestjs/common");
const throttler_1 = require("@nestjs/throttler");
const requests_service_1 = require("./requests.service");
const create_request_dto_1 = require("./dto/create-request.dto");
const update_request_dto_1 = require("./dto/update-request.dto");
const generation_service_1 = require("../generation/generation.service");
const generate_request_dto_1 = require("./dto/generate-request.dto");
const refine_visualization_dto_1 = require("./dto/refine-visualization.dto");
const refine_visualization_service_1 = require("../generation/refine-visualization.service");
const parse_brief_dto_1 = require("./dto/parse-brief.dto");
const AI_THROTTLE = { ai: { limit: 30, ttl: 3_600_000 } };
let RequestsController = class RequestsController {
    constructor(requestsService, generationService, refineVisualizationService) {
        this.requestsService = requestsService;
        this.generationService = generationService;
        this.refineVisualizationService = refineVisualizationService;
    }
    create(dto) {
        return this.requestsService.create(dto);
    }
    parseBrief(dto) {
        return this.requestsService.parseBrief(dto.userPrompt);
    }
    extractParametersAlias(body) {
        return this.requestsService.extractParameters(body.requestId);
    }
    async findOne(id) {
        const request = await this.requestsService.findOne(id);
        if (request.status === 'generating' && request.generation?.id) {
            const generationProgress = await this.generationService.getActiveJobProgress(request.generation.id, request.generationCount);
            return { ...request, generationProgress };
        }
        return request;
    }
    update(id, dto) {
        return this.requestsService.update(id, dto);
    }
    submit(id) {
        return this.requestsService.submit(id);
    }
    extractParameters(id) {
        return this.requestsService.extractParameters(id);
    }
    suggestProducts(id) {
        return this.requestsService.suggestProducts(id);
    }
    suggestProductAdd(id, body) {
        return this.requestsService.suggestProductAdd(id, body);
    }
    generate(id, dto) {
        return this.generationService.startGeneration(id, {
            debug: dto.debug ?? false,
            mode: dto.mode ?? 'mockup',
            productIds: dto.productIds,
            aiStyle: dto.aiStyle,
            chosenIdeaTitle: dto.chosenIdeaTitle,
            productTargetColors: dto.productTargetColors,
            sceneBrief: dto.sceneBrief,
        });
    }
    regenerate(id, dto) {
        return this.generationService.regenerateGeneration(id, {
            debug: dto.debug ?? false,
            mode: dto.mode ?? 'mockup',
            productIds: dto.productIds,
            aiStyle: dto.aiStyle,
            chosenIdeaTitle: dto.chosenIdeaTitle,
            productTargetColors: dto.productTargetColors,
            sceneBrief: dto.sceneBrief,
        });
    }
    refineVisualization(id, dto) {
        return this.refineVisualizationService.startRefinement(id, {
            refinementBrief: dto.refinementBrief,
            sourceImageUrl: dto.sourceImageUrl,
            chosenIdeaTitle: dto.chosenIdeaTitle,
        });
    }
};
exports.RequestsController = RequestsController;
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_request_dto_1.CreateRequestDto]),
    __metadata("design:returntype", void 0)
], RequestsController.prototype, "create", null);
__decorate([
    (0, throttler_1.Throttle)(AI_THROTTLE),
    (0, common_1.Post)('parse-brief'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [parse_brief_dto_1.ParseBriefDto]),
    __metadata("design:returntype", void 0)
], RequestsController.prototype, "parseBrief", null);
__decorate([
    (0, throttler_1.Throttle)(AI_THROTTLE),
    (0, common_1.Post)('parameters/extract'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], RequestsController.prototype, "extractParametersAlias", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], RequestsController.prototype, "findOne", null);
__decorate([
    (0, common_1.Patch)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_request_dto_1.UpdateRequestDto]),
    __metadata("design:returntype", void 0)
], RequestsController.prototype, "update", null);
__decorate([
    (0, common_1.Post)(':id/submit'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], RequestsController.prototype, "submit", null);
__decorate([
    (0, throttler_1.Throttle)(AI_THROTTLE),
    (0, common_1.Post)(':id/extract-parameters'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], RequestsController.prototype, "extractParameters", null);
__decorate([
    (0, throttler_1.Throttle)(AI_THROTTLE),
    (0, common_1.Post)(':id/suggest-products'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], RequestsController.prototype, "suggestProducts", null);
__decorate([
    (0, throttler_1.Throttle)(AI_THROTTLE),
    (0, common_1.Post)(':id/suggest-product-add'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], RequestsController.prototype, "suggestProductAdd", null);
__decorate([
    (0, throttler_1.Throttle)(AI_THROTTLE),
    (0, common_1.Post)(':id/generate'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, generate_request_dto_1.GenerateRequestDto]),
    __metadata("design:returntype", void 0)
], RequestsController.prototype, "generate", null);
__decorate([
    (0, throttler_1.Throttle)(AI_THROTTLE),
    (0, common_1.Post)(':id/regenerate'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, generate_request_dto_1.GenerateRequestDto]),
    __metadata("design:returntype", void 0)
], RequestsController.prototype, "regenerate", null);
__decorate([
    (0, throttler_1.Throttle)(AI_THROTTLE),
    (0, common_1.Post)(':id/refine-visualization'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, refine_visualization_dto_1.RefineVisualizationDto]),
    __metadata("design:returntype", void 0)
], RequestsController.prototype, "refineVisualization", null);
exports.RequestsController = RequestsController = __decorate([
    (0, common_1.Controller)('requests'),
    __metadata("design:paramtypes", [requests_service_1.RequestsService,
        generation_service_1.GenerationService,
        refine_visualization_service_1.RefineVisualizationService])
], RequestsController);
//# sourceMappingURL=requests.controller.js.map
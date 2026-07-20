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
exports.AgentRunController = void 0;
const common_1 = require("@nestjs/common");
const throttler_1 = require("@nestjs/throttler");
const agent_run_service_1 = require("./agent-run.service");
const AI_THROTTLE = { ai: { limit: 30, ttl: 3_600_000 } };
let AgentRunController = class AgentRunController {
    constructor(agentRunService) {
        this.agentRunService = agentRunService;
    }
    start(requestId, body) {
        return this.agentRunService.start(requestId, {
            debug: body?.debug ?? false,
            aiStyle: body?.aiStyle ?? 'creative',
        });
    }
    async get(requestId) {
        const run = await this.agentRunService.getByRequestId(requestId);
        if (!run)
            throw new common_1.NotFoundException('Agent run not found');
        return run;
    }
    selectConcept(requestId, body) {
        return this.agentRunService.selectConcept(requestId, body.chosenIdeaTitle);
    }
    continue(requestId, body) {
        return this.agentRunService.continue(requestId, body);
    }
    retry(requestId, body) {
        return this.agentRunService.retry(requestId, { aiStyle: body?.aiStyle });
    }
};
exports.AgentRunController = AgentRunController;
__decorate([
    (0, throttler_1.Throttle)(AI_THROTTLE),
    (0, common_1.Post)(),
    __param(0, (0, common_1.Param)('requestId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], AgentRunController.prototype, "start", null);
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Param)('requestId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AgentRunController.prototype, "get", null);
__decorate([
    (0, common_1.Post)('select'),
    __param(0, (0, common_1.Param)('requestId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], AgentRunController.prototype, "selectConcept", null);
__decorate([
    (0, throttler_1.Throttle)(AI_THROTTLE),
    (0, common_1.Post)('continue'),
    __param(0, (0, common_1.Param)('requestId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], AgentRunController.prototype, "continue", null);
__decorate([
    (0, throttler_1.Throttle)(AI_THROTTLE),
    (0, common_1.Post)('retry'),
    __param(0, (0, common_1.Param)('requestId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], AgentRunController.prototype, "retry", null);
exports.AgentRunController = AgentRunController = __decorate([
    (0, common_1.Controller)('requests/:requestId/agent-run'),
    __metadata("design:paramtypes", [agent_run_service_1.AgentRunService])
], AgentRunController);
//# sourceMappingURL=agent-run.controller.js.map
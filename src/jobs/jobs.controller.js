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
exports.JobsController = void 0;
const common_1 = require("@nestjs/common");
const bullmq_1 = require("bullmq");
const generation_queue_1 = require("../generation/generation.queue");
const generation_queue_decorator_1 = require("../generation/generation-queue.decorator");
let JobsController = class JobsController {
    constructor(queue) {
        this.queue = queue;
    }
    async getJobStatus(id) {
        const job = await this.queue.getJob(id);
        if (!job)
            throw new common_1.NotFoundException('Job not found');
        const state = await job.getState();
        return {
            id: job.id,
            state,
            progress: job.progress,
            failedReason: state === 'failed' ? job.failedReason : undefined,
        };
    }
};
exports.JobsController = JobsController;
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], JobsController.prototype, "getJobStatus", null);
exports.JobsController = JobsController = __decorate([
    (0, common_1.Controller)('jobs'),
    __param(0, (0, generation_queue_decorator_1.InjectQueue)(generation_queue_1.GENERATION_QUEUE)),
    __metadata("design:paramtypes", [bullmq_1.Queue])
], JobsController);
//# sourceMappingURL=jobs.controller.js.map
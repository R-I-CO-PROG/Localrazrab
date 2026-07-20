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
exports.HealthController = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const throttler_1 = require("@nestjs/throttler");
const bullmq_1 = require("bullmq");
const generation_queue_decorator_1 = require("./generation/generation-queue.decorator");
const generation_queue_1 = require("./generation/generation.queue");
const prisma_service_1 = require("./prisma/prisma.service");
const public_decorator_1 = require("./security/public.decorator");
let HealthController = class HealthController {
    constructor(prisma, config, queue) {
        this.prisma = prisma;
        this.config = config;
        this.queue = queue;
    }
    live() {
        return { ok: true, service: 'suvenir-api' };
    }
    async details() {
        const checks = {};
        try {
            await this.prisma.$queryRaw `SELECT 1`;
            checks.database = { ok: true };
        }
        catch (error) {
            checks.database = { ok: false, error: this.message(error) };
        }
        try {
            await this.queue.waitUntilReady();
            checks.queue = {
                ok: true,
                counts: await this.queue.getJobCounts('waiting', 'active', 'delayed', 'failed'),
            };
        }
        catch (error) {
            checks.queue = { ok: false, error: this.message(error) };
        }
        return {
            ok: Object.values(checks).every((check) => Boolean(check.ok)),
            service: 'suvenir-api',
            uptimeSec: Math.round(process.uptime()),
            providers: {
                llm: this.config.get('LLM_PROVIDER', 'stub'),
                image: this.config.get('IMAGE_PROVIDER', 'local'),
            },
            checks,
        };
    }
    message(error) {
        return error instanceof Error ? error.message : String(error);
    }
};
exports.HealthController = HealthController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, throttler_1.SkipThrottle)(),
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], HealthController.prototype, "live", null);
__decorate([
    (0, common_1.Get)('details'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], HealthController.prototype, "details", null);
exports.HealthController = HealthController = __decorate([
    (0, common_1.Controller)('health'),
    __param(2, (0, generation_queue_decorator_1.InjectQueue)(generation_queue_1.GENERATION_QUEUE)),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        config_1.ConfigService,
        bullmq_1.Queue])
], HealthController);
//# sourceMappingURL=health.controller.js.map
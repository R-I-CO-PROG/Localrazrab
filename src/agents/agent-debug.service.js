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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentDebugService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const agent_debug_types_1 = require("./agent-debug.types");
let AgentDebugService = class AgentDebugService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async append(agentRunId, partial) {
        const run = await this.prisma.agentRun.findUnique({
            where: { id: agentRunId },
            select: { debugEnabled: true, debugLog: true },
        });
        if (!run?.debugEnabled)
            return;
        const entry = (0, agent_debug_types_1.createDebugEntry)(partial);
        const prev = Array.isArray(run.debugLog) ? run.debugLog : [];
        await this.prisma.agentRun.update({
            where: { id: agentRunId },
            data: { debugLog: [...prev, entry] },
        });
    }
    trace(agentRunId, debugEnabled) {
        if (!agentRunId || !debugEnabled) {
            return async () => undefined;
        }
        return (partial) => this.append(agentRunId, partial);
    }
};
exports.AgentDebugService = AgentDebugService;
exports.AgentDebugService = AgentDebugService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], AgentDebugService);
//# sourceMappingURL=agent-debug.service.js.map
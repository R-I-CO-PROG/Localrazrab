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
exports.ConceptPromptService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const prompt_builder_agent_1 = require("./prompt-builder.agent");
const concept_util_1 = require("./concept.util");
let ConceptPromptService = class ConceptPromptService {
    constructor(prisma, promptBuilder) {
        this.prisma = prisma;
        this.promptBuilder = promptBuilder;
    }
    async buildPromptForGeneration(requestId, chosenIdeaTitle, trace) {
        const run = await this.prisma.agentRun.findUnique({ where: { requestId } });
        if (!run) {
            throw new common_1.BadRequestException('Сначала подберите концепции (запустите агентов)');
        }
        if (!run.ideatorOutput || !run.criticOutput) {
            throw new common_1.BadRequestException('Концепции ещё не готовы — дождитесь завершения агентов');
        }
        const ideatorOutput = run.ideatorOutput;
        const concepts = run.conceptsOutput ??
            (0, concept_util_1.buildConcepts)(ideatorOutput, run.criticOutput);
        const concept = (0, concept_util_1.findConceptByTitle)(concepts, chosenIdeaTitle);
        if (!concept) {
            throw new common_1.BadRequestException(`Концепция «${chosenIdeaTitle}» не найдена среди топ‑5`);
        }
        const request = await this.prisma.request.findUniqueOrThrow({
            where: { id: requestId },
            include: { assets: true },
        });
        const chosenIdea = (0, concept_util_1.findIdeatorIdeaByTitle)(ideatorOutput, chosenIdeaTitle) ?? concept;
        const logoAsset = request.assets.find((a) => a.type === 'logo');
        const promptOutput = await this.promptBuilder.buildPrompt({
            userQuery: request.userPrompt,
            chosenIdea,
            category: request.category,
            budgetMin: request.budgetMin,
            budgetMax: request.budgetMax,
            quantity: request.quantity,
            colors: request.colors ?? [],
            notes: request.notes,
            hasLogo: Boolean(logoAsset),
            trace,
        });
        await this.prisma.agentRun.update({
            where: { id: run.id },
            data: {
                chosenIdeaTitle,
                promptOutput: promptOutput,
                status: client_1.AgentRunStatus.idea_selected,
            },
        });
        return { promptOutput, concept };
    }
};
exports.ConceptPromptService = ConceptPromptService;
exports.ConceptPromptService = ConceptPromptService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        prompt_builder_agent_1.PromptBuilderAgent])
], ConceptPromptService);
//# sourceMappingURL=concept-prompt.service.js.map
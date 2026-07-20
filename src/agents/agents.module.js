"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentsModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const bullmq_1 = require("bullmq");
const agent_run_queue_1 = require("./agent-run.queue");
const agent_run_service_1 = require("./agent-run.service");
const agent_run_processor_1 = require("./agent-run.processor");
const agent_run_controller_1 = require("./agent-run.controller");
const openrouter_agent_client_1 = require("./openrouter-agent.client");
const ideator_agent_1 = require("./ideator.agent");
const critic_agent_1 = require("./critic.agent");
const prompt_builder_agent_1 = require("./prompt-builder.agent");
const agent_debug_service_1 = require("./agent-debug.service");
const concept_prompt_service_1 = require("./concept-prompt.service");
const catalog_concept_service_1 = require("./catalog-concept.service");
const catalog_ideator_agent_1 = require("./catalog-ideator.agent");
const catalog_critic_agent_1 = require("./catalog-critic.agent");
const concept_preview_service_1 = require("./concept-preview.service");
const generation_module_1 = require("../generation/generation.module");
let AgentsModule = class AgentsModule {
};
exports.AgentsModule = AgentsModule;
exports.AgentsModule = AgentsModule = __decorate([
    (0, common_1.Module)({
        imports: [(0, common_1.forwardRef)(() => generation_module_1.GenerationModule)],
        controllers: [agent_run_controller_1.AgentRunController],
        providers: [
            agent_run_service_1.AgentRunService,
            agent_run_processor_1.AgentRunProcessor,
            agent_debug_service_1.AgentDebugService,
            concept_prompt_service_1.ConceptPromptService,
            concept_preview_service_1.ConceptPreviewService,
            catalog_concept_service_1.CatalogConceptService,
            catalog_ideator_agent_1.CatalogIdeatorAgent,
            catalog_critic_agent_1.CatalogCriticAgent,
            openrouter_agent_client_1.OpenrouterAgentClient,
            ideator_agent_1.IdeatorAgent,
            critic_agent_1.CriticAgent,
            prompt_builder_agent_1.PromptBuilderAgent,
            {
                provide: `BULLMQ_QUEUE_${agent_run_queue_1.AGENT_RUN_QUEUE}`,
                useFactory: (config) => {
                    const redisUrl = config.get('REDIS_URL', 'redis://localhost:6379');
                    return new bullmq_1.Queue(agent_run_queue_1.AGENT_RUN_QUEUE, { connection: { url: redisUrl } });
                },
                inject: [config_1.ConfigService],
            },
        ],
        exports: [agent_run_service_1.AgentRunService, concept_prompt_service_1.ConceptPromptService, prompt_builder_agent_1.PromptBuilderAgent],
    })
], AgentsModule);
//# sourceMappingURL=agents.module.js.map
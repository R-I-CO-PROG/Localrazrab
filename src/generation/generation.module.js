"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GenerationModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const bullmq_1 = require("bullmq");
const generation_service_1 = require("./generation.service");
const refine_visualization_service_1 = require("./refine-visualization.service");
const generation_processor_1 = require("./generation.processor");
const generation_queue_1 = require("./generation.queue");
const requests_module_1 = require("../requests/requests.module");
const agents_module_1 = require("../agents/agents.module");
const stub_llm_provider_1 = require("../providers/llm/stub-llm.provider");
const deepseek_llm_provider_1 = require("../providers/llm/deepseek-llm.provider");
const gemini_llm_provider_1 = require("../providers/llm/gemini-llm.provider");
const openrouter_llm_provider_1 = require("../providers/llm/openrouter-llm.provider");
const llm_provider_1 = require("../providers/llm/llm.provider");
const llm_brief_service_1 = require("../providers/llm/llm-brief.service");
const stub_image_provider_1 = require("../providers/image/stub-image.provider");
const pollinations_image_provider_1 = require("../providers/image/pollinations-image.provider");
const local_composite_image_provider_1 = require("../providers/image/local-composite-image.provider");
const stable_horde_image_provider_1 = require("../providers/image/stable-horde-image.provider");
const huggingface_image_provider_1 = require("../providers/image/huggingface-image.provider");
const image_provider_1 = require("../providers/image/image.provider");
const branded_mockup_image_provider_1 = require("../providers/image/branded-mockup-image.provider");
const ai_enhanced_mockup_image_provider_1 = require("../providers/image/ai-enhanced-mockup-image.provider");
const openrouter_image_provider_1 = require("../providers/image/openrouter-image.provider");
let GenerationModule = class GenerationModule {
};
exports.GenerationModule = GenerationModule;
exports.GenerationModule = GenerationModule = __decorate([
    (0, common_1.Module)({
        imports: [(0, common_1.forwardRef)(() => requests_module_1.RequestsModule), (0, common_1.forwardRef)(() => agents_module_1.AgentsModule)],
        providers: [
            generation_service_1.GenerationService,
            refine_visualization_service_1.RefineVisualizationService,
            generation_processor_1.GenerationProcessor,
            stub_llm_provider_1.StubLlmProvider,
            deepseek_llm_provider_1.DeepseekLlmProvider,
            gemini_llm_provider_1.GeminiLlmProvider,
            openrouter_llm_provider_1.OpenrouterLlmProvider,
            llm_provider_1.LlmProviderFactory,
            llm_brief_service_1.LlmBriefService,
            stub_image_provider_1.StubImageProvider,
            pollinations_image_provider_1.PollinationsImageProvider,
            local_composite_image_provider_1.LocalCompositeImageProvider,
            stable_horde_image_provider_1.StableHordeImageProvider,
            huggingface_image_provider_1.HuggingFaceImageProvider,
            branded_mockup_image_provider_1.BrandedMockupImageProvider,
            ai_enhanced_mockup_image_provider_1.AiEnhancedMockupImageProvider,
            openrouter_image_provider_1.OpenrouterImageProvider,
            image_provider_1.ImageProviderFactory,
            {
                provide: `BULLMQ_QUEUE_${generation_queue_1.GENERATION_QUEUE}`,
                useFactory: (config) => {
                    const redisUrl = config.get('REDIS_URL', 'redis://localhost:6379');
                    return new bullmq_1.Queue(generation_queue_1.GENERATION_QUEUE, { connection: { url: redisUrl } });
                },
                inject: [config_1.ConfigService],
            },
        ],
        exports: [
            generation_service_1.GenerationService,
            refine_visualization_service_1.RefineVisualizationService,
            llm_brief_service_1.LlmBriefService,
            llm_provider_1.LlmProviderFactory,
            openrouter_image_provider_1.OpenrouterImageProvider,
            `BULLMQ_QUEUE_${generation_queue_1.GENERATION_QUEUE}`,
        ],
    })
], GenerationModule);
//# sourceMappingURL=generation.module.js.map
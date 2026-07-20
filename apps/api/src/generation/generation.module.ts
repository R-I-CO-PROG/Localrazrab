import { Module, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { GenerationService } from './generation.service';
import { RefineVisualizationService } from './refine-visualization.service';
import { GenerationProcessor } from './generation.processor';
import { GENERATION_QUEUE } from './generation.queue';
import { RequestsModule } from '../requests/requests.module';
import { AgentsModule } from '../agents/agents.module';
import { StubLlmProvider } from '../providers/llm/stub-llm.provider';
import { DeepseekLlmProvider } from '../providers/llm/deepseek-llm.provider';
import { GeminiLlmProvider } from '../providers/llm/gemini-llm.provider';
import { OpenrouterLlmProvider } from '../providers/llm/openrouter-llm.provider';
import { LlmProviderFactory } from '../providers/llm/llm.provider';
import { LlmBriefService } from '../providers/llm/llm-brief.service';
import { StubImageProvider } from '../providers/image/stub-image.provider';
import { PollinationsImageProvider } from '../providers/image/pollinations-image.provider';
import { LocalCompositeImageProvider } from '../providers/image/local-composite-image.provider';
import { StableHordeImageProvider } from '../providers/image/stable-horde-image.provider';
import { HuggingFaceImageProvider } from '../providers/image/huggingface-image.provider';
import { ImageProviderFactory } from '../providers/image/image.provider';
import { BrandedMockupImageProvider } from '../providers/image/branded-mockup-image.provider';
import { AiEnhancedMockupImageProvider } from '../providers/image/ai-enhanced-mockup-image.provider';
import { OpenrouterImageProvider } from '../providers/image/openrouter-image.provider';

@Module({
  imports: [forwardRef(() => RequestsModule), forwardRef(() => AgentsModule)],
  providers: [
    GenerationService,
    RefineVisualizationService,
    GenerationProcessor,
    StubLlmProvider,
    DeepseekLlmProvider,
    GeminiLlmProvider,
    OpenrouterLlmProvider,
    LlmProviderFactory,
    LlmBriefService,
    StubImageProvider,
    PollinationsImageProvider,
    LocalCompositeImageProvider,
    StableHordeImageProvider,
    HuggingFaceImageProvider,
    BrandedMockupImageProvider,
    AiEnhancedMockupImageProvider,
    OpenrouterImageProvider,
    ImageProviderFactory,
    {
      provide: `BULLMQ_QUEUE_${GENERATION_QUEUE}`,
      useFactory: (config: ConfigService) => {
        const redisUrl = config.get<string>('REDIS_URL', 'redis://localhost:6379');
        return new Queue(GENERATION_QUEUE, { connection: { url: redisUrl } });
      },
      inject: [ConfigService],
    },
  ],
  exports: [
    GenerationService,
    RefineVisualizationService,
    LlmBriefService,
    LlmProviderFactory,
    OpenrouterImageProvider,
    `BULLMQ_QUEUE_${GENERATION_QUEUE}`,
  ],
})
export class GenerationModule {}

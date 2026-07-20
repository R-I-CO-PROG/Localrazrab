import { Module, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { AGENT_RUN_QUEUE } from './agent-run.queue';
import { AgentRunService } from './agent-run.service';
import { AgentRunProcessor } from './agent-run.processor';
import { AgentRunController } from './agent-run.controller';
import { OpenrouterAgentClient } from './openrouter-agent.client';
import { IdeatorAgent } from './ideator.agent';
import { CriticAgent } from './critic.agent';
import { PromptBuilderAgent } from './prompt-builder.agent';
import { AgentDebugService } from './agent-debug.service';
import { ConceptPromptService } from './concept-prompt.service';
import { CatalogConceptService } from './catalog-concept.service';
import { CatalogIdeatorAgent } from './catalog-ideator.agent';
import { CatalogCriticAgent } from './catalog-critic.agent';
import { CatalogBuyerAgent } from './catalog-buyer.agent';
import { CatalogNeuralSelectorService } from './catalog-neural-selector.service';
import { CatalogEmbeddingService } from './catalog-embedding.service';
import { ConceptPreviewService } from './concept-preview.service';
import { GenerationModule } from '../generation/generation.module';

@Module({
  imports: [forwardRef(() => GenerationModule)],
  controllers: [AgentRunController],
  providers: [
    AgentRunService,
    AgentRunProcessor,
    AgentDebugService,
    ConceptPromptService,
    ConceptPreviewService,
    CatalogConceptService,
    CatalogIdeatorAgent,
    CatalogCriticAgent,
    CatalogBuyerAgent,
    CatalogNeuralSelectorService,
    CatalogEmbeddingService,
    OpenrouterAgentClient,
    IdeatorAgent,
    CriticAgent,
    PromptBuilderAgent,
    {
      provide: `BULLMQ_QUEUE_${AGENT_RUN_QUEUE}`,
      useFactory: (config: ConfigService) => {
        const redisUrl = config.get<string>('REDIS_URL', 'redis://localhost:6379');
        return new Queue(AGENT_RUN_QUEUE, { connection: { url: redisUrl } });
      },
      inject: [ConfigService],
    },
  ],
  exports: [AgentRunService, ConceptPromptService, PromptBuilderAgent],
})
export class AgentsModule {}

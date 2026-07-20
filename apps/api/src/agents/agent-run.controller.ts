import { Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AgentRunService } from './agent-run.service';

const AI_THROTTLE = { ai: { limit: 30, ttl: 3_600_000 } };

@Controller('requests/:requestId/agent-run')
export class AgentRunController {
  constructor(private readonly agentRunService: AgentRunService) {}

  @Throttle(AI_THROTTLE)
  @Post()
  start(@Param('requestId') requestId: string, @Body() body?: { debug?: boolean; aiStyle?: 'catalog' | 'creative' }) {
    return this.agentRunService.start(requestId, {
      debug: body?.debug ?? false,
      aiStyle: body?.aiStyle ?? 'creative',
    });
  }

  @Get()
  async get(@Param('requestId') requestId: string) {
    const run = await this.agentRunService.getByRequestId(requestId);
    if (!run) throw new NotFoundException('Agent run not found');
    return run;
  }

  @Post('select')
  selectConcept(
    @Param('requestId') requestId: string,
    @Body() body: { chosenIdeaTitle: string },
  ) {
    return this.agentRunService.selectConcept(requestId, body.chosenIdeaTitle);
  }

  @Throttle(AI_THROTTLE)
  @Post('continue')
  continue(
    @Param('requestId') requestId: string,
    @Body() body: { chosenIdeaTitle?: string },
  ) {
    return this.agentRunService.continue(requestId, body);
  }

  @Throttle(AI_THROTTLE)
  @Post('retry')
  retry(
    @Param('requestId') requestId: string,
    @Body() body?: { aiStyle?: 'catalog' | 'creative' },
  ) {
    return this.agentRunService.retry(requestId, { aiStyle: body?.aiStyle });
  }
}

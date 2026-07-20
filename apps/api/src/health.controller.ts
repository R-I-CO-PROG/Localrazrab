import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import { Queue } from 'bullmq';
import { InjectQueue } from './generation/generation-queue.decorator';
import { GENERATION_QUEUE } from './generation/generation.queue';
import { PrismaService } from './prisma/prisma.service';
import { Public } from './security/public.decorator';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @InjectQueue(GENERATION_QUEUE) private readonly queue: Queue,
  ) {}

  /** Liveness — без секретов, для Docker/K8s */
  @Public()
  @SkipThrottle()
  @Get()
  live() {
    return { ok: true, service: 'suvenir-api' };
  }

  /** Детальный статус — только с API-ключом (через BFF или X-API-Key) */
  @Get('details')
  async details() {
    const checks: Record<string, unknown> = {};

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = { ok: true };
    } catch (error) {
      checks.database = { ok: false, error: this.message(error) };
    }

    try {
      await this.queue.waitUntilReady();
      checks.queue = {
        ok: true,
        counts: await this.queue.getJobCounts('waiting', 'active', 'delayed', 'failed'),
      };
    } catch (error) {
      checks.queue = { ok: false, error: this.message(error) };
    }

    return {
      ok: Object.values(checks).every((check) => Boolean((check as { ok?: boolean }).ok)),
      service: 'suvenir-api',
      uptimeSec: Math.round(process.uptime()),
      providers: {
        llm: this.config.get('LLM_PROVIDER', 'stub'),
        image: this.config.get('IMAGE_PROVIDER', 'local'),
      },
      checks,
    };
  }

  private message(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
}

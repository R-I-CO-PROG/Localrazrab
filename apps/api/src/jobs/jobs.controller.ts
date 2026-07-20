import { Controller, Get, Param, NotFoundException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { GENERATION_QUEUE } from '../generation/generation.queue';
import { InjectQueue } from '../generation/generation-queue.decorator';

@Controller('jobs')
export class JobsController {
  constructor(@InjectQueue(GENERATION_QUEUE) private readonly queue: Queue) {}

  @Get(':id')
  async getJobStatus(@Param('id') id: string) {
    const job = await this.queue.getJob(id);
    if (!job) throw new NotFoundException('Job not found');

    const state = await job.getState();
    return {
      id: job.id,
      state,
      progress: job.progress,
      failedReason: state === 'failed' ? job.failedReason : undefined,
    };
  }
}

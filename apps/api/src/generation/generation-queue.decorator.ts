import { Inject } from '@nestjs/common';
import { GENERATION_QUEUE } from './generation.queue';

export const InjectQueue = (name: string) => Inject(`BULLMQ_QUEUE_${name}`);

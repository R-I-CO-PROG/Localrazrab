import { Queue, type ConnectionOptions } from 'bullmq';

export const PRECISION_QUEUE = 'precision-render';

// bullmq bundles its own nested ioredis version, distinct from the one hoisted
// for apps/api — constructing a real `IORedis` instance here trips a structural
// type mismatch against bullmq's ConnectionOptions. A plain options object (the
// same pattern GenerationModule uses for its queue) sidesteps that entirely.
export function createRedisConnection(): ConnectionOptions {
  return {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    maxRetriesPerRequest: null,
  };
}

export const precisionQueue = new Queue(PRECISION_QUEUE, { connection: createRedisConnection() });

export interface PrecisionJobData {
  renderId: string;
}

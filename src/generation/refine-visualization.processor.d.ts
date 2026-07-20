import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OpenrouterImageProvider } from '../providers/image/openrouter-image.provider';
import { GenerationJobData } from './generation.queue';
export declare function processRefineVisualizationJob(job: Job<GenerationJobData>, deps: {
    prisma: PrismaService;
    openrouter: OpenrouterImageProvider;
    logger: Logger;
}): Promise<{
    variantId: string;
    imageUrl: string;
}>;
export declare function ensureInitialVisualizationVariant(prisma: PrismaService, generationId: string, imageUrl: string, imagePrompt?: string | null): Promise<void>;

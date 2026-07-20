import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { RequestsService } from '../requests/requests.service';
import { GenerationJobData } from './generation.queue';
export declare class RefineVisualizationService {
    private readonly prisma;
    private readonly config;
    private readonly requestsService;
    private readonly queue;
    constructor(prisma: PrismaService, config: ConfigService, requestsService: RequestsService, queue: Queue<GenerationJobData>);
    startRefinement(requestId: string, options: {
        refinementBrief: string;
        sourceImageUrl?: string;
        chosenIdeaTitle?: string;
    }): Promise<{
        jobId: string | undefined;
        requestId: string;
        revision: number;
        refining: boolean;
    }>;
}

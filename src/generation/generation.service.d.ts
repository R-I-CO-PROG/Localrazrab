import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { RequestsService } from '../requests/requests.service';
import { GenerationJobData } from './generation.queue';
export declare class GenerationService {
    private readonly prisma;
    private readonly config;
    private readonly requestsService;
    private readonly queue;
    constructor(prisma: PrismaService, config: ConfigService, requestsService: RequestsService, queue: Queue<GenerationJobData>);
    private syncRequestProducts;
    private validateGenerationInput;
    private validateCatalogConcept;
    private validateCreativeConcept;
    startGeneration(requestId: string, options?: {
        debug?: boolean;
        mode?: 'mockup' | 'ai';
        productIds?: string[];
        aiStyle?: 'catalog' | 'creative';
        chosenIdeaTitle?: string;
        productTargetColors?: Array<{
            productId: string;
            color: string;
        }>;
        sceneBrief?: string;
    }): Promise<{
        jobId: string | undefined;
        requestId: string;
        debug: boolean;
        regenerated: boolean;
    }>;
    regenerateGeneration(requestId: string, options?: {
        debug?: boolean;
        mode?: 'mockup' | 'ai';
        productIds?: string[];
        aiStyle?: 'catalog' | 'creative';
        chosenIdeaTitle?: string;
        productTargetColors?: Array<{
            productId: string;
            color: string;
        }>;
        sceneBrief?: string;
    }): Promise<{
        jobId: string | undefined;
        requestId: string;
        debug: boolean;
        regenerated: boolean;
        revision: number;
    }>;
    getActiveJobProgress(generationId: string, generationCount: number): Promise<number | null>;
}

import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { BrandedMockupImageProvider } from '../providers/image/branded-mockup-image.provider';
import type { PromptBuilderOutput } from './contracts';
export declare class AgentImageService {
    private readonly config;
    private readonly prisma;
    private readonly mockup;
    private readonly logger;
    constructor(config: ConfigService, prisma: PrismaService, mockup: BrandedMockupImageProvider);
    generateLocalImage(params: {
        requestId: string;
        agentRunId: string;
        prompt: PromptBuilderOutput;
        productIds: string[];
        colors: string[];
        logoUrl?: string | null;
        category?: string;
        quantity?: number | null;
    }): Promise<string>;
}

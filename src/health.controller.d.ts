import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { PrismaService } from './prisma/prisma.service';
export declare class HealthController {
    private readonly prisma;
    private readonly config;
    private readonly queue;
    constructor(prisma: PrismaService, config: ConfigService, queue: Queue);
    live(): {
        ok: boolean;
        service: string;
    };
    details(): Promise<{
        ok: boolean;
        service: string;
        uptimeSec: number;
        providers: {
            llm: any;
            image: any;
        };
        checks: Record<string, unknown>;
    }>;
    private message;
}

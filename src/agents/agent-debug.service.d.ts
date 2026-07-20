import { PrismaService } from '../prisma/prisma.service';
import { AgentDebugEntry } from './agent-debug.types';
export declare class AgentDebugService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    append(agentRunId: string, partial: Omit<AgentDebugEntry, 'ts'>): Promise<void>;
    trace(agentRunId: string | undefined, debugEnabled: boolean): (partial: Omit<AgentDebugEntry, "ts">) => Promise<void>;
}

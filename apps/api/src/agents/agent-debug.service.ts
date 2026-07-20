import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AgentDebugEntry, createDebugEntry } from './agent-debug.types';

@Injectable()
export class AgentDebugService {
  constructor(private readonly prisma: PrismaService) {}

  async append(agentRunId: string, partial: Omit<AgentDebugEntry, 'ts'>): Promise<void> {
    const run = await this.prisma.agentRun.findUnique({
      where: { id: agentRunId },
      select: { debugEnabled: true, debugLog: true },
    });
    if (!run?.debugEnabled) return;

    const entry = createDebugEntry(partial);
    const prev = Array.isArray(run.debugLog) ? (run.debugLog as unknown as AgentDebugEntry[]) : [];
    await this.prisma.agentRun.update({
      where: { id: agentRunId },
      data: { debugLog: [...prev, entry] as unknown as Prisma.InputJsonValue },
    });
  }

  trace(agentRunId: string | undefined, debugEnabled: boolean) {
    if (!agentRunId || !debugEnabled) {
      return async () => undefined;
    }
    return (partial: Omit<AgentDebugEntry, 'ts'>) => this.append(agentRunId, partial);
  }
}

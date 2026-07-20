export interface AgentDebugEntry {
    ts: string;
    step: string;
    actor: string;
    direction: 'out' | 'in' | 'internal';
    target?: string;
    summary?: string;
    request?: unknown;
    response?: unknown;
    ms?: number;
    error?: string;
}
export type AgentDebugTraceFn = (entry: Omit<AgentDebugEntry, 'ts'>) => void;
export declare function createDebugEntry(partial: Omit<AgentDebugEntry, 'ts'>): AgentDebugEntry;

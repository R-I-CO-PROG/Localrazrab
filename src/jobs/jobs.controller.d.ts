import { Queue } from 'bullmq';
export declare class JobsController {
    private readonly queue;
    constructor(queue: Queue);
    getJobStatus(id: string): Promise<{
        id: string | undefined;
        state: "unknown" | import("bullmq").JobState;
        progress: import("bullmq").JobProgress;
        failedReason: string | undefined;
    }>;
}

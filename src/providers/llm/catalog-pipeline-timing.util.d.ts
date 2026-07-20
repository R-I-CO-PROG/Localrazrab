export interface PipelineTimingStage {
    name: string;
    ms: number;
}
export declare class CatalogPipelineTiming {
    private readonly startedAt;
    private lapAt;
    private readonly stages;
    lap(name: string): void;
    totalMs(): number;
    toRecord(): Record<string, number>;
    toTable(): string;
    stagesSnapshot(): PipelineTimingStage[];
}
export declare function timedStage<T>(timing: CatalogPipelineTiming, name: string, fn: () => Promise<T>): Promise<T>;
export declare function timedStageSync<T>(timing: CatalogPipelineTiming, name: string, fn: () => T): T;

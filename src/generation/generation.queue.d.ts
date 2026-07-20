export declare const GENERATION_QUEUE = "generation";
export type GenerationImageMode = 'mockup' | 'ai';
export type GenerationJobType = 'generate' | 'refine';
export interface GenerationJobData {
    generationId: string;
    requestId: string;
    debug?: boolean;
    mode?: GenerationImageMode;
    jobType?: GenerationJobType;
    refinementBrief?: string;
    sourceImageUrl?: string;
    chosenIdeaTitle?: string;
}

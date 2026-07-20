import type { IdeatorOutput } from './contracts';
export declare function buildLocalIdeatorFallback(input: {
    userQuery: string;
    category?: string;
    colors?: string[];
}): IdeatorOutput;
export declare function isStubLikeDescription(desc: string): boolean;

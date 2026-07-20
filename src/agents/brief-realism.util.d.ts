export declare function briefAllowsFuturism(brief: string): boolean;
export declare function briefSuggestsTransport(brief: string): boolean;
export declare function gimmickPenalty(text: string, brief: string): number;
export declare function realismBoost(text: string, brief: string): number;
export declare function adjustedBriefFitScore(baseScore: number, ideaText: string, brief: string): number;

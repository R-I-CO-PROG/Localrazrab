export interface ReconciledBriefConstraints {
    allowedItems: string[];
    forbiddenItems: string[];
    forbiddenMaterials: string[];
    qualityFloor: 'premium' | 'standard' | null;
    warnings?: string[];
}
export declare function briefRequestsClothing(text: string): boolean;
export declare function briefForbidsClothing(text: string): boolean;
export declare function reconcileBriefConstraints(userPrompt: string, allowedItems: string[], forbiddenItems: string[], budgetMax?: number | null): ReconciledBriefConstraints;
export declare function productViolatesMaterialBan(productName: string, description: string, category: string, forbiddenMaterials: string[]): boolean;

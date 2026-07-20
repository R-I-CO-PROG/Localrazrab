export interface ProjectBriefProfile {
    goal: string | null;
    audience: string | null;
    occasion: string | null;
    brandTone: string | null;
    emotions: string[];
    industry: string | null;
    seasonality: string | null;
    budgetSignal: string | null;
    mustHave: string[];
    forbidden: string[];
    preferredCategories: string[];
    avoidedCategories: string[];
    colorPreferences: string[];
    communicationStyle: string | null;
    positioning: 'practical' | 'premium' | 'wow' | 'balanced' | null;
    usageScenario: string | null;
    projectCategory: string | null;
    briefSummary: string;
}
export declare function extractProjectBriefProfile(input: {
    userPrompt: string;
    projectCategory?: string | null;
    colors?: string[];
    allowedItems?: string[];
    forbiddenItems?: string[];
}): ProjectBriefProfile;
export declare function scoreProjectCategorySoftMatch(productType: string, projectCategory: string | null | undefined): number;
export declare function scoreAllowedItemSoftMatch(productName: string, productDescription: string, allowedItems: string[]): number;
export declare function profileToLlmPayload(profile: ProjectBriefProfile): {
    briefSummary: string;
    goal: string | null;
    audience: string | null;
    occasion: string | null;
    brandTone: string | null;
    desiredEmotions: string[];
    industry: string | null;
    seasonality: string | null;
    budgetConstraints: string | null;
    mustHaveElements: string[];
    prohibitions: string[];
    preferredMerchTypes: string[];
    avoidedMerchTypes: string[];
    colorPreferences: string[];
    communicationStyle: string | null;
    positioning: "premium" | "practical" | "wow" | "balanced" | null;
    usageScenario: string | null;
    projectCategorySoftSignal: string | null;
};

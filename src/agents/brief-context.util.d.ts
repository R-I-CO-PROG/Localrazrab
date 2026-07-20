import { type ProjectBriefProfile } from '../providers/llm/project-brief-profile.util';
export interface AgentBriefContext {
    userQuery: string;
    category?: string;
    budgetMin?: number | null;
    budgetMax?: number | null;
    quantity?: number | null;
    colors?: string[];
    notes?: string | null;
    allowedItems?: string[];
    forbiddenItems?: string[];
    hasLogo?: boolean;
    includeCatalogConstraints?: boolean;
    projectProfile?: ProjectBriefProfile;
}
export declare function buildAgentBriefPayload(ctx: AgentBriefContext): {
    clientBrief: string;
    briefSummary: string;
    projectProfile: {
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
    category: string | null;
    categoryNote: string;
    budgetRubPerUnit: {
        min: number | null;
        max: number | null;
    } | null;
    runQuantity: number | null;
    brandColors: string[];
    constraints: {
        themesToExplore: string[] | null;
        mustAvoid: string[] | null;
    };
    extraNotes: string | null;
    hasLogo: boolean;
    ideaRequirements: {
        explainBriefFit: boolean;
        explainProductRoles: boolean;
        cohesiveSetNotRandomPick: boolean;
        eachIdeaMustStateWhyProductsFit: boolean;
    };
};
export declare function compactIdeaForCritic(idea: {
    title: string;
    hook?: string;
    description: string;
    styleTags?: string[];
    whyItFits?: string;
}): {
    title: string;
    hook: string;
    description: string;
    styleTags: string[];
    whyItFits: string;
};

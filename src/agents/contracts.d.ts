export type AgentRouteType = 'DIRECT_PRODUCT' | 'IDEATION_PIPELINE';
export interface DirectProductQuery {
    keywords: string[];
    colors: string[];
    categoryHints: string[];
    mustInclude: string[];
    mustNotInclude: string[];
}
export interface RouterOutput {
    route: AgentRouteType;
    confidence: number;
    reason: string;
    directProductQuery: DirectProductQuery;
}
export interface IdeatorItem {
    productType: string;
    notes?: string;
    priority: 'must' | 'nice';
}
export interface IdeatorIdea {
    title: string;
    hook?: string;
    description: string;
    items: IdeatorItem[];
    styleTags: string[];
    colorPalette: string[];
    whyItFits: string;
}
export interface IdeatorOutput {
    ideas: IdeatorIdea[];
}
export interface CatalogProductSlot {
    type: string;
    priority: 'must' | 'nice';
    notes?: string;
    positionLabel?: string;
}
export interface CatalogIdeatorIdea {
    title: string;
    composition: string;
    style: string;
    productSlots: CatalogProductSlot[];
    items: string[];
    themeAxis?: string;
    whyItFits: string;
}
export interface CatalogIdeatorOutput {
    ideas: CatalogIdeatorIdea[];
}
export interface CriticTopIdea {
    title: string;
    score: number;
    briefFitScore?: number;
    conceptSummary?: string;
    reasons: string[];
    risks: string[];
    suggestedEdits: string[];
}
export interface CriticOutput {
    topIdeas: CriticTopIdea[];
}
export interface Concept {
    title: string;
    narrative: string;
    description: string;
    items: IdeatorItem[];
    styleTags: string[];
    colorPalette: string[];
    whyItFits: string;
    score?: number;
    reasons?: string[];
    risks?: string[];
    suggestedEdits?: string[];
    previewImageUrl?: string;
    previewProductImageUrls?: string[];
    productIds?: string[];
    catalogProducts?: Array<{
        id: string;
        name: string;
        category: string;
        productType?: string;
        price?: number | null;
        stockAvailable?: number;
        colors?: string[];
        catalogImageUrl?: string;
        imageUrl?: string;
        image?: string;
        sourceUrl?: string | null;
        hasCatalogImage?: boolean;
    }>;
    composition?: string;
    style?: string;
    budgetPerSet?: number | null;
}
export interface PromptBuilderOutput {
    chosenIdeaTitle: string;
    imagePrompt: string;
    negativePrompt: string;
    style: string;
    background: string;
    loopSafe: boolean;
}
export interface DirectProductResult {
    productIds: string[];
    products: Array<{
        id: string;
        name: string;
        category: string;
    }>;
}
export type AgentPipelineStep = 'ideator' | 'critic' | 'previews' | 'await_selection' | 'prompt_builder' | 'image';
export declare const PRODUCT_TYPE_WHITELIST: readonly ["pen", "pencil", "notebook", "mug", "tshirt", "hoodie", "bag", "thermos", "bottle", "cap", "umbrella", "socks", "powerbank", "usb", "badge"];
export declare const AGENT_BLACKLIST: string[];

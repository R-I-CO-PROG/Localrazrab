export interface MockupProductInput {
    name: string;
    imageUrl: string;
    silhouetteUrl?: string;
}
export interface ImageGenerationInput {
    prompt: string;
    negativePrompt: string;
    outputPath: string;
    width?: number;
    height?: number;
    referenceImageUrl?: string;
    referenceImageUrls?: string[];
    imageModel?: string;
    productNames?: string[];
    products?: MockupProductInput[];
    showLabels?: boolean;
    layoutMode?: 'grid' | 'scene';
    category?: string;
    quantity?: number | null;
    silhouetteUrls?: string[];
    catalogImageUrls?: string[];
    colors?: string[];
    logoUrl?: string | null;
    hasLogo?: boolean;
    userPrompt?: string;
    generationMode?: 'mockup' | 'ai';
    aiStyle?: 'catalog' | 'creative';
    llmImagePrompt?: string;
    llmComposition?: string;
    llmStyle?: string;
    catalogColorRules?: string;
    sourceSceneUrl?: string;
    refinementBrief?: string;
    onProgress?: (pct: number) => void | Promise<void>;
}
export interface ImageProvider {
    generate(input: ImageGenerationInput): Promise<string>;
}

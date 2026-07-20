export interface MockupProduct {
    name: string;
    imageUrl: string;
    silhouetteUrl?: string;
}
export interface BrandedMockupInput {
    outputPath: string;
    width?: number;
    height?: number;
    products: MockupProduct[];
    colors?: string[];
    logoUrl?: string | null;
    category?: string;
    quantity?: number | null;
    showLabels?: boolean;
    layoutMode?: 'grid' | 'scene';
}
export declare function composeBrandedMockup(input: BrandedMockupInput): Promise<{
    productCount: number;
    logoAppliedPerProduct: boolean;
}>;

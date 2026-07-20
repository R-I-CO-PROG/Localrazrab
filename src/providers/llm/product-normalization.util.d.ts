import type { CatalogProduct } from './catalog.util';
export interface NormalizedProductMeta {
    rawCategory: string;
    normalizedProductType: string;
    semanticTags: string[];
    useCases: string[];
    audienceFit: string[];
    seasonality: string[];
    styleTags: string[];
    colors: string[];
    priceTier: 'budget' | 'mid' | 'premium' | 'unknown';
    isGiftable: boolean;
    isWearable: boolean;
    isOffice: boolean;
    isOutdoor: boolean;
    isTech: boolean;
}
export declare function normalizeCatalogProduct(product: CatalogProduct): NormalizedProductMeta;
export declare function normalizedMetaForLlm(product: CatalogProduct): {
    id: string;
    name: string;
    rawCategory: string;
    normalizedProductType: string;
    semanticTags: string[];
    useCases: string[];
    priceTier: "premium" | "budget" | "mid" | "unknown";
    colors: string[];
    price: number | null | undefined;
    stockAvailable: number | undefined;
};

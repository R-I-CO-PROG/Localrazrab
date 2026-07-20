import type { CatalogProduct } from './catalog.util';
export declare function extractProductKeywordsFromBrief(brief: string): string[];
export declare function findProductsByBriefKeywords(keywords: string[], catalog: CatalogProduct[], blockedIds: Set<string>, blockedVariants?: Set<string>): CatalogProduct[];

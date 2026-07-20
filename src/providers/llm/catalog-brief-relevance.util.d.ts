import type { CatalogProduct } from './catalog.util';
export declare function parseBriefForbiddenColors(brief: string): string[];
declare const NEGATIVE_PATTERNS: Array<{
    pattern: RegExp;
    penaltyTypes: string[];
    penalty: number;
}>;
export interface BriefRelevanceContext {
    briefNorm: string;
    briefLower: string;
    brandColors: string[];
    forbiddenColors: string[];
    briefTokens: string[];
    flags: {
        summer: boolean;
        winter: boolean;
        cozyWinter: boolean;
        tech: boolean;
        sport: boolean;
        health: boolean;
        youthCreative: boolean;
        eco: boolean;
        picnic: boolean;
        outdoor: boolean;
        creative: boolean;
        vipLuxury: boolean;
        office: boolean;
        jewelryVip: boolean;
        apparelBrief: boolean;
        sportBriefDarkBan: boolean;
    };
    activeNegativePatterns: typeof NEGATIVE_PATTERNS;
}
export declare function buildBriefRelevanceContext(brief: string, brandColors?: string[]): BriefRelevanceContext;
export declare function scoreBriefRelevance(product: CatalogProduct, brief: string, brandColors?: string[], ctx?: BriefRelevanceContext): number;
export declare function scoreBriefRelevanceWithContext(product: CatalogProduct, ctx: BriefRelevanceContext): number;
export declare function filterCatalogByBriefRelevance(catalog: CatalogProduct[], brief: string, brandColors?: string[], minKeep?: number): CatalogProduct[];
export {};

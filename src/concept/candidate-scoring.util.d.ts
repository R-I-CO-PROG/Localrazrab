import type { CatalogProduct } from '../providers/llm/catalog.util';
import { type CatalogFilterInput } from '../providers/llm/catalog-filter.util';
export interface CandidateScoreContext {
    userPrompt: string;
    brandColors: string[];
    filterInput?: CatalogFilterInput;
    conceptTitle?: string;
    conceptComposition?: string;
    presentFamilies?: Set<string>;
    presentRoles?: Set<string>;
    presentDisplayTypes?: Set<string>;
    bundleCount?: number;
    otherCount?: number;
    maxOtherRoles?: number;
    skipThematicScoring?: boolean;
}
export interface CandidateScoreBreakdown {
    total: number;
    relevance: number;
    color: number;
    image: number;
    diversity: number;
    briefFit: number;
    penalties: string[];
}
export declare function scoreCandidateForSet(product: CatalogProduct, ctx: CandidateScoreContext): CandidateScoreBreakdown;
export declare function compareCandidatesForSet(a: CatalogProduct, b: CatalogProduct, ctx: CandidateScoreContext): number;

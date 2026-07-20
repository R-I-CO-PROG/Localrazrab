import type { CatalogProduct } from './catalog.util';
import { ConceptDiversityTracker } from './concept-diversity.util';
import type { CatalogFilterInput } from './catalog-filter.util';
export declare function findCatalogMatchForItem(item: string, catalog: CatalogProduct[], blockedIds: Set<string>, blockedVariants: Set<string>, brandColors?: string[]): CatalogProduct | null;
export declare function scoreProductForConcept(product: CatalogProduct, conceptTitle: string, conceptComposition: string, brief: string, conceptStyle?: string, mandatoryTypes?: string[]): number;
export declare function resolveConceptProductSelection(input: {
    llmItems: string[];
    conceptTitle: string;
    conceptComposition: string;
    brief: string;
    catalog: CatalogProduct[];
    desiredCount: number;
    blockedIds: Set<string>;
    blockedVariants: Set<string>;
    brandColors?: string[];
}): CatalogProduct[];
export declare function ensureConceptProducts(products: CatalogProduct[], catalog: CatalogProduct[], desiredCount: number, context: {
    title: string;
    composition: string;
    brief: string;
    style?: string;
}, blockedIds: Set<string>, blockedVariants: Set<string>, tracker: ConceptDiversityTracker, seed: number, recordUsage: boolean, scoreFn?: (product: CatalogProduct) => number, mandatoryTypes?: string[]): CatalogProduct[];
export interface UpgradeSetBudgetContext {
    title: string;
    composition: string;
    brief: string;
    style?: string;
    brandColors?: string[];
    filterInput?: CatalogFilterInput;
    budgetMin?: number | null;
    budgetMax?: number | null;
    maxProductsPerSet?: number;
}
export declare function upgradeSetToTargetBudget(products: CatalogProduct[], catalog: CatalogProduct[], perSetBudget: number, ctx: UpgradeSetBudgetContext, typeIndex?: Map<string, CatalogProduct[]>, maxScoreDrop?: number): CatalogProduct[];

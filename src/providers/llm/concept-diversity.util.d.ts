import type { CatalogProduct } from './catalog.util';
export declare const MANDATORY_TYPE_MAX_CONCEPTS = 5;
export declare const OPTIONAL_TYPE_MAX_CONCEPTS = 2;
export interface ConceptTypeDefinition {
    slug: string;
    labelRu: string;
    briefMandatory: RegExp[];
    matchProduct: (text: string) => boolean;
}
export declare function detectConceptProductType(product: CatalogProduct): string;
export declare function clearConceptProductTypeCache(): void;
export declare function detectPrimaryTypeFromName(nameNorm: string): string | null;
export declare function getProductTypeFamily(type: string): string;
export declare function typeConflictsInSet(localTypes: Set<string>, candidateType: string): boolean;
export declare const CONCEPT_TYPE_DEFINITIONS: ConceptTypeDefinition[];
export declare function conceptTypeLabel(slug: string): string;
export declare function productSlotsSignature(slots: Array<{
    type: string;
}>): string;
export declare function normalizeThemeAxis(axis: string | undefined | null): string;
export declare function mandatoryTypeAliases(slug: string): string[];
export declare function hasMandatoryTypeInProducts(products: Array<{
    name?: string;
} & CatalogProduct>, mandatorySlug: string): boolean;
export declare const CATALOG_IDEATOR_TYPE_SLUGS: string[];
export declare function detectMandatoryConceptTypesFromBrief(brief: string): string[];
export declare function detectAlternativeTypeGroupsFromBrief(brief: string): string[][];
export declare function pickAlternativeTypesForConcept(groups: string[][], conceptIndex: number): string[];
export declare class ConceptDiversityTracker {
    private readonly mandatoryTypes;
    private readonly usage;
    constructor(mandatoryTypes: ReadonlySet<string>);
    canUseType(type: string): boolean;
    recordConceptTypes(types: Iterable<string>): void;
    usageCount(type: string): number;
}
export declare function pickDiverseProduct(catalog: CatalogProduct[], localTypes: Set<string>, tracker: ConceptDiversityTracker, blockedIds: Set<string>, blockedVariants: Set<string>, picked: CatalogProduct[], seed: number, scoreFn?: (product: CatalogProduct) => number): CatalogProduct | null;
export declare function enforceConceptSetDiversity(products: CatalogProduct[], catalog: CatalogProduct[], desiredCount: number, tracker: ConceptDiversityTracker, blockedIds: Set<string>, blockedVariants: Set<string>, seed: number, recordUsage?: boolean, scoreFn?: (product: CatalogProduct) => number): CatalogProduct[];

import type { CatalogProduct } from './catalog.util';
import type { Concept } from '../../agents/contracts';
export declare function replacePreviousGenerationProducts(concepts: Concept[], previousProductIds: Set<string>, catalog: CatalogProduct[], brief: string, brandColors?: string[], regenerationSeed?: number): Concept[];
export declare function refillConceptsAvoidingPrevious(concepts: Concept[], previousProductIds: Set<string>, catalog: CatalogProduct[], desiredCount: number, brief: string, brandColors?: string[], regenerationSeed?: number): Concept[];

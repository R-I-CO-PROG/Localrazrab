import type { Concept } from '../../agents/contracts';
import type { CatalogProduct } from './catalog.util';
export declare function seedVariantKeysFromProductIds(productIds: Iterable<string>, catalogById: Map<string, CatalogProduct>): Set<string>;
export declare function enforceGlobalConceptUniqueness(concepts: Concept[], catalog: CatalogProduct[], brief: string, brandColors?: string[], minProductsPerSet?: number, log?: (msg: string) => void, budgetPerSet?: number | null, directedMode?: boolean): Concept[];

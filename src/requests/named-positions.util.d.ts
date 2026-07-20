import { type BriefAllowedCategory } from './brief-options';
import { type ConceptTypeDefinition } from '../providers/llm/concept-diversity.util';
import type { CatalogProduct } from '../providers/llm/catalog.util';
export declare const NAMED_POSITION_SYNONYMS: Array<{
    slug: string;
    labels: RegExp[];
}>;
export interface NamedPositionEntry {
    label: string;
    typeSlug: string;
}
export declare function splitAllowedItemsMixed(items: string[]): {
    categories: BriefAllowedCategory[];
    namedItems: string[];
};
export declare function parseNamedPositionsFromBrief(text: string): string[];
export declare function resolveNamedPositionTypes(labels: string[], brief?: string): string[];
export declare function resolveNamedItemsForBrief(brief: string, uiAllowedItems?: string[]): {
    namedItems: string[];
    namedTypes: string[];
    categoryBuckets: BriefAllowedCategory[];
};
export declare function isDirectedBriefMode(namedTypes: string[]): boolean;
export declare function isExclusiveBriefMode(brief: string, namedTypes: string[]): boolean;
export declare function productMatchesNamedPosition(product: CatalogProduct, label: string, typeSlug: string): boolean;
export declare function namedPositionDefinition(slug: string): ConceptTypeDefinition | undefined;

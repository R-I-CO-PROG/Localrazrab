import type { CatalogProduct } from '../providers/llm/catalog.util';
import { type ProductRole } from './product-taxonomy';
export type { ProductRole };
export interface NormalizedProductRole {
    role: ProductRole;
    legacyType: string;
    isGiftBundle: boolean;
    isWearable: boolean;
    isTech: boolean;
    isOffice: boolean;
    colorHints: string[];
}
export declare function detectProductRole(product: CatalogProduct): NormalizedProductRole;
export declare function isGiftBundleProduct(product: CatalogProduct): boolean;
export declare function roleFamilyForProduct(product: CatalogProduct): string;

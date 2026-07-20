import type { CatalogProduct } from '../providers/llm/catalog.util';
export type ProductRole = 'notebook' | 'pen' | 'writing' | 'drinkware' | 'powerbank' | 'tech_accessory' | 'bag' | 'headwear' | 'apparel' | 'gift_set' | 'welcome_pack' | 'food_drink' | 'home' | 'office' | 'packaging' | 'scarf' | 'socks' | 'towel' | 'other';
export interface ProductTypeMeta {
    role: ProductRole;
    family: string;
    budgetWeight: number;
    wearable?: boolean;
    tech?: boolean;
    office?: boolean;
    giftBundle?: boolean;
}
export declare const TYPE_META: Record<string, ProductTypeMeta>;
export declare function metaForType(slug: string): ProductTypeMeta;
export declare function familyForType(slug: string): string;
export declare function roleForType(slug: string): ProductRole;
export declare function budgetWeightForType(slug: string): number;
export declare function detectPrimaryTypeFromName(nameNorm: string): string | null;
export declare function clearProductTypeCache(): void;
export declare function detectTypeSlug(product: CatalogProduct): string;
export declare function typeConflictsInSet(localTypes: Set<string>, candidateType: string): boolean;
export declare function colorHintsFromProduct(product: CatalogProduct): string[];

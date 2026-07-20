import type { CatalogProduct } from './catalog.util';
import { type CatalogFilterInput } from './catalog-filter.util';
export interface ProductSlot {
    type: string;
    priority: 'must' | 'nice';
    notes?: string;
    positionLabel?: string;
}
export interface SlotPickContext {
    brief: string;
    conceptTitle: string;
    conceptComposition: string;
    conceptStyle?: string;
    brandColors: string[];
    filterInput?: CatalogFilterInput;
    blockedIds: Set<string>;
    blockedVariants: Set<string>;
    seed: number;
    mandatoryTypes?: string[];
    perSetBudget?: number | null;
    budgetMax?: number;
    slotTypes?: string[];
    desiredCount?: number;
    strictMandatory?: boolean;
    logMissing?: (message: string) => void;
}
export declare function indexCatalogByProductType(catalog: CatalogProduct[]): Map<string, CatalogProduct[]>;
export declare function pickProductForSlot(slot: ProductSlot, typeIndex: Map<string, CatalogProduct[]>, catalog: CatalogProduct[], localTypes: Set<string>, ctx: SlotPickContext): CatalogProduct | null;
export declare function resolveConceptFromSlots(slots: ProductSlot[], catalog: CatalogProduct[], desiredCount: number, ctx: SlotPickContext, prebuiltTypeIndex?: Map<string, CatalogProduct[]>): CatalogProduct[];
export declare function conceptTypeSignature(slots: ProductSlot[]): string;
export declare function buildCompositionFromProducts(products: CatalogProduct[], style?: string, fallback?: string): string;

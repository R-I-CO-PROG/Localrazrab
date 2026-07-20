import type { CatalogProduct } from './catalog.util';
export interface SetCohesionOptions {
    brief?: string;
    brandColors?: string[];
}
export declare function scoreSetCohesion(products: CatalogProduct[], options?: SetCohesionOptions): {
    score: number;
    outlierIndex: number | null;
    reason: string | null;
};
export declare function tryFixSetOutlier(products: CatalogProduct[], outlierIndex: number, catalog: CatalogProduct[], blockedIds: Set<string>, blockedVariants: Set<string>, brandColors: string[], brief?: string): CatalogProduct[] | null;

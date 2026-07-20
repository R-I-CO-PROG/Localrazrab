import type { ProductLogoPlacement } from './logo-overlay';
export declare function logoAnchorForProductName(name: string): {
    cx: number;
    cy: number;
    maxScale: number;
};
export declare function getLogoPlacementsForLifestyleScene(productNames: string[]): ProductLogoPlacement[];
export declare function getLogoPlacementsForProducts(productNames: string[], width?: number, height?: number): ProductLogoPlacement[];

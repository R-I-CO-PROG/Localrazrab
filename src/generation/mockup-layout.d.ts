export interface LogoPlacement {
    centerX: number;
    centerY: number;
    scale: number;
}
export interface ProductCell {
    x: number;
    y: number;
    size: number;
    labelY: number;
}
export declare function computeSceneTablePositions(count: number, width: number, height: number): ProductCell[];
export declare function computeProductGrid(count: number, width: number, height: number): ProductCell[];
export declare function getLogoPlacementsForScene(count: number, productNames?: string[], width?: number, height?: number): LogoPlacement[];
export declare function logoPlacementsFromGrid(count: number, width: number, height: number): LogoPlacement[];
export declare function getStudioLogoPlacements(count: number): LogoPlacement[];

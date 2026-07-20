import type { LogoPlacement } from './mockup-layout';
import { type LogoSurface } from './logo-surface.util';
export interface ProductLogoPlacement extends LogoPlacement {
    surface?: LogoSurface;
    productName?: string;
}
export declare function applyLogosAtPositions(outputPath: string, logoUrl: string, placements: ProductLogoPlacement[]): Promise<boolean>;
export declare function applyLogosOnProducts(outputPath: string, logoUrl: string, productNames: string[], width?: number, height?: number, options?: {
    placements?: ProductLogoPlacement[];
    lifestyleScene?: boolean;
}): Promise<boolean>;
export declare function applyLogoOverlay(outputPath: string, logoUrl: string): Promise<boolean>;

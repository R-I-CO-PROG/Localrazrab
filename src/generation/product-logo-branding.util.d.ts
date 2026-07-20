import type { LogoSurface } from './logo-surface.util';
export interface ProductLogoBranding {
    methodEn: string;
    placementEn: string;
    surface: LogoSurface;
}
export declare function getProductLogoBranding(productNameRu: string): ProductLogoBranding;
export declare function buildPerProductLogoBrandingLine(productNameRu: string, index: number): string;
export declare function buildPerProductLogoBrandingBlock(productNames: string[]): string;
export declare function buildCreativeAiLogoReferencePrompt(productNames: string[], options?: {
    logoHint?: string;
}): string;
export declare function buildCreativeLogoApplicationPrompt(logoHint?: string): string;
export declare const CATALOG_LOGO_NEGATIVE_PROMPT = "unbranded products, blank product surfaces, missing logo on products, clean products without logo, floating logos, logo stickers in air, flat pasted logo overlay, photoshop logo stamp, identical logo copy on every surface, wireframe logo, dotted logo outline, sketch logo ghost, detached logo panels, logo rectangles in background, duplicate logo overlays, logo collage, logo badges not on products, standalone centered logo emblem, white rectangle behind logo, black square behind logo, semi-transparent logo on background, logo ghost on table, logo on gift box exterior, logo on box lid, logo on packaging cardboard, logo on foam insert, multiple duplicate logo stamps,";
export declare const OPENROUTER_LOGO_REF_PREAMBLE = "ATTACHED IMAGE: CLIENT LOGO master file (transparent PNG mark). DESIGN GUIDE ONLY \u2014 use it to know the exact logo artwork for factory printing ON product surfaces (merchandise items only). FORBIDDEN: reproducing this image on gift box exterior, box lid, inner box walls, table, background, or as separate graphics, corner stickers, watermarks, floating panels, semi-transparent overlays, or duplicate logo stamps anywhere in the scene.";
export declare const OPENROUTER_CATALOG_LOGO_REF_PREAMBLE = "ATTACHED IMAGE: CLIENT LOGO master file (transparent PNG mark). DESIGN GUIDE ONLY \u2014 use it to know the exact logo artwork for factory printing ON product surfaces (merchandise items only). FORBIDDEN: reproducing this image on gift box exterior, box lid, inner box walls, table, background, or as separate graphics, corner stickers, watermarks, floating panels, semi-transparent overlays, or duplicate logo stamps anywhere in the scene. Apply logo ONLY on visible merchandise inside the box (apparel, cap, bottle, etc.) \u2014 NEVER on the presentation box cardboard, foam insert, or packaging exterior.";
export declare const CATALOG_LOGO_AVOID_PROMPT = "unbranded products, missing logos, floating logos in air, flat pasted logo overlays, photoshop logo stamps, wireframe logo, dotted logo outline, logo ghost in background, detached logo stickers, duplicate logo panels, white rectangle behind logo, semi-transparent logo overlay on background, logo watermark on scene,";
export declare const CATALOG_LOGO_INTEGRATION_FOOTER: string;
export type CatalogLogoRefLayout = 'catalog-products-then-logo' | 'logo-only' | 'scene-then-logo';
export declare function buildCatalogAiLogoReferencePrompt(productNames: string[], options?: {
    logoHint?: string;
    refLayout?: CatalogLogoRefLayout;
}): string;
export declare function buildLogoApplicationPrompt(productNames: string[], options?: {
    hasLogo?: boolean;
    logoHint?: string;
}): string;
export declare function stripBlankLogoPhrases(prompt: string): string;

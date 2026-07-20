export declare const FORBIDDEN_TONE_BRIGHT = "__bright__";
export declare const FORBIDDEN_TONE_NEON = "__neon__";
export declare const FORBIDDEN_TONE_WARM = "__warm__";
export declare const FORBIDDEN_TONE_COOL = "__cool__";
export interface BriefColorPalette {
    allowedColors: string[];
    forbiddenHints: string[];
}
export declare function extractBriefColorPalette(text: string): BriefColorPalette;
export declare function extractBriefColorsFromText(text: string): string[];
export declare function extractBriefForbiddenColorHints(text: string): string[];
export declare function briefPrefersWarmColors(text: string): boolean;
export declare function briefPrefersBrightColors(text: string): boolean;
export declare function briefAvoidsCoolColors(text: string): boolean;

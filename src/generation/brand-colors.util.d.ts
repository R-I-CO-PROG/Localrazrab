export declare function hexToColorDescription(hex: string, opts?: {
    omitHex?: boolean;
}): string;
export declare function isNeutralHex(hex: string): boolean;
export declare function assignBrandColorsToProducts(colors: string[] | undefined, productCount: number): (string | undefined)[];
export declare function formatPerProductColorAssignments(productNames: string[], colors: string[] | undefined): string;
export declare function formatBrandPalettePrompt(colors: string[] | undefined, opts?: {
    creative?: boolean;
}): string;
export declare function buildPaletteComplianceNegative(colors: string[] | undefined): string;
export declare function enforceBrandColorsInPrompt(prompt: string, colors: string[] | undefined, productNames?: string[]): string;
export declare function colorizeProductDescription(descriptionEn: string, productHex: string | undefined): string;

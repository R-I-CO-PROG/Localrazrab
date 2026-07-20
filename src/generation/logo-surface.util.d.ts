export type LogoSurface = 'fabric' | 'cylinder' | 'flat';
export declare function detectLogoSurface(productName: string): LogoSurface;
export declare function prepareLogoForeground(logoPath: string, maxSide: number): Promise<Buffer>;
export declare function warpLogoForSurface(logoPng: Buffer, surface: LogoSurface): Promise<Buffer>;
export declare function buildSurfacePrintLayer(logoPath: string, maxSide: number, surface: LogoSurface): Promise<Buffer>;
export declare function blendLogoIntoPatch(patchBuf: Buffer, logoPng: Buffer, surface: LogoSurface): Promise<Buffer>;

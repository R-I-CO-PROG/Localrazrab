export declare function applyLogoOnProductBuffer(productBuf: Buffer, logoPath: string, productName: string): Promise<Buffer>;
export declare function loadBrandedCatalogImageDataUri(imageUrl: string, productName: string, logoUrl: string, maxSide?: number): Promise<string | null>;

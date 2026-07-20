export declare function isBrokenMercaiImageProxy(url: string): boolean;
export declare function isLocallyResolvableCatalogImage(url: string): boolean;
export declare function resolveCatalogImageUrl(product: {
    catalogImageUrl?: string | null;
    silhouetteImageUrl: string;
}): string;
export declare function isRasterCatalogImage(url: string): boolean;

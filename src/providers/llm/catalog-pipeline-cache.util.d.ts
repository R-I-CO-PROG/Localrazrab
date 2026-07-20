import type { CatalogFilterInput } from './catalog-filter.util';
import type { CatalogPipelineResult } from './catalog-index.util';
export declare function catalogPipelineCacheKey(input: CatalogFilterInput, stratifiedMax: number): string;
export declare function getCachedCatalogPipeline(key: string, ttlMs: number): CatalogPipelineResult | null;
export declare function setCachedCatalogPipeline(key: string, result: CatalogPipelineResult): void;

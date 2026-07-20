import type { CatalogProduct } from './catalog.util';
import { type CatalogFilterInput } from './catalog-filter.util';
export interface CompactCatalogRow {
    name: string;
    category: string;
    price: number | null;
    stock: number;
}
export interface CatalogOverviewCategory {
    name: string;
    count: number;
    samples: string[];
}
export interface CatalogOverview {
    totalProducts: number;
    totalInDatabase?: number;
    categories: CatalogOverviewCategory[];
    productTypes: Array<{
        type: string;
        count: number;
    }>;
}
export interface CatalogPipelineResult {
    totalInDb: number;
    filtered: import('./catalog.util').CatalogProduct[];
    relevance: import('./catalog.util').CatalogProduct[];
    forLlm: import('./catalog.util').CatalogProduct[];
    overview: CatalogOverview;
    typeIndex: Map<string, import('./catalog.util').CatalogProduct[]>;
}
export declare function toCompactCatalogRow(product: CatalogProduct): CompactCatalogRow;
export declare function buildCatalogOverview(catalog: CatalogProduct[], totalInDatabase?: number): CatalogOverview;
export declare function stratifiedCatalogForLlm(catalog: CatalogProduct[], input: CatalogFilterInput, maxItems?: number): Promise<CatalogProduct[]>;
export declare function buildCatalogAgentPayload(catalogSample: CatalogProduct[], overview: CatalogOverview, extra?: Record<string, unknown>): {
    catalog_overview: CatalogOverview;
    catalog_total_in_scope: number;
    catalog_sample_size: number;
    catalog_products: CompactCatalogRow[];
    catalog_note: string;
};

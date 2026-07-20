import type { CatalogProduct } from './catalog.util';
export interface TypeCoverageReport {
    total: number;
    matched: number;
    other: number;
    otherPercent: number;
    byType: Array<{
        type: string;
        count: number;
        percent: number;
    }>;
    topOtherCategories: Array<{
        category: string;
        count: number;
        samples: string[];
    }>;
}
export declare function analyzeTypeCoverage(catalog: CatalogProduct[]): TypeCoverageReport;

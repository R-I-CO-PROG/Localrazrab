import type { CatalogProduct } from '../providers/llm/catalog.util';
export interface CatalogProductColorSpec {
    name: string;
    catalogColors: string[];
    targetColor?: string;
}
export declare function resolveAllowedTargetColor(catalogColors: string[], targetColor?: string | null): string | undefined;
export declare function catalogColorNames(product: CatalogProduct): string[];
export declare function buildCatalogProductColorSpecs(products: CatalogProduct[], targetByProductId?: Record<string, string>): CatalogProductColorSpec[];
export declare function formatCatalogColorRulesForPrompt(specs: CatalogProductColorSpec[]): string;
export declare function formatCatalogColorRulesShort(specs: CatalogProductColorSpec[]): string;
export declare function catalogColorNegativePromptAddendum(): string;

export declare const IMBA_CATEGORY_SEP = " / ";
export declare const IMBA_UNCATEGORIZED = "\u2753 \u0422\u0440\u0435\u0431\u0443\u0435\u0442 \u043A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u0438";
export interface ImbaCatalogItem {
    sku: string;
    name: string;
    brand?: string;
    category?: string;
    categoryRaw?: string;
}
export interface CategoryOverrides {
    version?: number;
    updatedAt?: string;
    categoryMoves?: Record<string, string>;
    productMoves?: Record<string, string>;
    extraCategories?: string[];
}
export interface CategoryTreeNode {
    path: string;
    name: string;
    parentPath: string | null;
    level: number;
    directCount: number;
    productCount: number;
    children: CategoryTreeNode[];
}
export interface CategoryTreeResult {
    roots: CategoryTreeNode[];
    nodes: Map<string, CategoryTreeNode>;
}
export declare function classifyByRules(item: ImbaCatalogItem): string | null;
export declare function normalizeBaseCategory(item: ImbaCatalogItem): string;
export declare function applyCategoryMoves(path: string, moves?: Record<string, string>): string;
export declare function emptyOverrides(): CategoryOverrides;
export declare function effectiveImbaCategory(item: ImbaCatalogItem, overrides?: CategoryOverrides | null): string;
export declare function buildTree(items: ImbaCatalogItem[], overrides?: CategoryOverrides | null): CategoryTreeResult;
export declare function treeStats(items: ImbaCatalogItem[], overrides?: CategoryOverrides | null): {
    totalProducts: number;
    categories: number;
    uncategorized: number;
};
export declare function leafCategoryName(path: string): string;
export declare function imbaCategoryBranch(path: string, depth?: number): string;
export declare function catalogImbaPath(product: {
    subcategory?: string | null;
    category?: string | null;
}): string;

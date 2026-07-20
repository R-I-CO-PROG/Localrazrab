import { OnModuleInit } from '@nestjs/common';
import { type CategoryTreeNode, type ImbaCatalogItem } from './imba-category-overrides';
export interface ImbaCatalogUnifiedItem extends ImbaCatalogItem {
    site: string;
    color?: string;
    priceRub?: string | number;
    stock?: string | number;
    image?: string;
    url?: string;
}
export interface CompactProduct {
    sku: string;
    name: string;
    brand: string;
    color: string;
    site: string;
    priceRub: string;
    stock: string;
    image: string;
    url: string;
    base: string;
    effective: string;
}
export declare class CatalogAdminService implements OnModuleInit {
    private readonly logger;
    private items;
    private bySku;
    private overrides;
    private pathIndex;
    private readonly catalogPath;
    private readonly overridesPath;
    private readonly snapshotsDir;
    onModuleInit(): void;
    private loadCatalog;
    private loadOverrides;
    private persist;
    private reindex;
    private compact;
    getTree(): {
        roots: CategoryTreeNode[];
        stats: {
            totalProducts: number;
            categories: number;
            uncategorized: number;
        };
        updatedAt: string | undefined;
    };
    getPaths(): string[];
    getProducts(params: {
        path: string;
        page: number;
        pageSize: number;
        q?: string;
        site?: string;
    }): {
        total: number;
        page: number;
        pageSize: number;
        items: CompactProduct[];
        isLeaf: boolean;
        aggregated: boolean;
    };
    search(q: string): {
        total: number;
        items: CompactProduct[];
    };
    moveProducts(skus: string[], target: string): {
        ok: true;
        moved: number;
    };
    moveCategory(from: string, to: string): {
        ok: true;
    };
    renameCategory(path: string, newName: string): {
        ok: true;
    };
    createCategory(path: string): {
        ok: true;
        path: string;
    };
    deleteCategory(path: string, mode?: 'merge-up' | 'to-uncategorized'): {
        ok: true;
    };
    reset(withSnapshot?: boolean): {
        ok: true;
    };
    takeSnapshot(reason?: string): {
        ok: true;
        file: string;
        path: string;
    };
    listSnapshots(): string[];
    exportToSite(): Promise<{
        ok: true;
        productCount: number;
        note: string;
    }>;
}
export declare function serializeTreeRoots(roots: CategoryTreeNode[]): CategoryTreeNode[];

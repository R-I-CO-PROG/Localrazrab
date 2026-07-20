import { CatalogAdminService } from './catalog-admin.service';
export declare class CatalogAdminController {
    private readonly catalog;
    constructor(catalog: CatalogAdminService);
    getTree(): {
        roots: import("./imba-category-overrides").CategoryTreeNode[];
        stats: {
            totalProducts: number;
            categories: number;
            uncategorized: number;
        };
        updatedAt: string | undefined;
    };
    getPaths(): {
        paths: string[];
    };
    getProducts(path?: string, page?: string, pageSize?: string, q?: string, site?: string): {
        total: number;
        page: number;
        pageSize: number;
        items: import("./catalog-admin.service").CompactProduct[];
        isLeaf: boolean;
        aggregated: boolean;
    };
    search(q?: string): {
        total: number;
        items: import("./catalog-admin.service").CompactProduct[];
    };
    moveProducts(body: {
        skus?: string[];
        target?: string;
    }): {
        ok: true;
        moved: number;
    };
    moveCategory(body: {
        from?: string;
        to?: string;
    }): {
        ok: true;
    };
    renameCategory(body: {
        path?: string;
        newName?: string;
    }): {
        ok: true;
    };
    createCategory(body: {
        path?: string;
    }): {
        ok: true;
        path: string;
    };
    deleteCategory(body: {
        path?: string;
        mode?: 'merge-up' | 'to-uncategorized';
    }): {
        ok: true;
    };
    reset(): {
        ok: true;
    };
    exportToSite(): Promise<{
        ok: true;
        productCount: number;
        note: string;
    }>;
    snapshot(body: {
        reason?: string;
    }): {
        ok: true;
        file: string;
        path: string;
    };
    private wrap;
}

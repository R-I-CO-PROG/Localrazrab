import { PrismaService } from '../prisma/prisma.service';
export interface ProductsListResult {
    items: Awaited<ReturnType<PrismaService['product']['findMany']>>;
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
}
export declare class ProductsService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    private buildWhere;
    findAll(filters?: {
        category?: string;
        search?: string;
        page?: number;
        pageSize?: number;
    }): Promise<ProductsListResult>;
    findById(id: string): import("@prisma/client").Prisma.Prisma__ProductClient<{
        id: string;
        slug: string;
        name: string;
        category: string;
        subcategory: string | null;
        description: string | null;
        sourceId: string | null;
        externalId: string | null;
        price: number | null;
        currency: string;
        stockAvailable: number;
        colors: import("@prisma/client/runtime/library").JsonValue;
        sourceUrl: string | null;
        silhouetteImageUrl: string;
        catalogImageUrl: string | null;
        createdAt: Date;
    } | null, null, import("@prisma/client/runtime/library").DefaultArgs, import("@prisma/client").Prisma.PrismaClientOptions>;
    stats(): Promise<{
        total: number;
        categories: {
            name: string;
            count: number;
        }[];
    }>;
}

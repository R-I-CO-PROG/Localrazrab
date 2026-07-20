import { ProductsService } from './products.service';
export declare class ProductsController {
    private readonly productsService;
    constructor(productsService: ProductsService);
    stats(): Promise<{
        total: number;
        categories: {
            name: string;
            count: number;
        }[];
    }>;
    findAll(category?: string, search?: string, page?: string, pageSize?: string): Promise<import("./products.service").ProductsListResult>;
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
}

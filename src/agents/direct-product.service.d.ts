import { PrismaService } from '../prisma/prisma.service';
import type { DirectProductQuery, DirectProductResult } from './contracts';
export declare class DirectProductService {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    search(query: DirectProductQuery, limit?: number): Promise<DirectProductResult>;
    private scoreProduct;
}

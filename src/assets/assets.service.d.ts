import { PrismaService } from '../prisma/prisma.service';
import { RequestsService } from '../requests/requests.service';
import { AssetType } from '@prisma/client';
export declare class AssetsService {
    private readonly prisma;
    private readonly requestsService;
    constructor(prisma: PrismaService, requestsService: RequestsService);
    createFromUpload(requestId: string, file: Express.Multer.File, type: AssetType): Promise<{
        id: string;
        createdAt: Date;
        url: string;
        type: import("@prisma/client").$Enums.AssetType;
        requestId: string;
    }>;
}

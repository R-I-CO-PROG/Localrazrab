import { AssetsService } from './assets.service';
export declare class AssetsController {
    private readonly assetsService;
    constructor(assetsService: AssetsService);
    uploadLogo(requestId: string, file: Express.Multer.File): Promise<{
        id: string;
        createdAt: Date;
        url: string;
        type: import("@prisma/client").$Enums.AssetType;
        requestId: string;
    }>;
    uploadReference(requestId: string, file: Express.Multer.File): Promise<{
        id: string;
        createdAt: Date;
        url: string;
        type: import("@prisma/client").$Enums.AssetType;
        requestId: string;
    }>;
}

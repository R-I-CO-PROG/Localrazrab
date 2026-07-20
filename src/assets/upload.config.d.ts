export declare function getUploadsDir(): string;
export declare function assetMulterOptions(): {
    storage: import("multer").StorageEngine;
    limits: {
        fileSize: number;
        files: number;
    };
    fileFilter: (_req: unknown, file: Express.Multer.File, cb: (e: Error | null, ok: boolean) => void) => void;
};

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUploadsDir = getUploadsDir;
exports.assetMulterOptions = assetMulterOptions;
const common_1 = require("@nestjs/common");
const multer_1 = require("multer");
const path_1 = require("path");
const uuid_1 = require("uuid");
const file_type_util_1 = require("./file-type.util");
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set([
    'image/png',
    'image/jpeg',
    'image/webp',
    'application/pdf',
]);
const ALLOWED_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.pdf']);
if ((0, file_type_util_1.isSvgUploadAllowed)()) {
    ALLOWED_MIME.add('image/svg+xml');
    ALLOWED_EXT.add('.svg');
}
function getUploadsDir() {
    return process.env.UPLOADS_DIR || (0, path_1.join)(process.cwd(), '../../uploads');
}
function assetMulterOptions() {
    return {
        storage: (0, multer_1.diskStorage)({
            destination: (_req, _file, cb) => {
                cb(null, (0, path_1.join)(getUploadsDir(), 'assets'));
            },
            filename: (_req, file, cb) => {
                cb(null, `${(0, uuid_1.v4)()}${(0, path_1.extname)(file.originalname).toLowerCase()}`);
            },
        }),
        limits: { fileSize: MAX_BYTES, files: 1 },
        fileFilter: (_req, file, cb) => {
            const ext = (0, path_1.extname)(file.originalname).toLowerCase();
            if (ext === '.svg' && !(0, file_type_util_1.isSvgUploadAllowed)()) {
                return cb(new common_1.BadRequestException('SVG uploads are disabled in production. Use PNG, JPG or WEBP.'), false);
            }
            if (!ALLOWED_MIME.has(file.mimetype) && !ALLOWED_EXT.has(ext)) {
                return cb(new common_1.BadRequestException('Допустимые форматы: PNG, JPG, WEBP, PDF (до 10 МБ)'), false);
            }
            cb(null, true);
        },
    };
}
//# sourceMappingURL=upload.config.js.map
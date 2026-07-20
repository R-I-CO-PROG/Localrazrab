"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AssetsService = void 0;
const common_1 = require("@nestjs/common");
const promises_1 = require("fs/promises");
const path_1 = require("path");
const prisma_service_1 = require("../prisma/prisma.service");
const requests_service_1 = require("../requests/requests.service");
const client_1 = require("@prisma/client");
const file_type_util_1 = require("./file-type.util");
const upload_config_1 = require("./upload.config");
let AssetsService = class AssetsService {
    constructor(prisma, requestsService) {
        this.prisma = prisma;
        this.requestsService = requestsService;
    }
    async createFromUpload(requestId, file, type) {
        const request = await this.requestsService.findOne(requestId);
        const editable = [client_1.RequestStatus.draft, client_1.RequestStatus.done, client_1.RequestStatus.failed];
        if (!editable.includes(request.status)) {
            throw new common_1.ForbiddenException('Assets cannot be uploaded while generation is in progress');
        }
        const ext = file.originalname.slice(file.originalname.lastIndexOf('.')).toLowerCase();
        const diskPath = (0, path_1.join)((0, upload_config_1.getUploadsDir)(), 'assets', file.filename);
        const valid = await (0, file_type_util_1.validateUploadedImageFile)(diskPath, ext);
        if (!valid) {
            await (0, promises_1.unlink)(diskPath).catch(() => undefined);
            throw new common_1.BadRequestException('Файл повреждён или формат не совпадает с расширением');
        }
        if (type === client_1.AssetType.logo) {
            await this.prisma.asset.deleteMany({ where: { requestId, type: client_1.AssetType.logo } });
        }
        const url = `/uploads/assets/${file.filename}`;
        return this.prisma.asset.create({
            data: { requestId, type, url },
        });
    }
};
exports.AssetsService = AssetsService;
exports.AssetsService = AssetsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        requests_service_1.RequestsService])
], AssetsService);
//# sourceMappingURL=assets.service.js.map
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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CatalogExternalImageController = void 0;
const common_1 = require("@nestjs/common");
const public_decorator_1 = require("../security/public.decorator");
const catalog_external_image_util_1 = require("./catalog-external-image.util");
let CatalogExternalImageController = class CatalogExternalImageController {
    async proxy(rawUrl, res) {
        const url = (0, catalog_external_image_util_1.resolveExternalCatalogImageFetchUrl)(rawUrl ?? '');
        if (!url || !(0, catalog_external_image_util_1.isAllowedExternalCatalogImageUrl)(url)) {
            throw new common_1.BadRequestException('Invalid or disallowed image URL');
        }
        const upstream = await fetch(url, {
            headers: { 'User-Agent': 'Mercai-Catalog-Image-Proxy/1.0' },
            signal: AbortSignal.timeout(15_000),
        });
        if (!upstream.ok) {
            throw new common_1.NotFoundException(`Upstream image not found (${upstream.status})`);
        }
        const contentType = upstream.headers.get('content-type') ?? 'image/jpeg';
        if (!contentType.startsWith('image/')) {
            throw new common_1.BadRequestException('Upstream response is not an image');
        }
        const body = Buffer.from(await upstream.arrayBuffer());
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        res.send(body);
    }
};
exports.CatalogExternalImageController = CatalogExternalImageController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)(),
    __param(0, (0, common_1.Query)('url')),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], CatalogExternalImageController.prototype, "proxy", null);
exports.CatalogExternalImageController = CatalogExternalImageController = __decorate([
    (0, common_1.Controller)('catalog-external-image')
], CatalogExternalImageController);
//# sourceMappingURL=catalog-external-image.controller.js.map
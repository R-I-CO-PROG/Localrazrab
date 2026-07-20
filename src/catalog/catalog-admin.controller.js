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
exports.CatalogAdminController = void 0;
const common_1 = require("@nestjs/common");
const catalog_admin_service_1 = require("./catalog-admin.service");
let CatalogAdminController = class CatalogAdminController {
    constructor(catalog) {
        this.catalog = catalog;
    }
    getTree() {
        return this.catalog.getTree();
    }
    getPaths() {
        return { paths: this.catalog.getPaths() };
    }
    getProducts(path = '', page = '1', pageSize = '60', q = '', site = '') {
        return this.catalog.getProducts({
            path,
            page: Math.max(1, Number(page) || 1),
            pageSize: Math.min(200, Number(pageSize) || 60),
            q,
            site,
        });
    }
    search(q = '') {
        return this.catalog.search(q);
    }
    moveProducts(body) {
        return this.wrap(() => this.catalog.moveProducts(body.skus || [], body.target || ''));
    }
    moveCategory(body) {
        return this.wrap(() => this.catalog.moveCategory(body.from || '', body.to || ''));
    }
    renameCategory(body) {
        return this.wrap(() => this.catalog.renameCategory(body.path || '', body.newName || ''));
    }
    createCategory(body) {
        return this.wrap(() => this.catalog.createCategory(body.path || ''));
    }
    deleteCategory(body) {
        return this.wrap(() => this.catalog.deleteCategory(body.path || '', body.mode || 'merge-up'));
    }
    reset() {
        return this.wrap(() => this.catalog.reset(true));
    }
    async exportToSite() {
        try {
            return await this.catalog.exportToSite();
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            throw new common_1.HttpException({ error: message }, common_1.HttpStatus.BAD_REQUEST);
        }
    }
    snapshot(body) {
        return this.wrap(() => this.catalog.takeSnapshot(body.reason || 'manual'));
    }
    wrap(fn) {
        try {
            return fn();
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            const status = err instanceof common_1.HttpException ? err.getStatus() : common_1.HttpStatus.BAD_REQUEST;
            throw new common_1.HttpException({ error: message }, status);
        }
    }
};
exports.CatalogAdminController = CatalogAdminController;
__decorate([
    (0, common_1.Get)('tree'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], CatalogAdminController.prototype, "getTree", null);
__decorate([
    (0, common_1.Get)('paths'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], CatalogAdminController.prototype, "getPaths", null);
__decorate([
    (0, common_1.Get)('products'),
    __param(0, (0, common_1.Query)('path')),
    __param(1, (0, common_1.Query)('page')),
    __param(2, (0, common_1.Query)('pageSize')),
    __param(3, (0, common_1.Query)('q')),
    __param(4, (0, common_1.Query)('site')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], CatalogAdminController.prototype, "getProducts", null);
__decorate([
    (0, common_1.Get)('search'),
    __param(0, (0, common_1.Query)('q')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], CatalogAdminController.prototype, "search", null);
__decorate([
    (0, common_1.Post)('move-products'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], CatalogAdminController.prototype, "moveProducts", null);
__decorate([
    (0, common_1.Post)('move-category'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], CatalogAdminController.prototype, "moveCategory", null);
__decorate([
    (0, common_1.Post)('rename-category'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], CatalogAdminController.prototype, "renameCategory", null);
__decorate([
    (0, common_1.Post)('create-category'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], CatalogAdminController.prototype, "createCategory", null);
__decorate([
    (0, common_1.Post)('delete-category'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], CatalogAdminController.prototype, "deleteCategory", null);
__decorate([
    (0, common_1.Post)('reset'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], CatalogAdminController.prototype, "reset", null);
__decorate([
    (0, common_1.Post)('export'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], CatalogAdminController.prototype, "exportToSite", null);
__decorate([
    (0, common_1.Post)('snapshot'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], CatalogAdminController.prototype, "snapshot", null);
exports.CatalogAdminController = CatalogAdminController = __decorate([
    (0, common_1.Controller)('catalog'),
    __metadata("design:paramtypes", [catalog_admin_service_1.CatalogAdminService])
], CatalogAdminController);
//# sourceMappingURL=catalog-admin.controller.js.map
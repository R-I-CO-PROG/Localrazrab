"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CatalogAdminModule = void 0;
const common_1 = require("@nestjs/common");
const catalog_admin_controller_1 = require("./catalog-admin.controller");
const catalog_admin_service_1 = require("./catalog-admin.service");
let CatalogAdminModule = class CatalogAdminModule {
};
exports.CatalogAdminModule = CatalogAdminModule;
exports.CatalogAdminModule = CatalogAdminModule = __decorate([
    (0, common_1.Module)({
        controllers: [catalog_admin_controller_1.CatalogAdminController],
        providers: [catalog_admin_service_1.CatalogAdminService],
        exports: [catalog_admin_service_1.CatalogAdminService],
    })
], CatalogAdminModule);
//# sourceMappingURL=catalog-admin.module.js.map
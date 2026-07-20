"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const throttler_1 = require("@nestjs/throttler");
const config_1 = require("@nestjs/config");
const prisma_module_1 = require("./prisma/prisma.module");
const products_module_1 = require("./products/products.module");
const requests_module_1 = require("./requests/requests.module");
const assets_module_1 = require("./assets/assets.module");
const generation_module_1 = require("./generation/generation.module");
const jobs_module_1 = require("./jobs/jobs.module");
const agents_module_1 = require("./agents/agents.module");
const catalog_admin_module_1 = require("./catalog/catalog-admin.module");
const health_controller_1 = require("./health.controller");
const api_key_guard_1 = require("./security/api-key.guard");
const bff_throttler_guard_1 = require("./security/bff-throttler.guard");
const sanitize_debug_interceptor_1 = require("./security/sanitize-debug.interceptor");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({ isGlobal: true }),
            throttler_1.ThrottlerModule.forRoot({
                throttlers: [
                    { name: 'default', ttl: 60_000, limit: 120 },
                    { name: 'ai', ttl: 3_600_000, limit: 30 },
                ],
            }),
            prisma_module_1.PrismaModule,
            products_module_1.ProductsModule,
            requests_module_1.RequestsModule,
            assets_module_1.AssetsModule,
            generation_module_1.GenerationModule,
            jobs_module_1.JobsModule,
            agents_module_1.AgentsModule,
            catalog_admin_module_1.CatalogAdminModule,
        ],
        controllers: [health_controller_1.HealthController],
        providers: [
            { provide: core_1.APP_GUARD, useClass: bff_throttler_guard_1.BffThrottlerGuard },
            { provide: core_1.APP_GUARD, useClass: api_key_guard_1.ApiKeyGuard },
            { provide: core_1.APP_INTERCEPTOR, useClass: sanitize_debug_interceptor_1.SanitizeDebugInterceptor },
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map
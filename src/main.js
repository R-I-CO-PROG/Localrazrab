"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dns_1 = __importDefault(require("dns"));
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const express_1 = require("express");
const helmet_1 = __importDefault(require("helmet"));
const path_1 = require("path");
const fs_1 = require("fs");
const app_module_1 = require("./app.module");
const env_util_1 = require("./security/env.util");
dns_1.default.setDefaultResultOrder('ipv4first');
function ensureUploadDirs(base) {
    for (const sub of ['assets', 'generated', 'silhouettes', 'products', 'temp']) {
        const dir = (0, path_1.join)(base, sub);
        if (!(0, fs_1.existsSync)(dir))
            (0, fs_1.mkdirSync)(dir, { recursive: true });
    }
}
async function bootstrap() {
    if ((0, env_util_1.isProductionEnv)()) {
        (0, env_util_1.requireProductionSecret)('API_SECRET_KEY', process.env.API_SECRET_KEY);
        (0, env_util_1.requireProductionSecret)('DATABASE_URL', process.env.DATABASE_URL);
        if (!process.env.CORS_ORIGIN?.trim()) {
            console.warn('⚠️  CORS_ORIGIN is empty in production — only same-origin BFF proxy is recommended');
        }
    }
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    app.use((0, helmet_1.default)({
        contentSecurityPolicy: false,
        crossOriginResourcePolicy: { policy: 'cross-origin' },
    }));
    app.use((0, express_1.json)({ limit: '1mb' }));
    app.use((0, express_1.urlencoded)({ extended: true, limit: '1mb' }));
    const corsOrigin = process.env.CORS_ORIGIN?.trim();
    app.enableCors({
        origin: (0, env_util_1.isProductionEnv)()
            ? corsOrigin
                ? corsOrigin.split(',').map((o) => o.trim())
                : false
            : corsOrigin
                ? corsOrigin.split(',').map((o) => o.trim())
                : true,
        credentials: false,
    });
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
    }));
    const uploadsDir = process.env.UPLOADS_DIR || (0, path_1.join)(process.cwd(), '../../uploads');
    ensureUploadDirs(uploadsDir);
    app.useStaticAssets(uploadsDir, { prefix: '/uploads' });
    const catalogDir = process.env.CATALOG_HANDOFF_DIR || (0, path_1.join)(process.cwd(), '../../data/catalog-handoff-full');
    if ((0, fs_1.existsSync)(catalogDir)) {
        app.useStaticAssets(catalogDir, { prefix: '/catalog-handoff' });
        console.log(`Catalog handoff: ${catalogDir} → /catalog-handoff/`);
    }
    const llm = process.env.LLM_PROVIDER ?? 'stub';
    const image = process.env.IMAGE_PROVIDER ?? 'local';
    console.log(`Providers: LLM=${llm}, IMAGE=${image}`);
    console.log(`Uploads dir: ${uploadsDir}`);
    console.log(`Environment: ${process.env.NODE_ENV ?? 'development'}`);
    const port = Number(process.env.API_PORT) || 3001;
    const host = process.env.API_HOST || '0.0.0.0';
    await app.listen(port, host);
    const publicUrl = process.env.PUBLIC_API_URL?.replace(/\/$/, '');
    console.log(`API running on http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
    if (publicUrl)
        console.log(`Public uploads: ${publicUrl}/uploads/`);
}
bootstrap();
//# sourceMappingURL=main.js.map
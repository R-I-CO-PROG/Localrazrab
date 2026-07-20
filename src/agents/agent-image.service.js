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
var AgentImageService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentImageService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const path_1 = require("path");
const fs_1 = require("fs");
const prisma_service_1 = require("../prisma/prisma.service");
const branded_mockup_image_provider_1 = require("../providers/image/branded-mockup-image.provider");
let AgentImageService = AgentImageService_1 = class AgentImageService {
    constructor(config, prisma, mockup) {
        this.config = config;
        this.prisma = prisma;
        this.mockup = mockup;
        this.logger = new common_1.Logger(AgentImageService_1.name);
    }
    async generateLocalImage(params) {
        const provider = this.config.get('IMAGE_PROVIDER', 'local');
        if (provider !== 'local' && provider !== 'external') {
            this.logger.warn(`Unknown IMAGE_PROVIDER=${provider}, using local mockup`);
        }
        const products = await this.prisma.product.findMany({
            where: { id: { in: params.productIds } },
        });
        if (products.length === 0) {
            throw new Error('No products selected for image generation');
        }
        const uploadsDir = this.config.get('UPLOADS_DIR') || (0, path_1.join)(process.cwd(), '../../uploads');
        const generatedDir = (0, path_1.join)(uploadsDir, 'generated');
        (0, fs_1.mkdirSync)(generatedDir, { recursive: true });
        const outputPath = (0, path_1.join)(generatedDir, `agent-${params.agentRunId}.png`);
        const productInputs = products.map((p) => ({
            name: p.name,
            imageUrl: p.catalogImageUrl || p.silhouetteImageUrl,
        }));
        await this.mockup.generate({
            outputPath,
            productNames: products.map((p) => p.name),
            products: productInputs,
            colors: params.colors,
            logoUrl: params.logoUrl ?? null,
            hasLogo: Boolean(params.logoUrl),
            category: params.category,
            quantity: params.quantity ?? undefined,
            prompt: params.prompt.imagePrompt,
            negativePrompt: params.prompt.negativePrompt,
            width: 1024,
            height: 1024,
            layoutMode: 'scene',
            showLabels: false,
        });
        const url = `/uploads/generated/agent-${params.agentRunId}.png`;
        this.logger.log(`Agent image saved: ${url} (${provider})`);
        return url;
    }
};
exports.AgentImageService = AgentImageService;
exports.AgentImageService = AgentImageService = AgentImageService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        prisma_service_1.PrismaService,
        branded_mockup_image_provider_1.BrandedMockupImageProvider])
], AgentImageService);
//# sourceMappingURL=agent-image.service.js.map
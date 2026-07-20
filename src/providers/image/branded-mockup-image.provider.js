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
var BrandedMockupImageProvider_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrandedMockupImageProvider = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const branded_mockup_composer_1 = require("../../generation/branded-mockup.composer");
let BrandedMockupImageProvider = BrandedMockupImageProvider_1 = class BrandedMockupImageProvider {
    constructor(config) {
        this.config = config;
        this.logger = new common_1.Logger(BrandedMockupImageProvider_1.name);
    }
    async generate(input) {
        const products = input.products ??
            (input.productNames ?? []).map((name, i) => ({
                name,
                imageUrl: input.catalogImageUrls?.[i] ??
                    input.silhouetteUrls?.[i] ??
                    '',
            }));
        this.logger.log(`Branded mockup: ${products.length} products, logo=${Boolean(input.logoUrl)}`);
        const result = await (0, branded_mockup_composer_1.composeBrandedMockup)({
            outputPath: input.outputPath,
            width: Number(this.config.get('MOCKUP_WIDTH')) || input.width || 1024,
            height: Number(this.config.get('MOCKUP_HEIGHT')) || input.height || 1024,
            products,
            colors: input.colors,
            logoUrl: input.logoUrl,
            category: input.category,
            quantity: input.quantity,
            showLabels: input.showLabels,
            layoutMode: input.layoutMode,
        });
        this.logger.log(`Mockup saved: ${result.productCount} items, logo per product=${result.logoAppliedPerProduct}`);
        return input.outputPath;
    }
};
exports.BrandedMockupImageProvider = BrandedMockupImageProvider;
exports.BrandedMockupImageProvider = BrandedMockupImageProvider = BrandedMockupImageProvider_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], BrandedMockupImageProvider);
//# sourceMappingURL=branded-mockup-image.provider.js.map
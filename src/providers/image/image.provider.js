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
exports.ImageProviderFactory = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const stub_image_provider_1 = require("./stub-image.provider");
const pollinations_image_provider_1 = require("./pollinations-image.provider");
const local_composite_image_provider_1 = require("./local-composite-image.provider");
const stable_horde_image_provider_1 = require("./stable-horde-image.provider");
const huggingface_image_provider_1 = require("./huggingface-image.provider");
const branded_mockup_image_provider_1 = require("./branded-mockup-image.provider");
const ai_enhanced_mockup_image_provider_1 = require("./ai-enhanced-mockup-image.provider");
let ImageProviderFactory = class ImageProviderFactory {
    constructor(config, stub, pollinations, local, stableHorde, huggingface, mockup, aiEnhanced) {
        this.config = config;
        this.stub = stub;
        this.pollinations = pollinations;
        this.local = local;
        this.stableHorde = stableHorde;
        this.huggingface = huggingface;
        this.mockup = mockup;
        this.aiEnhanced = aiEnhanced;
    }
    getProviderByName(name) {
        switch (name) {
            case 'pollinations':
                return this.pollinations;
            case 'stablehorde':
                return this.stableHorde;
            case 'huggingface':
                return this.huggingface;
            case 'stub':
                return this.stub;
            case 'local':
                return this.mockup;
            case 'external':
                return this.aiEnhanced;
            case 'mockup':
                return this.mockup;
            case 'ai':
                return this.aiEnhanced;
            default:
                return null;
        }
    }
    getProviderChainForMode(mode, options) {
        const provider = this.getProviderName();
        const externalEnabled = ['external', 'ai', 'pollinations', 'huggingface', 'stablehorde'].includes(provider);
        if (mode === 'ai' && externalEnabled) {
            const noMockupFallback = options?.aiStyle === 'creative' ||
                this.config.get('AI_NO_MOCKUP_FALLBACK', 'true') === 'true';
            const chain = [
                { name: 'ai', provider: this.aiEnhanced },
            ];
            if (!noMockupFallback) {
                chain.push({ name: 'mockup', provider: this.mockup });
            }
            return chain;
        }
        return [{ name: 'mockup', provider: this.mockup }];
    }
    getProvider() {
        const provider = this.config.get('IMAGE_PROVIDER', 'mockup');
        return this.getProviderByName(provider) ?? this.mockup;
    }
    getProviderChain() {
        const primary = this.getProviderName();
        if (primary === 'mockup') {
            return [{ name: 'mockup', provider: this.mockup }];
        }
        const fallbacks = (this.config.get('IMAGE_FALLBACK_PROVIDERS', 'pollinations') ?? '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        const names = [...new Set([primary, ...fallbacks])];
        const chain = [];
        for (const name of names) {
            if (name === 'huggingface' && !this.config.get('HUGGINGFACE_API_KEY')) {
                continue;
            }
            const provider = this.getProviderByName(name);
            if (provider)
                chain.push({ name, provider });
        }
        const allowLocal = this.config.get('IMAGE_FALLBACK_TO_LOCAL', 'false') === 'true';
        if (allowLocal && !chain.some((c) => c.name === 'local')) {
            chain.push({ name: 'local', provider: this.local });
        }
        return chain;
    }
    getLocalProvider() {
        return this.local;
    }
    getProviderName() {
        return this.config.get('IMAGE_PROVIDER', 'local');
    }
    getPollinationsProvider() {
        return this.pollinations;
    }
};
exports.ImageProviderFactory = ImageProviderFactory;
exports.ImageProviderFactory = ImageProviderFactory = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        stub_image_provider_1.StubImageProvider,
        pollinations_image_provider_1.PollinationsImageProvider,
        local_composite_image_provider_1.LocalCompositeImageProvider,
        stable_horde_image_provider_1.StableHordeImageProvider,
        huggingface_image_provider_1.HuggingFaceImageProvider,
        branded_mockup_image_provider_1.BrandedMockupImageProvider,
        ai_enhanced_mockup_image_provider_1.AiEnhancedMockupImageProvider])
], ImageProviderFactory);
//# sourceMappingURL=image.provider.js.map
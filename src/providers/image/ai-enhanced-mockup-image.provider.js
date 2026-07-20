"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var AiEnhancedMockupImageProvider_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiEnhancedMockupImageProvider = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const promises_1 = require("fs/promises");
const fs_1 = require("fs");
const path_1 = require("path");
const crypto_1 = require("crypto");
const sharp_1 = __importDefault(require("sharp"));
const ai_enhance_prompt_1 = require("../../generation/ai-enhance.prompt");
const logo_reference_util_1 = require("../../generation/logo-reference.util");
const stable_horde_client_1 = require("./stable-horde.client");
const pollinations_image_provider_1 = require("./pollinations-image.provider");
const openrouter_image_provider_1 = require("./openrouter-image.provider");
const huggingface_image_provider_1 = require("./huggingface-image.provider");
const branded_mockup_image_provider_1 = require("./branded-mockup-image.provider");
const hf_flux_prompt_1 = require("../../generation/hf-flux.prompt");
let AiEnhancedMockupImageProvider = AiEnhancedMockupImageProvider_1 = class AiEnhancedMockupImageProvider {
    constructor(config, openrouter, mockup, huggingface, pollinations) {
        this.config = config;
        this.openrouter = openrouter;
        this.mockup = mockup;
        this.huggingface = huggingface;
        this.pollinations = pollinations;
        this.logger = new common_1.Logger(AiEnhancedMockupImageProvider_1.name);
    }
    aiChainStatus() {
        const openrouter = this.openrouter.isConfigured() &&
            this.config.get('AI_SKIP_OPENROUTER_IMAGE', 'false') !== 'true';
        const huggingface = this.config.get('AI_SKIP_HUGGINGFACE', 'true') !== 'true' &&
            Boolean(this.config.get('HUGGINGFACE_API_KEY', '').trim());
        const pollinations = this.config.get('AI_SKIP_POLLINATIONS', 'true') !== 'true';
        return {
            openrouter,
            huggingface,
            pollinations,
            anyPrimary: openrouter || huggingface,
        };
    }
    logAiChainStatus() {
        const s = this.aiChainStatus();
        this.logger.log(`AI providers: openrouter=${s.openrouter ? 'ON' : 'skip'} | ` +
            `huggingface=${s.huggingface ? 'ON' : 'skip(no HUGGINGFACE_API_KEY)'} | ` +
            `pollinations=${s.pollinations ? 'ON' : 'skip(AI_SKIP_POLLINATIONS)'}`);
        if (!s.anyPrimary && !s.pollinations) {
            this.logger.warn('No AI image API configured — generation will fall back to mockup. ' +
                'Set OPENROUTER_API_KEY in apps/api/.env');
        }
    }
    getUploadsDir() {
        return this.config.get('UPLOADS_DIR') || (0, path_1.join)(process.cwd(), '../../uploads');
    }
    hasCatalogProducts(input) {
        return (input.products?.length ?? 0) > 0 || (input.productNames?.length ?? 0) > 0;
    }
    async publishTempImage(srcPath, publicBase) {
        const tempDir = (0, path_1.join)(this.getUploadsDir(), 'temp');
        if (!(0, fs_1.existsSync)(tempDir))
            (0, fs_1.mkdirSync)(tempDir, { recursive: true });
        const fileName = `mockup-${(0, crypto_1.randomUUID)()}.png`;
        await (0, promises_1.copyFile)(srcPath, (0, path_1.join)(tempDir, fileName));
        return `${publicBase}/uploads/temp/${fileName}`;
    }
    async renderMockupFallback(input, prompt, negative, publicBase, chain, width, height) {
        const mockupPath = `${input.outputPath}.fallback-mockup.png`;
        this.logger.log('AI render: branded mockup fallback (exact catalog products + logo)...');
        await this.mockup.generate({
            ...input,
            outputPath: mockupPath,
            logoUrl: input.logoUrl,
            hasLogo: input.hasLogo,
            showLabels: false,
            layoutMode: 'scene',
        });
        const mockupPublic = publicBase ? await this.publishTempImage(mockupPath, publicBase) : null;
        const enhancePrompt = [
            'Transform this reference into ultra photorealistic branded merchandise studio photography, 8k.',
            'Keep exactly the same products, count and layout — do not add, remove or replace items.',
            prompt.slice(0, 280),
        ]
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();
        if (chain.pollinations && mockupPublic) {
            try {
                this.logger.log(`AI render: Pollinations enhance mockup (${enhancePrompt.length} chars)...`);
                await this.pollinations.generate({
                    ...input,
                    prompt: enhancePrompt,
                    negativePrompt: negative,
                    referenceImageUrl: mockupPublic,
                    imageModel: 'flux',
                    width: Math.min(width, 1024),
                    height: Math.min(height, 1024),
                    outputPath: input.outputPath,
                });
                await (0, promises_1.unlink)(mockupPath).catch(() => undefined);
                await this.sharpenOutput(input.outputPath);
                this.logger.log('AI render complete (mockup + pollinations)');
                return input.outputPath;
            }
            catch (err) {
                this.logger.warn(`Pollinations mockup enhance failed: ${err instanceof Error ? err.message : err}`);
            }
        }
        await (0, promises_1.copyFile)(mockupPath, input.outputPath);
        await (0, promises_1.unlink)(mockupPath).catch(() => undefined);
        this.logger.log('AI render complete (branded mockup, OpenRouter unavailable)');
        return input.outputPath;
    }
    async generate(input) {
        this.logAiChainStatus();
        const width = Number(this.config.get('AI_ENHANCE_WIDTH')) || input.width || 768;
        const height = Number(this.config.get('AI_ENHANCE_HEIGHT')) || input.height || 768;
        const publicBase = this.config.get('PUBLIC_API_URL', '').replace(/\/$/, '');
        const chain = this.aiChainStatus();
        const snapshot = {
            productNames: input.productNames ?? [],
            colors: input.colors,
            category: input.category,
            hasLogo: input.hasLogo,
            logoUrl: input.logoUrl,
            userPrompt: input.userPrompt,
        };
        const logoHint = input.hasLogo && input.logoUrl ? await (0, logo_reference_util_1.describeLogoForPrompt)(input.logoUrl) : '';
        const prompt = input.prompt?.trim() ||
            (0, ai_enhance_prompt_1.buildAiRenderPrompt)(snapshot, logoHint || undefined);
        const negative = input.negativePrompt?.trim() || (0, ai_enhance_prompt_1.buildAiRenderNegative)(snapshot);
        const logoPublicUrl = input.referenceImageUrl ??
            (input.logoUrl && publicBase ? (0, logo_reference_util_1.resolvePublicAssetUrl)(input.logoUrl, publicBase) : null);
        const logoBase64 = input.hasLogo && input.logoUrl ? await (0, logo_reference_util_1.loadLogoBase64)(input.logoUrl) : null;
        const errors = [];
        const hfPrompt = (0, hf_flux_prompt_1.buildHfFluxPrompt)(snapshot, prompt);
        if (chain.openrouter) {
            const attempts = Number(this.config.get('OPENROUTER_IMAGE_RETRIES')) || 2;
            for (let attempt = 1; attempt <= attempts; attempt++) {
                try {
                    this.logger.log(`AI render: OpenRouter (attempt ${attempt}/${attempts})...`);
                    return await this.openrouter.generate({
                        ...input,
                        prompt,
                        negativePrompt: negative,
                    });
                }
                catch (err) {
                    const msg = err instanceof Error ? err.message : String(err);
                    errors.push(`openrouter[${attempt}]: ${msg}`);
                    this.logger.warn(errors[errors.length - 1]);
                    if (attempt < attempts)
                        await new Promise((r) => setTimeout(r, 3000 * attempt));
                }
            }
        }
        if (chain.huggingface) {
            try {
                this.logger.log(`AI render: HuggingFace FLUX (${hfPrompt.length} chars)...`);
                await this.huggingface.generate({
                    ...input,
                    prompt: hfPrompt,
                    negativePrompt: negative,
                    width: Math.min(width, 1024),
                    height: Math.min(height, 1024),
                });
                await this.sharpenOutput(input.outputPath);
                this.logger.log('AI render complete (huggingface)');
                return input.outputPath;
            }
            catch (err) {
                errors.push(`huggingface: ${err instanceof Error ? err.message : err}`);
                this.logger.warn(errors[errors.length - 1]);
            }
        }
        const pollinationsInput = {
            ...input,
            prompt,
            negativePrompt: negative,
            outputPath: input.outputPath,
            width: Math.min(width, 1024),
            height: Math.min(height, 1024),
            referenceImageUrl: undefined,
            imageModel: 'flux',
        };
        if (!chain.anyPrimary && !chain.pollinations) {
            throw new Error('No AI image providers configured. Set OPENROUTER_API_KEY in apps/api/.env and restart API');
        }
        if (chain.pollinations && input.hasLogo && logoPublicUrl) {
            try {
                this.logger.log('AI render: Pollinations flux (logo ref)...');
                await this.pollinations.generate({
                    ...pollinationsInput,
                    referenceImageUrl: logoPublicUrl,
                });
                await this.sharpenOutput(input.outputPath);
                return input.outputPath;
            }
            catch (err) {
                errors.push(`pollinations-flux: ${err instanceof Error ? err.message : err}`);
                this.logger.warn(errors[errors.length - 1]);
            }
        }
        if (this.config.get('AI_SKIP_HORDE', 'true') !== 'true') {
            try {
                this.logger.log('AI render: Stable Horde...');
                const result = await (0, stable_horde_client_1.stableHordeGenerate)({
                    prompt: `${prompt} ### ${negative}`,
                    width: Math.min(width, 576),
                    height: Math.min(height, 576),
                    steps: Number(this.config.get('STABLE_HORDE_STEPS')) || 28,
                    model: this.config.get('STABLE_HORDE_MODEL', 'Deliberate'),
                    extraSourceImagesBase64: logoBase64 ? [logoBase64] : undefined,
                    apiKey: this.config.get('STABLE_HORDE_API_KEY', '0000000000'),
                    clientAgent: this.config.get('STABLE_HORDE_CLIENT_AGENT', 'suvenir-mvp:1.0:local-dev'),
                    timeoutMs: Number(this.config.get('STABLE_HORDE_TIMEOUT_MS')) || 900_000,
                    logger: this.logger,
                });
                await (0, promises_1.writeFile)(input.outputPath, result);
                await this.sharpenOutput(input.outputPath);
                return input.outputPath;
            }
            catch (err) {
                errors.push(`horde: ${err instanceof Error ? err.message : err}`);
                this.logger.warn(errors[errors.length - 1]);
            }
        }
        if (chain.pollinations && (!input.hasLogo || !logoPublicUrl)) {
            try {
                this.logger.log('AI render: Pollinations flux (plain)...');
                await this.pollinations.generate({ ...pollinationsInput, imageModel: 'flux' });
                await this.sharpenOutput(input.outputPath);
                return input.outputPath;
            }
            catch (err) {
                errors.push(`pollinations-flux-plain: ${err instanceof Error ? err.message : err}`);
            }
        }
        throw new Error(`AI render failed: ${errors.join('; ')}`);
    }
    async sharpenOutput(outputPath) {
        const tempPath = `${outputPath}.sharpen.tmp.png`;
        try {
            await (0, sharp_1.default)(outputPath).sharpen({ sigma: 0.5 }).png().toFile(tempPath);
            await (0, sharp_1.default)(tempPath).png().toFile(outputPath);
        }
        catch {
        }
        finally {
            try {
                const { unlink } = await Promise.resolve().then(() => __importStar(require('fs/promises')));
                await unlink(tempPath);
            }
            catch {
            }
        }
    }
};
exports.AiEnhancedMockupImageProvider = AiEnhancedMockupImageProvider;
exports.AiEnhancedMockupImageProvider = AiEnhancedMockupImageProvider = AiEnhancedMockupImageProvider_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        openrouter_image_provider_1.OpenrouterImageProvider,
        branded_mockup_image_provider_1.BrandedMockupImageProvider,
        huggingface_image_provider_1.HuggingFaceImageProvider,
        pollinations_image_provider_1.PollinationsImageProvider])
], AiEnhancedMockupImageProvider);
//# sourceMappingURL=ai-enhanced-mockup-image.provider.js.map
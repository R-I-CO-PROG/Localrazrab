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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var PollinationsImageProvider_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PollinationsImageProvider = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const sharp_1 = __importDefault(require("sharp"));
let PollinationsImageProvider = PollinationsImageProvider_1 = class PollinationsImageProvider {
    constructor(config) {
        this.config = config;
        this.logger = new common_1.Logger(PollinationsImageProvider_1.name);
    }
    buildImageUrl(prompt, input) {
        const baseUrl = this.config.get('POLLINATIONS_BASE_URL', 'https://image.pollinations.ai');
        const pathPrefix = this.config.get('POLLINATIONS_PATH_PREFIX', 'p');
        const model = input?.imageModel ?? this.config.get('POLLINATIONS_MODEL', 'flux');
        const feed = this.config.get('POLLINATIONS_FEED', 'true');
        const encodedPrompt = encodeURIComponent(prompt.trim());
        const params = new URLSearchParams({
            feed,
            model,
            width: String(input?.width ?? (Number(this.config.get('POLLINATIONS_WIDTH')) || 1024)),
            height: String(input?.height ?? (Number(this.config.get('POLLINATIONS_HEIGHT')) || 1024)),
        });
        const negative = input?.negativePrompt?.trim();
        if (negative)
            params.set('negative_prompt', negative);
        const refs = input?.referenceImageUrls?.filter(Boolean);
        if (refs?.length) {
            params.set('image', refs.join('|'));
        }
        else if (input?.referenceImageUrl) {
            params.set('image', input.referenceImageUrl);
        }
        if (this.config.get('POLLINATIONS_ENHANCE') === 'true')
            params.set('enhance', 'true');
        const apiKey = this.config.get('POLLINATIONS_API_KEY');
        if (apiKey)
            params.set('key', apiKey);
        if (this.config.get('POLLINATIONS_NOLOGO', 'true') !== 'false')
            params.set('nologo', 'true');
        return `${baseUrl}/${pathPrefix}/${encodedPrompt}?${params.toString()}`;
    }
    async generate(input) {
        const url = this.buildImageUrl(input.prompt, input);
        this.logger.log(`Pollinations [${input.imageModel ?? 'flux'}]: ${url.slice(0, 140)}...`);
        const timeoutMs = Number(this.config.get('POLLINATIONS_TIMEOUT_MS')) || 180_000;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetch(url, {
                signal: controller.signal,
                headers: { Accept: 'image/*' },
            });
            if (!response.ok) {
                const text = await response.text().catch(() => '');
                throw new Error(`Pollinations HTTP ${response.status}: ${text.slice(0, 200)}`);
            }
            const buffer = Buffer.from(await response.arrayBuffer());
            if (buffer.length < 100) {
                throw new Error('Pollinations returned empty or invalid image');
            }
            await (0, sharp_1.default)(buffer).png().toFile(input.outputPath);
            this.logger.log(`Image saved to ${input.outputPath} (${buffer.length} bytes)`);
            return input.outputPath;
        }
        finally {
            clearTimeout(timer);
        }
    }
};
exports.PollinationsImageProvider = PollinationsImageProvider;
exports.PollinationsImageProvider = PollinationsImageProvider = PollinationsImageProvider_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], PollinationsImageProvider);
//# sourceMappingURL=pollinations-image.provider.js.map
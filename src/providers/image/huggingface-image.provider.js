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
var HuggingFaceImageProvider_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.HuggingFaceImageProvider = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const promises_1 = require("fs/promises");
let HuggingFaceImageProvider = HuggingFaceImageProvider_1 = class HuggingFaceImageProvider {
    constructor(config) {
        this.config = config;
        this.logger = new common_1.Logger(HuggingFaceImageProvider_1.name);
    }
    async sleep(ms) {
        return new Promise((r) => setTimeout(r, ms));
    }
    buildEndpoints(model) {
        const provider = this.config.get('HUGGINGFACE_PROVIDER', 'hf-inference');
        const endpoints = [];
        if (provider === 'auto' || provider === 'hf-inference') {
            endpoints.push(`https://router.huggingface.co/hf-inference/models/${model}`);
        }
        if (provider === 'auto' || provider === 'fal-ai') {
            endpoints.push(`https://router.huggingface.co/fal-ai/models/${model}`);
        }
        return [...new Set(endpoints)];
    }
    permissionHint(status, body) {
        if (status !== 403)
            return body.slice(0, 300);
        return (`${body.slice(0, 200)} — создайте fine-grained токен с правом ` +
            '"Make calls to Inference Providers" на https://huggingface.co/settings/tokens');
    }
    async generate(input) {
        const token = this.config.get('HUGGINGFACE_API_KEY', '').trim();
        if (!token) {
            throw new Error('HUGGINGFACE_API_KEY не задан. Бесплатный токен: https://huggingface.co/settings/tokens');
        }
        const model = this.config.get('HUGGINGFACE_MODEL', 'black-forest-labs/FLUX.1-schnell');
        const maxRetries = Number(this.config.get('HUGGINGFACE_MAX_RETRIES')) || 8;
        const retryMs = Number(this.config.get('HUGGINGFACE_RETRY_MS')) || 5000;
        const endpoints = this.buildEndpoints(model);
        const promptText = (input.prompt ?? '').trim();
        if (!promptText) {
            throw new Error('HuggingFace: empty prompt — cannot generate');
        }
        const fluxPrompt = promptText.slice(0, 420);
        this.logger.log(`HuggingFace ${model} — prompt (${fluxPrompt.length} chars): ${fluxPrompt.slice(0, 120)}...`);
        const errors = [];
        for (const url of endpoints) {
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json',
                        Accept: 'image/png',
                    },
                    body: JSON.stringify({
                        inputs: fluxPrompt,
                        parameters: {
                            width: input.width ?? 1024,
                            height: input.height ?? 1024,
                            num_inference_steps: Number(this.config.get('HUGGINGFACE_STEPS')) || 4,
                            guidance_scale: Number(this.config.get('HUGGINGFACE_GUIDANCE')) || 0,
                        },
                    }),
                });
                if (response.status === 503) {
                    const body = (await response.json().catch(() => ({})));
                    const wait = Math.min((body.estimated_time ?? 10) * 1000, 30000);
                    this.logger.log(`Model loading, retry ${attempt}/${maxRetries} in ${wait}ms...`);
                    await this.sleep(wait || retryMs);
                    continue;
                }
                if (response.status === 403) {
                    const text = await response.text();
                    errors.push(`HuggingFace 403 (${url}): ${this.permissionHint(403, text)}`);
                    break;
                }
                if (!response.ok) {
                    const text = await response.text();
                    errors.push(`HuggingFace ${response.status} (${url}): ${text.slice(0, 200)}`);
                    break;
                }
                const contentType = response.headers.get('content-type') ?? '';
                if (!contentType.includes('image')) {
                    const text = await response.text();
                    errors.push(`HuggingFace unexpected response (${url}): ${text.slice(0, 200)}`);
                    break;
                }
                const buffer = Buffer.from(await response.arrayBuffer());
                await (0, promises_1.writeFile)(input.outputPath, buffer);
                this.logger.log(`HuggingFace image saved (${buffer.length} bytes)`);
                return input.outputPath;
            }
        }
        throw new Error(errors.join(' | ') || 'HuggingFace: model busy after retries');
    }
};
exports.HuggingFaceImageProvider = HuggingFaceImageProvider;
exports.HuggingFaceImageProvider = HuggingFaceImageProvider = HuggingFaceImageProvider_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], HuggingFaceImageProvider);
//# sourceMappingURL=huggingface-image.provider.js.map
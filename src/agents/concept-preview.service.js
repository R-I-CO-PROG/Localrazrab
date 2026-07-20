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
var ConceptPreviewService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConceptPreviewService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const path_1 = require("path");
const fs_1 = require("fs");
const openrouter_image_provider_1 = require("../providers/image/openrouter-image.provider");
let ConceptPreviewService = ConceptPreviewService_1 = class ConceptPreviewService {
    constructor(config, openrouterImage) {
        this.config = config;
        this.openrouterImage = openrouterImage;
        this.logger = new common_1.Logger(ConceptPreviewService_1.name);
    }
    isEnabled() {
        if (this.config.get('OPENROUTER_PREVIEW_ENABLED', 'true') !== 'true')
            return false;
        return this.openrouterImage.isConfigured();
    }
    async attachPreviews(concepts, opts) {
        if (!this.isEnabled() || concepts.length === 0) {
            return concepts;
        }
        const uploadsDir = this.config.get('UPLOADS_DIR') || (0, path_1.join)(process.cwd(), '../../uploads');
        const outDir = (0, path_1.join)(uploadsDir, 'generated', 'previews');
        (0, fs_1.mkdirSync)(outDir, { recursive: true });
        const model = this.config.get('OPENROUTER_IMAGE_MODEL_PREVIEW') ??
            'black-forest-labs/flux.2-klein-4b';
        const results = await Promise.all(concepts.map(async (concept, index) => {
            const filename = `preview-${opts.agentRunId}-${index}.jpg`;
            const outputPath = (0, path_1.join)(outDir, filename);
            try {
                await this.openrouterImage.generateConceptPreview({
                    title: concept.title,
                    narrative: concept.narrative || concept.description,
                    styleTags: concept.styleTags,
                    colors: opts.colors,
                    outputPath,
                });
                return {
                    ...concept,
                    previewImageUrl: `/uploads/generated/previews/${filename}`,
                };
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                this.logger.warn(`Preview failed for «${concept.title}»: ${msg}`);
                return concept;
            }
        }));
        const ok = results.filter((c) => c.previewImageUrl).length;
        this.logger.log(`Concept previews: ${ok}/${concepts.length} via OpenRouter (${model})`);
        return results;
    }
};
exports.ConceptPreviewService = ConceptPreviewService;
exports.ConceptPreviewService = ConceptPreviewService = ConceptPreviewService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        openrouter_image_provider_1.OpenrouterImageProvider])
], ConceptPreviewService);
//# sourceMappingURL=concept-preview.service.js.map
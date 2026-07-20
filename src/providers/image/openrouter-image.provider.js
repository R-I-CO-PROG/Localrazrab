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
var OpenrouterImageProvider_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenrouterImageProvider = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const fs_1 = require("fs");
const promises_1 = require("fs/promises");
const path_1 = require("path");
const sharp_1 = __importDefault(require("sharp"));
const openrouter_image_client_1 = require("./openrouter-image.client");
const logo_reference_util_1 = require("../../generation/logo-reference.util");
const refine_visualization_prompt_1 = require("../../generation/refine-visualization.prompt");
const product_logo_branding_util_1 = require("../../generation/product-logo-branding.util");
let OpenrouterImageProvider = OpenrouterImageProvider_1 = class OpenrouterImageProvider {
    constructor(config) {
        this.config = config;
        this.logger = new common_1.Logger(OpenrouterImageProvider_1.name);
    }
    isConfigured() {
        return (this.config.get('OPENROUTER_ENABLED', 'true') === 'true' &&
            Boolean(this.config.get('OPENROUTER_API_KEY', '').trim()));
    }
    getApiKey() {
        const key = this.config.get('OPENROUTER_API_KEY', '').trim();
        if (!key)
            throw new Error('OPENROUTER_API_KEY is not configured');
        return key;
    }
    previewModel() {
        return (this.config.get('OPENROUTER_IMAGE_MODEL_PREVIEW') ??
            'black-forest-labs/flux.2-klein-4b');
    }
    finalModel() {
        return (this.config.get('OPENROUTER_IMAGE_MODEL_FINAL') ??
            'google/gemini-2.5-flash-image');
    }
    catalogModel() {
        return (this.config.get('OPENROUTER_IMAGE_MODEL_CATALOG') ??
            'google/gemini-3-pro-image-preview');
    }
    isCatalogInput(input) {
        return (input.aiStyle === 'catalog' ||
            (input.generationMode === 'ai' &&
                input.aiStyle !== 'creative' &&
                Boolean(input.productNames?.length)));
    }
    isCreativeWithLogo(input) {
        return input.aiStyle === 'creative' && Boolean(input.hasLogo && input.logoUrl);
    }
    resolveModel(input) {
        if (this.isCatalogInput(input))
            return this.catalogModel();
        if (this.isCreativeWithLogo(input)) {
            const model = this.config.get('OPENROUTER_IMAGE_MODEL_CREATIVE_LOGO')?.trim();
            return model || this.catalogModel();
        }
        return this.finalModel();
    }
    useCatalogImagePipeline(input, isCatalog) {
        return isCatalog || this.isCreativeWithLogo(input);
    }
    resolveModalities(model) {
        if (/flux|black-forest-labs/i.test(model))
            return ['image'];
        return ['image', 'text'];
    }
    resolveImageConfig(model, isCatalog = false) {
        const isGemini = /gemini|google/i.test(model);
        const isGptImage = /openai\/gpt.*image|gpt-image/i.test(model);
        if (!isGemini && !isGptImage)
            return undefined;
        const aspect = isCatalog
            ? (this.config.get('OPENROUTER_CATALOG_ASPECT_RATIO', '4:3') ?? '4:3')
            : (this.config.get('OPENROUTER_FINAL_ASPECT_RATIO', '1:1') ?? '1:1');
        const imageSize = isCatalog
            ? (this.config.get('OPENROUTER_CATALOG_IMAGE_SIZE', '1K') ?? '1K')
            : (this.config.get('OPENROUTER_FINAL_IMAGE_SIZE', '1K') ?? '1K');
        return { aspect_ratio: aspect, image_size: imageSize };
    }
    async generateConceptPreview(input) {
        if (!this.isConfigured())
            throw new Error('OpenRouter image not configured');
        const tags = input.styleTags?.length ? `Style hints: ${input.styleTags.slice(0, 4).join(', ')}.` : '';
        const palette = input.colors?.length
            ? `Use these colors only as a general shade direction, not exact matching: ${input.colors
                .slice(0, 4)
                .join(', ')}.`
            : '';
        const prompt = [
            'Clean schematic concept preview board labeled as concept schema, NOT a photorealistic render.',
            'Modern editorial schematic / moodboard: white or light neutral background, consistent grid, soft shadows.',
            'Simple product silhouettes or icon cards (3–5 blocks), color palette strip, minimal labels.',
            'Badge area: small label «Схема концепции» — must look like preview, NOT final product mockup.',
            `Concept: ${input.title}.`,
            input.narrative.slice(0, 420),
            'Clearly show the main items as recognizable simplified objects, arranged for readability.',
            tags,
            palette,
            'Neutral background, clear silhouettes, soft colors, minimal flat shadows.',
            'Prioritize composition and clarity over realism. The image should communicate the idea at a glance.',
            'No text overlays, no watermark, no people, no logos, no brand names.',
            'Avoid: photorealistic product shot, cinematic render, realistic mockup, final advertising image, studio photography, excessive detail, realistic textures, unreadable abstract composition.',
        ]
            .filter(Boolean)
            .join(' ');
        const aspect = this.config.get('OPENROUTER_PREVIEW_ASPECT_RATIO', '')?.trim();
        const imageConfig = aspect ? { aspect_ratio: aspect } : undefined;
        const buffer = await (0, openrouter_image_client_1.openrouterGenerateImageBuffer)({
            apiKey: this.getApiKey(),
            model: this.previewModel(),
            prompt,
            modalities: ['image'],
            imageConfig,
            logger: this.logger,
        });
        const jpegQuality = Number(this.config.get('OPENROUTER_PREVIEW_JPEG_QUALITY', '85')) || 85;
        const output = await (0, sharp_1.default)(buffer).jpeg({ quality: jpegQuality, mozjpeg: true }).toBuffer();
        const meta = await (0, sharp_1.default)(output).metadata();
        (0, fs_1.mkdirSync)((0, path_1.dirname)(input.outputPath), { recursive: true });
        await (0, promises_1.writeFile)(input.outputPath, output);
        this.logger.log(`OpenRouter preview (${this.previewModel()}): ${meta.width}×${meta.height}, ${output.length} bytes → ${input.outputPath}`);
        return input.outputPath;
    }
    async generate(input) {
        if (!this.isConfigured())
            throw new Error('OpenRouter image not configured');
        const publicBase = this.config.get('PUBLIC_API_URL', '').replace(/\/$/, '');
        const logoHint = input.hasLogo && input.logoUrl ? await (0, logo_reference_util_1.describeLogoForPrompt)(input.logoUrl) : '';
        const isCatalog = this.isCatalogInput(input);
        const catalogUrls = [
            ...(input.catalogImageUrls ?? []),
            ...input.products?.map((p) => p.imageUrl).filter(Boolean),
        ].filter((url, i, arr) => url && arr.indexOf(url) === i);
        const maxProductRefs = Number(this.config.get('OPENROUTER_MAX_PRODUCT_REFS', '6')) || 6;
        const maxTotalRefs = Number(this.config.get('OPENROUTER_MAX_REFERENCE_IMAGES', '8')) || 8;
        const hasLogoRef = Boolean(input.hasLogo && input.logoUrl);
        const allowedProductRefs = Math.max(0, Math.min(maxProductRefs, maxTotalRefs - (hasLogoRef ? 1 : 0)));
        const productRefCatalogUrls = catalogUrls.slice(0, allowedProductRefs);
        const referencedProductNames = (input.productNames ?? []).slice(0, productRefCatalogUrls.length);
        const maxSide = Number(this.config.get('OPENROUTER_PRODUCT_REF_MAX_PX', '768')) || 768;
        const productCount = productRefCatalogUrls.length;
        const productRefHint = isCatalog && productCount > 0
            ? `Reference images 1–${productCount} are UNBRANDED catalog product photos for: ${referencedProductNames.join(', ') || 'each item'}. Use ONLY for product shape, material and catalog color — ignore any stock branding on photos.`
            : '';
        if (isCatalog && catalogUrls.length > productCount) {
            this.logger.warn(`Catalog refs trimmed: products=${catalogUrls.length}, sent=${productCount}, max_total_refs=${maxTotalRefs}`);
        }
        const catalogSceneRules = isCatalog
            ? 'Premium corporate welcome gift box presentation: open matte black presentation box with custom-fit inner compartments, each product nestled in its slot like a luxury B2B unboxing. Soft diffused studio lighting, slight top-down angle, tactile materials, cohesive premium gift-set photography — NOT random surface flat lay, NOT stone or concrete background.'
            : 'Premium corporate MERCH product photograph: all gift-set items on studio surface or flat lay, soft commercial lighting, 8k. ONLY physical branded products — NO vehicles, streets, offices, or people.';
        let prompt = input.prompt?.trim() ||
            [
                isCatalog
                    ? 'Ultra photorealistic premium corporate welcome gift box photograph with branded merchandise inside fitted compartments.'
                    : 'Ultra photorealistic corporate branded merchandise product photograph — gift set flat lay, every concept product visible.',
                productRefHint,
                input.llmImagePrompt?.trim(),
                isCatalog ? input.userPrompt?.trim()?.slice(0, 300) : undefined,
                catalogSceneRules,
                'No watermark, no captions, no people, no hex color codes as visible text.',
            ]
                .filter(Boolean)
                .join(' ');
        if (input.hasLogo && input.logoUrl) {
            const productNames = isCatalog
                ? referencedProductNames
                : (input.productNames ?? []).slice(0, Math.max(1, input.productNames?.length ?? 0));
            const refLayout = isCatalog ? 'catalog-products-then-logo' : 'logo-only';
            if (productNames.length > 0) {
                const catalogLogoBlock = (0, product_logo_branding_util_1.buildCatalogAiLogoReferencePrompt)(productNames, {
                    logoHint: logoHint || undefined,
                    refLayout,
                });
                const perProductBlock = (0, product_logo_branding_util_1.buildLogoApplicationPrompt)(productNames, {
                    hasLogo: true,
                    logoHint: logoHint || undefined,
                });
                if (!prompt.includes('REFERENCE IMAGE') && !prompt.includes('REFERENCE IMAGES ORDER')) {
                    prompt = `${prompt} ${catalogLogoBlock}`;
                }
                if (!prompt.includes('LOGO ON EVERY LISTED PRODUCT')) {
                    prompt = `${prompt} ${perProductBlock}`;
                }
                if (!isCatalog) {
                    prompt = `${prompt} ${product_logo_branding_util_1.CATALOG_LOGO_INTEGRATION_FOOTER}`;
                }
            }
            else if (!isCatalog) {
                prompt = `${prompt} ${(0, product_logo_branding_util_1.buildCreativeLogoApplicationPrompt)(logoHint || undefined)} ${product_logo_branding_util_1.CATALOG_LOGO_INTEGRATION_FOOTER}`;
            }
            else if (logoHint) {
                prompt = `${prompt} Apply brand logo faithfully: ${logoHint}`;
            }
        }
        if (isCatalog) {
            prompt = [
                prompt,
                input.catalogColorRules?.trim(),
                input.hasLogo
                    ? `Avoid: pure white background, isolated cutout, product collage, random surface flat lay, stone slab, concrete tabletop, scattered items without box, ${product_logo_branding_util_1.CATALOG_LOGO_AVOID_PROMPT} cheap mockup, amateur lighting.`
                    : 'Avoid: pure white background, isolated cutout, product collage, recoloring to colors not listed for each SKU.',
            ]
                .filter(Boolean)
                .join(' ');
        }
        else if (input.hasLogo) {
            prompt = `${prompt} Avoid: ${product_logo_branding_util_1.CATALOG_LOGO_AVOID_PROMPT} invented logo, generic emblem, abstract cube icon, semi-transparent logo overlay beside products, pasting reference image as layer.`;
        }
        const negativeAvoid = input.negativePrompt?.trim();
        if (negativeAvoid) {
            prompt = `${prompt} Avoid: ${negativeAvoid.slice(0, 500)}.`;
        }
        const refs = [];
        if (isCatalog && productRefCatalogUrls.length > 0) {
            for (let i = 0; i < productRefCatalogUrls.length; i++) {
                const url = productRefCatalogUrls[i];
                const productName = referencedProductNames[i] ?? `item ${i + 1}`;
                const dataUri = await (0, logo_reference_util_1.loadImageDataUriFromUrl)(url, maxSide);
                if (dataUri) {
                    refs.push({
                        url: dataUri,
                        preamble: `Catalog product reference ${i + 1} ("${productName}"): shape, color and material ONLY — ignore stock branding on photo.`,
                    });
                    continue;
                }
                if (publicBase && (url.startsWith('/uploads/') || url.startsWith('/catalog-handoff/'))) {
                    const pub = (0, logo_reference_util_1.resolvePublicAssetUrl)(url, publicBase);
                    if (pub) {
                        refs.push({
                            url: pub,
                            preamble: `Catalog product reference ${i + 1} ("${productName}"): shape, color and material ONLY.`,
                        });
                    }
                    continue;
                }
                this.logger.warn(`Catalog product ref skipped (unavailable): ${url.slice(0, 120)}`);
            }
        }
        if (input.hasLogo && input.logoUrl) {
            const dataUri = await (0, logo_reference_util_1.loadLogoDataUri)(input.logoUrl);
            const logoUrl = dataUri ||
                (publicBase ? (0, logo_reference_util_1.resolvePublicAssetUrl)(input.logoUrl, publicBase) : null);
            if (logoUrl) {
                const logoPreamble = isCatalog ? product_logo_branding_util_1.OPENROUTER_CATALOG_LOGO_REF_PREAMBLE : product_logo_branding_util_1.OPENROUTER_LOGO_REF_PREAMBLE;
                refs.push({ url: logoUrl, preamble: logoPreamble });
            }
            else {
                this.logger.warn(`Logo reference not loaded: ${input.logoUrl}`);
            }
        }
        const catalogPipeline = this.useCatalogImagePipeline(input, isCatalog);
        const model = this.resolveModel(input);
        const modalities = this.resolveModalities(model);
        const imageConfig = this.resolveImageConfig(model, catalogPipeline);
        this.logger.log(`OpenRouter final image (${model}${isCatalog ? ', catalog' : this.isCreativeWithLogo(input) ? ', creative+logo→catalog-model' : ''}): ${prompt.length} chars, refs=${refs.length} (products=${productCount}, logo=${input.hasLogo ? 1 : 0})`);
        const buffer = await (0, openrouter_image_client_1.openrouterGenerateImageBuffer)({
            apiKey: this.getApiKey(),
            model,
            prompt,
            modalities,
            imageConfig,
            referenceImages: refs.length ? refs : undefined,
            timeoutMs: Number(this.config.get('OPENROUTER_IMAGE_TIMEOUT_MS')) || 240_000,
            logger: this.logger,
        });
        (0, fs_1.mkdirSync)((0, path_1.dirname)(input.outputPath), { recursive: true });
        await (0, promises_1.writeFile)(input.outputPath, buffer);
        this.logger.log(`OpenRouter final saved → ${input.outputPath}`);
        return input.outputPath;
    }
    async generateRefinement(input) {
        if (!this.isConfigured())
            throw new Error('OpenRouter image not configured');
        if (!input.sourceSceneUrl?.trim()) {
            throw new Error('Refinement requires sourceSceneUrl (current visualization)');
        }
        if (!input.refinementBrief?.trim()) {
            throw new Error('Refinement brief is empty');
        }
        const publicBase = this.config.get('PUBLIC_API_URL', '').replace(/\/$/, '');
        const maxSide = Number(this.config.get('OPENROUTER_PRODUCT_REF_MAX_PX', '768')) || 768;
        const scenePath = (0, logo_reference_util_1.normalizeAssetPath)(input.sourceSceneUrl);
        const logoHint = input.hasLogo && input.logoUrl ? await (0, logo_reference_util_1.describeLogoForPrompt)(input.logoUrl) : '';
        const isCatalog = input.aiStyle === 'catalog';
        let prompt = input.prompt?.trim() ||
            (0, refine_visualization_prompt_1.buildRefinementImagePrompt)({
                refinementBrief: input.refinementBrief,
                userPrompt: input.userPrompt,
                composition: input.llmComposition,
                productNames: input.productNames,
                hasLogo: input.hasLogo,
                isCatalog,
            });
        if (input.hasLogo && input.logoUrl) {
            const productNames = input.productNames ?? [];
            if (isCatalog && productNames.length > 0) {
                prompt = `${prompt} ${(0, product_logo_branding_util_1.buildCatalogAiLogoReferencePrompt)(productNames, { logoHint: logoHint || undefined })}`;
            }
            else if (!isCatalog && productNames.length > 0) {
                prompt = `${prompt} ${(0, product_logo_branding_util_1.buildCatalogAiLogoReferencePrompt)(productNames, {
                    logoHint: logoHint || undefined,
                    refLayout: 'scene-then-logo',
                })}`;
                prompt = `${prompt} ${(0, product_logo_branding_util_1.buildLogoApplicationPrompt)(productNames, {
                    hasLogo: true,
                    logoHint: logoHint || undefined,
                })}`;
            }
        }
        const refs = [];
        const sceneRef = (await (0, logo_reference_util_1.loadCatalogImageDataUri)(scenePath, maxSide)) ||
            (publicBase ? (0, logo_reference_util_1.resolvePublicAssetUrl)(scenePath, publicBase) : null);
        if (!sceneRef) {
            throw new Error(`Could not load current visualization as reference: ${scenePath}`);
        }
        refs.push({ url: sceneRef });
        if (input.hasLogo && input.logoUrl) {
            const logoPath = (0, logo_reference_util_1.normalizeAssetPath)(input.logoUrl);
            const logoRef = (await (0, logo_reference_util_1.loadLogoDataUri)(logoPath)) ||
                (publicBase ? (0, logo_reference_util_1.resolvePublicAssetUrl)(logoPath, publicBase) : null);
            if (logoRef)
                refs.push({ url: logoRef, preamble: isCatalog ? product_logo_branding_util_1.OPENROUTER_CATALOG_LOGO_REF_PREAMBLE : product_logo_branding_util_1.OPENROUTER_LOGO_REF_PREAMBLE });
            else
                this.logger.warn(`Refine: logo reference not loaded (${logoPath})`);
        }
        const creativeWithLogo = input.aiStyle === 'creative' && input.hasLogo && input.logoUrl;
        const model = isCatalog
            ? this.catalogModel()
            : creativeWithLogo
                ? this.config.get('OPENROUTER_IMAGE_MODEL_CREATIVE_LOGO')?.trim() || this.catalogModel()
                : this.config.get('OPENROUTER_REFINE_MODEL')?.trim() || this.finalModel();
        const imageConfig = this.resolveImageConfig(model, isCatalog || Boolean(creativeWithLogo));
        const attempts = Number(this.config.get('OPENROUTER_IMAGE_RETRIES')) || 2;
        this.logger.log(`OpenRouter refinement (${model}${isCatalog ? ', catalog' : ''}): ${prompt.length} chars, scene=${scenePath}, refs=${refs.length} (logo=${input.hasLogo ? 1 : 0})`);
        await input.onProgress?.(50);
        const refinePrompt = `${prompt} Keep the same products and layout as the FIRST reference image unless the brief explicitly asks to change them.${isCatalog ? ' Avoid floating logos, logo panels in air, detached logo stickers.' : ' Avoid invented logos, generic emblems, floating or semi-transparent logo overlays, pasting reference logo beside products.'}`;
        const modalitySets = [
            this.resolveModalities(model),
            ['image', 'text'],
            ['image'],
        ];
        let lastError = null;
        for (let attempt = 1; attempt <= attempts; attempt++) {
            const modalities = modalitySets[Math.min(attempt - 1, modalitySets.length - 1)];
            try {
                this.logger.log(`OpenRouter refinement attempt ${attempt}/${attempts} (modalities=${modalities.join('+')})`);
                const buffer = await (0, openrouter_image_client_1.openrouterGenerateImageBuffer)({
                    apiKey: this.getApiKey(),
                    model,
                    prompt: refinePrompt,
                    modalities,
                    imageConfig,
                    referenceImages: refs,
                    timeoutMs: Number(this.config.get('OPENROUTER_IMAGE_TIMEOUT_MS')) || 240_000,
                    logger: this.logger,
                });
                await input.onProgress?.(90);
                (0, fs_1.mkdirSync)((0, path_1.dirname)(input.outputPath), { recursive: true });
                await (0, promises_1.writeFile)(input.outputPath, buffer);
                this.logger.log(`OpenRouter refinement saved → ${input.outputPath}`);
                return input.outputPath;
            }
            catch (err) {
                lastError = err instanceof Error ? err : new Error(String(err));
                this.logger.warn(`OpenRouter refinement attempt ${attempt} failed: ${lastError.message}`);
                if (attempt < attempts) {
                    await new Promise((r) => setTimeout(r, 3000 * attempt));
                }
            }
        }
        throw lastError ?? new Error('OpenRouter refinement failed');
    }
};
exports.OpenrouterImageProvider = OpenrouterImageProvider;
exports.OpenrouterImageProvider = OpenrouterImageProvider = OpenrouterImageProvider_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], OpenrouterImageProvider);
//# sourceMappingURL=openrouter-image.provider.js.map
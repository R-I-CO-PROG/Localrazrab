import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdirSync } from 'fs';
import { writeFile } from 'fs/promises';
import { dirname } from 'path';
import sharp from 'sharp';
import { ImageProvider, ImageGenerationInput } from './image.interface';
import { openrouterGenerateImageBuffer, type OpenRouterImageModality, type OpenRouterImageRequest } from './openrouter-image.client';
import {
  describeLogoForPrompt,
  loadCatalogImageDataUri,
  loadImageDataUriFromUrl,
  loadLogoDataUri,
  normalizeAssetPath,
  resolvePublicAssetUrl,
} from '../../generation/logo-reference.util';
import { buildRefinementImagePrompt } from '../../generation/refine-visualization.prompt';
import { aspectRatioFromSize } from './precision-aspect';
import {
  buildPrecisionImprintPrompt,
  PRECISION_REF_PREAMBLES,
  type PrecisionPromptInput,
} from '../../generation/precision-imprint.prompt';
import {
  buildCatalogAiLogoReferencePrompt,
  buildCreativeLogoApplicationPrompt,
  buildLogoApplicationPrompt,
  CATALOG_LOGO_AVOID_PROMPT,
  CATALOG_LOGO_INTEGRATION_FOOTER,
  OPENROUTER_CATALOG_LOGO_REF_PREAMBLE,
  OPENROUTER_LOGO_REF_PREAMBLE,
} from '../../generation/product-logo-branding.util';

@Injectable()
export class OpenrouterImageProvider implements ImageProvider {
  private readonly logger = new Logger(OpenrouterImageProvider.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return (
      this.config.get<string>('OPENROUTER_ENABLED', 'true') === 'true' &&
      Boolean(this.config.get<string>('OPENROUTER_API_KEY', '').trim())
    );
  }

  private getApiKey(): string {
    const key = this.config.get<string>('OPENROUTER_API_KEY', '').trim();
    if (!key) throw new Error('OPENROUTER_API_KEY is not configured');
    return key;
  }

  private previewModel(): string {
    return (
      this.config.get<string>('OPENROUTER_IMAGE_MODEL_PREVIEW') ??
      'black-forest-labs/flux.2-klein-4b'
    );
  }

  private finalModel(): string {
    return (
      this.config.get<string>('OPENROUTER_IMAGE_MODEL_FINAL') ??
      'google/gemini-2.5-flash-image'
    );
  }

  /** Каталожный AI — Nano Banana Pro (Gemini 3 Pro Image) для финальной визуализации */
  private catalogModel(): string {
    return (
      this.config.get<string>('OPENROUTER_IMAGE_MODEL_CATALOG') ??
      'google/gemini-3-pro-image-preview'
    );
  }

  private isCatalogInput(input: ImageGenerationInput): boolean {
    return (
      input.aiStyle === 'catalog' ||
      (input.generationMode === 'ai' &&
        input.aiStyle !== 'creative' &&
        Boolean(input.productNames?.length))
    );
  }

  private isCreativeWithLogo(input: ImageGenerationInput): boolean {
    return input.aiStyle === 'creative' && Boolean(input.hasLogo && input.logoUrl);
  }

  private resolveModel(input: ImageGenerationInput): string {
    if (this.isCatalogInput(input)) return this.catalogModel();
    if (this.isCreativeWithLogo(input)) {
      const model = this.config.get<string>('OPENROUTER_IMAGE_MODEL_CREATIVE_LOGO')?.trim();
      return model || this.catalogModel();
    }
    return this.finalModel();
  }

  private useCatalogImagePipeline(input: ImageGenerationInput, isCatalog: boolean): boolean {
    return isCatalog || this.isCreativeWithLogo(input);
  }

  /** Gemini — image+text; FLUX — только image */
  private resolveModalities(model: string): OpenRouterImageModality[] {
    if (/flux|black-forest-labs/i.test(model)) return ['image'];
    return ['image', 'text'];
  }

  private resolveImageConfig(model: string, isCatalog = false): OpenRouterImageRequest['imageConfig'] {
    const isGemini = /gemini|google/i.test(model);
    const isGptImage = /openai\/gpt.*image|gpt-image/i.test(model);
    if (!isGemini && !isGptImage) return undefined;
    const aspect = isCatalog
      ? (this.config.get<string>('OPENROUTER_CATALOG_ASPECT_RATIO', '4:3') ?? '4:3')
      : (this.config.get<string>('OPENROUTER_FINAL_ASPECT_RATIO', '1:1') ?? '1:1');
    const imageSize = isCatalog
      ? (this.config.get<string>('OPENROUTER_CATALOG_IMAGE_SIZE', '1K') ?? '1K')
      : (this.config.get<string>('OPENROUTER_FINAL_IMAGE_SIZE', '1K') ?? '1K');
    return { aspect_ratio: aspect, image_size: imageSize };
  }

  /** Дешёвое превью: Flux Klein 4B (~$0.014/кадр без aspect_ratio, ~1024×768) */
  async generateConceptPreview(input: {
    title: string;
    narrative: string;
    styleTags?: string[];
    colors?: string[];
    outputPath: string;
  }): Promise<string> {
    if (!this.isConfigured()) throw new Error('OpenRouter image not configured');

    const tags = input.styleTags?.length ? `Style hints: ${input.styleTags.slice(0, 4).join(', ')}.` : '';
    const palette = input.colors?.length
      ? `Use these colors only as a general shade direction, not exact matching: ${input.colors
          .slice(0, 4)
          .join(', ')}.`
      : '';
    // Превью должно быть СХЕМАТИЧНЫМ, не фотореалистичным — чтобы идея читалась с первого взгляда.
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

    const aspect = this.config.get<string>('OPENROUTER_PREVIEW_ASPECT_RATIO', '')?.trim();
    const imageConfig = aspect ? { aspect_ratio: aspect } : undefined;

    const buffer = await openrouterGenerateImageBuffer({
      apiKey: this.getApiKey(),
      model: this.previewModel(),
      prompt,
      modalities: ['image'],
      imageConfig,
      logger: this.logger,
    });

    const jpegQuality = Number(this.config.get<string>('OPENROUTER_PREVIEW_JPEG_QUALITY', '85')) || 85;
    const output = await sharp(buffer).jpeg({ quality: jpegQuality, mozjpeg: true }).toBuffer();
    const meta = await sharp(output).metadata();

    mkdirSync(dirname(input.outputPath), { recursive: true });
    await writeFile(input.outputPath, output);
    this.logger.log(
      `OpenRouter preview (${this.previewModel()}): ${meta.width}×${meta.height}, ${output.length} bytes → ${input.outputPath}`,
    );
    return input.outputPath;
  }

  /** Точное нанесение: оригинал + черновик-разметка + арт + (опционально) схема зоны */
  async generatePrecisionImprint(input: {
    promptInput: PrecisionPromptInput;
    sourcePng: Buffer;
    draftPng: Buffer;
    artPng: Buffer;
    zoneImageUrl?: string | null;
    sceneWidth: number;
    sceneHeight: number;
  }): Promise<{ image: Buffer; prompt: string }> {
    const { prompt, negativePrompt } = buildPrecisionImprintPrompt(input.promptInput);
    const fullPrompt = `${prompt} AVOID: ${negativePrompt}.`;

    const toDataUri = (buf: Buffer) => `data:image/png;base64,${buf.toString('base64')}`;

    const referenceImages: Array<{ url: string; preamble?: string }> = [
      { url: toDataUri(input.sourcePng), preamble: PRECISION_REF_PREAMBLES.source },
      { url: toDataUri(input.draftPng), preamble: PRECISION_REF_PREAMBLES.draft },
      { url: toDataUri(input.artPng), preamble: PRECISION_REF_PREAMBLES.art },
    ];

    if (input.zoneImageUrl) {
      const zoneUri = await loadImageDataUriFromUrl(input.zoneImageUrl).catch(() => null);
      if (zoneUri) referenceImages.push({ url: zoneUri, preamble: PRECISION_REF_PREAMBLES.zone });
    }

    const model = this.catalogModel();
    const image = await openrouterGenerateImageBuffer({
      apiKey: this.getApiKey(),
      model,
      prompt: fullPrompt,
      modalities: this.resolveModalities(model),
      imageConfig: {
        aspect_ratio: aspectRatioFromSize(input.sceneWidth, input.sceneHeight),
        image_size: this.config.get<string>('OPENROUTER_PRECISION_IMAGE_SIZE', '2K') ?? '2K',
      },
      referenceImages,
      logger: this.logger,
    });

    return { image, prompt: fullPrompt };
  }

  /** Финальная визуализация (Gemini Flash Image / Nano Banana через OpenRouter) */
  async generate(input: ImageGenerationInput): Promise<string> {
    if (!this.isConfigured()) throw new Error('OpenRouter image not configured');

    const publicBase = this.config.get<string>('PUBLIC_API_URL', '').replace(/\/$/, '');
    const logoHint =
      input.hasLogo && input.logoUrl ? await describeLogoForPrompt(input.logoUrl) : '';

    const isCatalog = this.isCatalogInput(input);

    const catalogUrls = [
      ...(input.catalogImageUrls ?? []),
      ...(input.products?.map((p) => p.imageUrl).filter(Boolean) as string[]),
    ].filter((url, i, arr) => url && arr.indexOf(url) === i);

    const maxProductRefs =
      Number(this.config.get<string>('OPENROUTER_MAX_PRODUCT_REFS', '6')) || 6;
    const maxTotalRefs =
      Number(this.config.get<string>('OPENROUTER_MAX_REFERENCE_IMAGES', '8')) || 8;
    const hasLogoRef = Boolean(input.hasLogo && input.logoUrl);
    const allowedProductRefs = Math.max(0, Math.min(maxProductRefs, maxTotalRefs - (hasLogoRef ? 1 : 0)));
    const productRefCatalogUrls = catalogUrls.slice(0, allowedProductRefs);
    const referencedProductNames = (input.productNames ?? []).slice(0, productRefCatalogUrls.length);
    const maxSide =
      Number(this.config.get<string>('OPENROUTER_PRODUCT_REF_MAX_PX', '1280')) || 1280;

    const productCount = productRefCatalogUrls.length;
    const productRefHint =
      isCatalog && productCount > 0
        ? `Reference images 1–${productCount} show the EXACT catalog products for: ${referencedProductNames.join(', ') || 'each item'}. Keep each product's silhouette, proportions, geometry, materials and catalog color faithful to its reference — do not redesign or warp the product; apply only the client branding. But IGNORE the reference photos' plain/white backgrounds — do NOT reproduce them; instead compose the products beautifully into the premium scene described in the prompt.`
        : '';
    if (isCatalog && catalogUrls.length > productCount) {
      this.logger.warn(
        `Catalog refs trimmed: products=${catalogUrls.length}, sent=${productCount}, max_total_refs=${maxTotalRefs}`,
      );
    }

    const catalogSceneRules = isCatalog
      ? 'Premium corporate welcome gift box presentation: open matte black presentation box with custom-fit inner compartments, each product nestled in its slot like a luxury B2B unboxing. Soft diffused studio lighting, slight top-down angle, tactile materials, cohesive premium gift-set photography — NOT random surface flat lay, NOT stone or concrete background.'
      : 'Premium corporate MERCH product photograph: all gift-set items on studio surface or flat lay, soft commercial lighting, 8k. ONLY physical branded products — NO vehicles, streets, offices, or people.';

    let prompt =
      input.prompt?.trim() ||
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
        const catalogLogoBlock = buildCatalogAiLogoReferencePrompt(productNames, {
          logoHint: logoHint || undefined,
          refLayout,
        });
        const perProductBlock = buildLogoApplicationPrompt(productNames, {
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
          prompt = `${prompt} ${CATALOG_LOGO_INTEGRATION_FOOTER}`;
        }
      } else if (!isCatalog) {
        prompt = `${prompt} ${buildCreativeLogoApplicationPrompt(logoHint || undefined)} ${CATALOG_LOGO_INTEGRATION_FOOTER}`;
      } else if (logoHint) {
        prompt = `${prompt} Apply brand logo faithfully: ${logoHint}`;
      }
    }

    if (isCatalog) {
      prompt = [
        prompt,
        input.catalogColorRules?.trim(),
        input.hasLogo
          ? `Avoid: pure white background, isolated cutout, product collage, random surface flat lay, stone slab, concrete tabletop, scattered items without box, ${CATALOG_LOGO_AVOID_PROMPT} cheap mockup, amateur lighting.`
          : 'NO BRANDING: keep every product completely blank and unbranded; do not invent or add any logo, brand mark, emblem, wordmark or text; remove any stock/vendor logo present in the reference photos. Avoid: pure white background, isolated cutout, product collage, recoloring to colors not listed for each SKU, any logo, invented logo, brand mark, emblem, company name, printed text on product, label, sticker, badge, stock or vendor logo from reference.',
      ]
        .filter(Boolean)
        .join(' ');
    } else if (input.hasLogo) {
      prompt = `${prompt} Avoid: ${CATALOG_LOGO_AVOID_PROMPT} invented logo, generic emblem, abstract cube icon, semi-transparent logo overlay beside products, pasting reference image as layer.`;
    }

    const negativeAvoid = input.negativePrompt?.trim();
    if (negativeAvoid) {
      prompt = `${prompt} Avoid: ${negativeAvoid.slice(0, 500)}.`;
    }

    const refs: Array<{ url: string; preamble?: string }> = [];

    if (isCatalog && productRefCatalogUrls.length > 0) {
      for (let i = 0; i < productRefCatalogUrls.length; i++) {
        const url = productRefCatalogUrls[i];
        const productName = referencedProductNames[i] ?? `item ${i + 1}`;
        const dataUri = await loadImageDataUriFromUrl(url, maxSide);
        if (dataUri) {
          refs.push({
            url: dataUri,
            preamble: `Catalog product reference ${i + 1} ("${productName}"): reproduce THIS PRODUCT faithfully — same shape, proportions, material and catalog color; only apply the client branding. Ignore the photo's background and any stock branding — place the product into the premium scene, do not copy its plain background.`,
          });
          continue;
        }
        if (publicBase && (url.startsWith('/uploads/') || url.startsWith('/catalog-handoff/'))) {
          const pub = resolvePublicAssetUrl(url, publicBase);
          if (pub) {
            refs.push({
              url: pub,
              preamble: `Catalog product reference ${i + 1} ("${productName}") is the EXACT product. Reproduce it identically (shape, proportions, material, color); only apply the client branding, do not redesign or warp it.`,
            });
          }
          continue;
        }
        this.logger.warn(`Catalog product ref skipped (unavailable): ${url.slice(0, 120)}`);
      }
    }

    if (input.hasLogo && input.logoUrl) {
      const dataUri = await loadLogoDataUri(input.logoUrl);
      const logoUrl =
        dataUri ||
        (publicBase ? resolvePublicAssetUrl(input.logoUrl, publicBase) : null);
      if (logoUrl) {
        const logoPreamble = isCatalog ? OPENROUTER_CATALOG_LOGO_REF_PREAMBLE : OPENROUTER_LOGO_REF_PREAMBLE;
        refs.push({ url: logoUrl, preamble: logoPreamble });
      } else {
        this.logger.warn(`Logo reference not loaded: ${input.logoUrl}`);
      }
    }

    const catalogPipeline = this.useCatalogImagePipeline(input, isCatalog);
    const model = this.resolveModel(input);
    const modalities = this.resolveModalities(model);
    const imageConfig = this.resolveImageConfig(model, catalogPipeline);

    this.logger.log(
      `OpenRouter final image (${model}${isCatalog ? ', catalog' : this.isCreativeWithLogo(input) ? ', creative+logo→catalog-model' : ''}): ${prompt.length} chars, refs=${refs.length} (products=${productCount}, logo=${input.hasLogo ? 1 : 0})`,
    );

    const buffer = await openrouterGenerateImageBuffer({
      apiKey: this.getApiKey(),
      model,
      prompt,
      modalities,
      imageConfig,
      referenceImages: refs.length ? refs : undefined,
      timeoutMs: Number(this.config.get('OPENROUTER_IMAGE_TIMEOUT_MS')) || 240_000,
      logger: this.logger,
    });

    mkdirSync(dirname(input.outputPath), { recursive: true });
    await writeFile(input.outputPath, buffer);
    this.logger.log(`OpenRouter final saved → ${input.outputPath}`);
    return input.outputPath;
  }

  /** Перегенерация: текущая сцена + логотип через OpenRouter image model */
  async generateRefinement(input: ImageGenerationInput): Promise<string> {
    if (!this.isConfigured()) throw new Error('OpenRouter image not configured');
    if (!input.sourceSceneUrl?.trim()) {
      throw new Error('Refinement requires sourceSceneUrl (current visualization)');
    }
    if (!input.refinementBrief?.trim()) {
      throw new Error('Refinement brief is empty');
    }

    const publicBase = this.config.get<string>('PUBLIC_API_URL', '').replace(/\/$/, '');
    const maxSide =
      Number(this.config.get<string>('OPENROUTER_PRODUCT_REF_MAX_PX', '768')) || 768;
    const scenePath = normalizeAssetPath(input.sourceSceneUrl);

    const logoHint =
      input.hasLogo && input.logoUrl ? await describeLogoForPrompt(input.logoUrl) : '';

    const isCatalog = input.aiStyle === 'catalog';

    let prompt =
      input.prompt?.trim() ||
      buildRefinementImagePrompt({
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
        prompt = `${prompt} ${buildCatalogAiLogoReferencePrompt(productNames, { logoHint: logoHint || undefined })}`;
      } else if (!isCatalog && productNames.length > 0) {
        prompt = `${prompt} ${buildCatalogAiLogoReferencePrompt(productNames, {
          logoHint: logoHint || undefined,
          refLayout: 'scene-then-logo',
        })}`;
        prompt = `${prompt} ${buildLogoApplicationPrompt(productNames, {
          hasLogo: true,
          logoHint: logoHint || undefined,
        })}`;
      }
    }

    const refs: Array<{ url: string; preamble?: string }> = [];
    const sceneRef =
      (await loadCatalogImageDataUri(scenePath, maxSide)) ||
      (publicBase ? resolvePublicAssetUrl(scenePath, publicBase) : null);
    if (!sceneRef) {
      throw new Error(`Could not load current visualization as reference: ${scenePath}`);
    }
    refs.push({ url: sceneRef });

    // Реальные фото товаров — чтобы при НОВОЙ композиции товар оставался точным.
    const productUrls = (input.catalogImageUrls ?? []).filter(Boolean).slice(0, 6);
    for (let i = 0; i < productUrls.length; i++) {
      const rawUrl = productUrls[i];
      const p = normalizeAssetPath(rawUrl);
      // Фото товаров каталога — это УДАЛЁННЫЕ URL поставщика (s.a-5.ru и т.п.).
      // normalizeAssetPath срезает хост → локальный лоадер не находит файл → падаем
      // на resolvePublicAssetUrl(mercai.ru/...) → 404 → OpenRouter HTTP 400 → refine рушится.
      // Грузим по СЫРОМУ url (локально-или-remote-fetch), как в generateFromScene.
      const dataUri =
        (await loadImageDataUriFromUrl(rawUrl, maxSide)) ||
        (await loadCatalogImageDataUri(p, maxSide)) ||
        // Публичный URL — ТОЛЬКО для реально локальных путей; для remote чужой хост = 404 у OpenRouter.
        (publicBase &&
        (rawUrl.startsWith('/uploads/') || rawUrl.startsWith('/catalog-handoff/'))
          ? resolvePublicAssetUrl(p, publicBase)
          : null);
      if (dataUri) {
        refs.push({
          url: dataUri,
          preamble: `Product reference ${i + 1} is the EXACT product — reproduce it IDENTICALLY: same model, shape, proportions, material, texture and color. Do NOT swap it for a different product, do NOT change its material, do NOT add or remove details (no extra rings, holes or decorations). ${input.hasLogo ? 'Apply only the client branding.' : 'Keep it completely blank/unbranded, remove any stock logo.'} Ignore its background.`,
        });
      }
    }

    if (input.hasLogo && input.logoUrl) {
      const logoPath = normalizeAssetPath(input.logoUrl);
      const logoRef =
        (await loadLogoDataUri(logoPath)) ||
        (publicBase ? resolvePublicAssetUrl(logoPath, publicBase) : null);
      if (logoRef) refs.push({ url: logoRef, preamble: isCatalog ? OPENROUTER_CATALOG_LOGO_REF_PREAMBLE : OPENROUTER_LOGO_REF_PREAMBLE });
      else this.logger.warn(`Refine: logo reference not loaded (${logoPath})`);
    }

    const creativeWithLogo = input.aiStyle === 'creative' && input.hasLogo && input.logoUrl;
    const model = isCatalog
      ? this.catalogModel()
      : creativeWithLogo
        ? this.config.get<string>('OPENROUTER_IMAGE_MODEL_CREATIVE_LOGO')?.trim() || this.catalogModel()
        : this.config.get<string>('OPENROUTER_REFINE_MODEL')?.trim() || this.finalModel();
    const imageConfig = this.resolveImageConfig(model, isCatalog || Boolean(creativeWithLogo));
    const attempts = Number(this.config.get('OPENROUTER_IMAGE_RETRIES')) || 2;

    this.logger.log(
      `OpenRouter refinement (${model}${isCatalog ? ', catalog' : ''}): ${prompt.length} chars, scene=${scenePath}, refs=${refs.length} (logo=${input.hasLogo ? 1 : 0})`,
    );

    await input.onProgress?.(50);

    // При «Пересоздать» НЕ замораживаем layout (иначе «почти ничего не меняет») — держим точность
    // ТОВАРОВ, но сцену можно перекомпоновать. При точечной правке — держим товары и композицию.
    const productLock = input.wantsNewComposition
      ? 'Every product must stay IDENTICAL to its reference photo (same item, material, details) — ONLY the scene, arrangement, angle, lighting and background may change; never swap or alter a product.'
      : 'Every product must stay IDENTICAL to its reference photo; apply ONLY the requested change and keep everything else as-is.';
    const refinePrompt = `${prompt} ${productLock}${isCatalog ? ' Avoid floating logos, logo panels in air, detached logo stickers.' : ' Avoid invented logos, generic emblems, floating or semi-transparent logo overlays, pasting reference logo beside products.'}`;
    const modalitySets: OpenRouterImageModality[][] = [
      this.resolveModalities(model),
      ['image', 'text'],
      ['image'],
    ];
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      const modalities = modalitySets[Math.min(attempt - 1, modalitySets.length - 1)];
      try {
        this.logger.log(
          `OpenRouter refinement attempt ${attempt}/${attempts} (modalities=${modalities.join('+')})`,
        );
        const buffer = await openrouterGenerateImageBuffer({
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

        mkdirSync(dirname(input.outputPath), { recursive: true });
        await writeFile(input.outputPath, buffer);
        this.logger.log(`OpenRouter refinement saved → ${input.outputPath}`);
        return input.outputPath;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        this.logger.warn(`OpenRouter refinement attempt ${attempt} failed: ${lastError.message}`);
        if (attempt < attempts) {
          await new Promise((r) => setTimeout(r, 3000 * attempt));
        }
      }
    }

    throw lastError ?? new Error('OpenRouter refinement failed');
  }
}

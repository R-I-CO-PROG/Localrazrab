import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker, Job } from 'bullmq';
import { join } from 'path';
import { mkdirSync, existsSync } from 'fs';
import { PrismaService } from '../prisma/prisma.service';
import { LlmProviderFactory } from '../providers/llm/llm.provider';
import { ImageProviderFactory } from '../providers/image/image.provider';
import { GENERATION_QUEUE, GenerationJobData } from './generation.queue';
import { GenerationStatus, RequestStatus } from '@prisma/client';
import {
  buildProductMockupPrompt,
  buildCompactImagePrompt,
  GenerationSnapshot,
} from './prompt-builder';
import { describeLogoForPrompt } from './logo-reference.util';
import type { GenerationImageMode } from './generation.queue';
import { LlmBriefService } from '../providers/llm/llm-brief.service';
import { filterCatalogByConstraints } from '../providers/llm/catalog.util';
import {
  filterCatalogForRequest,
  shortlistCatalogForLlm,
} from '../providers/llm/catalog-filter.util';
import { shouldRespectUserProducts } from '../providers/llm/respect-user-products';
import { defaultItemCount } from '../providers/llm/parse-desired-count';
import {
  buildCatalogAiImagePrompt,
  buildCatalogAiNegativePrompt,
} from './catalog-ai-image-prompt';
import { detectTypeSlug } from '../concept/product-taxonomy';
import { resolveProductSizeCm } from '../providers/llm/product-dimensions.util';
import {
  buildAiImagePrompt,
  buildAiNegativePrompt,
  buildCreativeAiImagePrompt,
  buildCreativeAiNegativePrompt,
} from './llm-image-prompt';
import { ConceptPromptService } from '../agents/concept-prompt.service';
import { isCreativeAgentPipelineEnabled } from '../agents/agent-run.queue';
import type { BriefInterpretResult } from '../providers/llm/llm-brief.service';
import { persistGenerationResultImage } from './persist-result-image.util';
import { buildGenerationOutputFilename } from './generation-output-path.util';
import { mergeConceptResult } from './concept-result.util';
import {
  ensureInitialVisualizationVariant,
  processRefineVisualizationJob,
} from './refine-visualization.processor';
import { OpenrouterImageProvider } from '../providers/image/openrouter-image.provider';
import { resolveCatalogImageUrl } from '../products/product-image.util';
import { resolveProductsFromSnapshot, resolveCatalogImageUrlsFromSnapshot } from './resolve-snapshot-products';
import {
  buildCatalogProductColorSpecs,
  formatCatalogColorRulesShort,
} from './catalog-product-color-rules.util';
import { creativeProductDisplayName } from './creative-merch-visual.util';
import type { Concept } from '../agents/contracts';

function getUploadsDir() {
  return process.env.UPLOADS_DIR || join(process.cwd(), '../../uploads');
}

@Injectable()
export class GenerationProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GenerationProcessor.name);
  private worker: Worker<GenerationJobData> | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly llmFactory: LlmProviderFactory,
    private readonly llmBrief: LlmBriefService,
    private readonly imageFactory: ImageProviderFactory,
    private readonly conceptPrompt: ConceptPromptService,
    private readonly openrouter: OpenrouterImageProvider,
  ) {}

  onModuleInit() {
    const redisUrl = this.config.get<string>('REDIS_URL', 'redis://localhost:6379');
    const aiKeys = [
      this.config.get('OPENROUTER_API_KEY')?.trim() && 'openrouter',
      this.config.get('HUGGINGFACE_API_KEY')?.trim() && 'huggingface',
    ].filter(Boolean);
    this.logger.log(
      `Providers: LLM=${this.config.get('LLM_PROVIDER')}, IMAGE=${this.config.get('IMAGE_PROVIDER')}, ` +
        `AI keys=[${aiKeys.length ? aiKeys.join(',') : 'NONE — mockup only'}]`,
    );

    this.worker = new Worker<GenerationJobData>(
      GENERATION_QUEUE,
      async (job) => this.process(job),
      {
        connection: { url: redisUrl },
        // SeeDream poll + медленный CDN img.theapi.app — до 10+ минут
        lockDuration: Number(this.config.get('GENERATION_LOCK_MS')) || 900_000,
        stalledInterval: 120_000,
        concurrency: Number(this.config.get('GENERATION_CONCURRENCY', '2')) || 2,
      },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(`Job ${job?.id} failed: ${err.message}`);
    });

    this.logger.log('Generation worker started');
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }

  private buildLlmInput(snapshot: Record<string, unknown>) {
    return {
      userPrompt: (snapshot.userPrompt as string) ?? '',
      category: (snapshot.category as string) ?? '',
      quantity: snapshot.quantity as number | null,
      budgetMin: snapshot.budgetMin as number | null,
      budgetMax: snapshot.budgetMax as number | null,
      colors: (snapshot.colors as string[]) ?? [],
      allowedItems: (snapshot.allowedItems as string[]) ?? [],
      forbiddenItems: (snapshot.forbiddenItems as string[]) ?? [],
      productNames: (snapshot.productNames as string[]) ?? [],
      hasLogo: Boolean(snapshot.hasLogo),
      logoUrl: (snapshot.logoUrl as string) ?? null,
      notes: (snapshot.notes as string) ?? null,
    };
  }

  private async process(job: Job<GenerationJobData>) {
    if (job.data.jobType === 'refine') {
      return this.processRefine(job);
    }

    const { generationId, requestId, debug, mode: jobMode } = job.data;
    this.logger.log(`Processing generation ${generationId} (mode=${jobMode ?? 'mockup'}, debug=${debug})`);

    await this.prisma.generation.update({
      where: { id: generationId },
      data: { status: GenerationStatus.generating, startedAt: new Date() },
    });
    await job.updateProgress(5);

    let conceptPromptUsed = false;

    try {
      const generation = await this.prisma.generation.findUniqueOrThrow({
        where: { id: generationId },
      });
      const snapshot = generation.inputSnapshot as Record<string, unknown>;
      const baseLlmInput = this.buildLlmInput(snapshot);

      const generationModeEarly =
        (snapshot.generationMode as GenerationImageMode) ?? jobMode ?? 'mockup';
      const aiStyle = (snapshot.aiStyle as 'catalog' | 'creative') ?? 'catalog';
      const isCreativeAi = generationModeEarly === 'ai' && aiStyle === 'creative';
      const openrouterImageModel = isCreativeAi
        ? (this.config.get<string>('OPENROUTER_IMAGE_MODEL_FINAL') ??
          'google/gemini-2.5-flash-image')
        : (this.config.get<string>('OPENROUTER_IMAGE_MODEL_CATALOG') ??
          'google/gemini-3-pro-image-preview');

      let fullCatalog: Awaited<ReturnType<LlmBriefService['loadFullCatalog']>> = [];
      let eligibleCatalog: typeof fullCatalog = [];
      let respectUser = false;
      let catalogForLlm: typeof fullCatalog = [];

      if (!isCreativeAi) {
        const lockedProductIds = ((snapshot.productIds as string[]) ?? []).filter(Boolean);
        const filterInput = {
          userPrompt: baseLlmInput.userPrompt,
          quantity: baseLlmInput.quantity,
          budgetMin: baseLlmInput.budgetMin,
          budgetMax: baseLlmInput.budgetMax,
          colors: baseLlmInput.colors,
          allowedItems: baseLlmInput.allowedItems,
          forbiddenItems: baseLlmInput.forbiddenItems,
        };

        if (lockedProductIds.length > 0) {
          this.logger.log(
            `Catalog viz: ${lockedProductIds.length} locked SKU — skip full catalog load`,
          );
          fullCatalog = await this.llmBrief.loadProductsByIds(lockedProductIds);
          eligibleCatalog = fullCatalog;
          respectUser = true;
          catalogForLlm = fullCatalog;
        } else {
          fullCatalog = await this.llmBrief.loadFullCatalog();
          eligibleCatalog = filterCatalogForRequest(fullCatalog, filterInput);

          const desiredCount = defaultItemCount(baseLlmInput.userPrompt);
          respectUser =
            this.config.get<string>('LLM_RESPECT_USER_PRODUCTS', 'true') === 'true' &&
            shouldRespectUserProducts({
              ...baseLlmInput,
              catalogProducts: fullCatalog,
              desiredItemCount: desiredCount,
            });

          catalogForLlm =
            respectUser && baseLlmInput.productNames.length > 0
              ? fullCatalog.filter((p) => baseLlmInput.productNames.includes(p.name))
              : await shortlistCatalogForLlm(eligibleCatalog, filterInput, 120);

          if (respectUser && baseLlmInput.productNames.length > 0) {
            this.logger.log(
              `LLM compact mode: ${catalogForLlm.length} user products (skip full catalog)`,
            );
          }
        }
      } else {
        this.logger.log('Creative mode: catalog skipped entirely');
      }

      let llmInput = this.llmBrief.buildInput({
        ...baseLlmInput,
        catalog: isCreativeAi ? [] : catalogForLlm,
        sceneOnly: !isCreativeAi && respectUser && baseLlmInput.productNames.length > 0,
        creativeMode: isCreativeAi,
      });
      if (isCreativeAi && (!llmInput.hasLogo || !llmInput.logoUrl)) {
        const fallbackLogo = await this.prisma.asset.findFirst({
          where: { requestId, type: 'logo' },
          select: { url: true },
        });
        if (fallbackLogo?.url) {
          llmInput = { ...llmInput, hasLogo: true, logoUrl: fallbackLogo.url };
          this.logger.warn(
            `Creative logo fallback applied from request assets (${fallbackLogo.url})`,
          );
        } else {
          this.logger.warn(
            `Creative generation without logo: no logo in snapshot and no logo asset for request ${requestId}`,
          );
        }
      }

      const chosenIdeaTitle = (snapshot.chosenIdeaTitle as string | null)?.trim() || undefined;
      const useConceptPrompt = isCreativeAi && isCreativeAgentPipelineEnabled(this.config);

      let brief: BriefInterpretResult;
      let selectedConcept: Concept | undefined;

      if (useConceptPrompt) {
        if (!chosenIdeaTitle) {
          throw new Error('Выберите концепцию перед генерацией фото');
        }
        await job.updateProgress(12);
        this.logger.log(
          `Creative: PromptBuilder for «${chosenIdeaTitle}» → OpenRouter ${openrouterImageModel}`,
        );
        const { promptOutput, concept } = await this.conceptPrompt.buildPromptForGeneration(
          requestId,
          chosenIdeaTitle,
          undefined,
          (snapshot.sceneBrief as string | null) ?? undefined,
        );
        selectedConcept = concept;
        conceptPromptUsed = true;

        const creativeProductNames = concept.items.map((i) => creativeProductDisplayName(i));

        brief = {
          output: {
            image_prompt: promptOutput.imagePrompt,
            negative_prompt: promptOutput.negativePrompt,
            composition: concept.narrative || concept.description,
            style: promptOutput.style,
            items: creativeProductNames,
          },
          provider: 'agent-prompt-builder',
          usedFallback: false,
          error: null,
          userPayload: {
            mode: 'generation',
            task: llmInput.userPrompt,
            category: llmInput.category,
            quantity: llmInput.quantity,
            budget: { min: llmInput.budgetMin, max: llmInput.budgetMax },
            colors: llmInput.colors,
            brand_colors_hex: null,
            products: [],
            has_logo: llmInput.hasLogo,
            logo_uploaded: llmInput.hasLogo,
            lock_user_products: false,
            chosenIdeaTitle,
          } as unknown as BriefInterpretResult['userPayload'],
          modelUsed: 'openrouter/prompt-builder',
          products: [],
        };
      } else {
        brief = await this.llmBrief.interpretForGeneration(llmInput, eligibleCatalog);
      }

      await job.updateProgress(35);
      const resolvedProducts = isCreativeAi
        ? []
        : resolveProductsFromSnapshot(snapshot, fullCatalog, brief.products);
      const creativeProductNames = isCreativeAi
        ? (brief.output.items?.length
            ? brief.output.items
            : selectedConcept?.items.map((i) => creativeProductDisplayName(i)) ?? [])
        : [];
      const llmOutput = {
        ...brief.output,
        items: isCreativeAi ? creativeProductNames : resolvedProducts.map((p) => p.name),
      };
      this.logger.log(
        `Image products (${isCreativeAi ? creativeProductNames.length : resolvedProducts.length}): ${isCreativeAi ? creativeProductNames.join(', ') : resolvedProducts.map((p) => p.name).join(', ')}`,
      );
      const providerName = brief.provider;
      const usedFallback = brief.usedFallback;
      const llmError = brief.error;
      const userPayload = brief.userPayload;
      const usedRealLlm =
        conceptPromptUsed ||
        (!brief.provider.startsWith('stub') &&
          (brief.provider === 'local-scene' ||
            brief.provider.includes('gemini') ||
            brief.provider.includes('openrouter') ||
            brief.provider.includes('deepseek') ||
            brief.provider.includes('agent-prompt') ||
            !usedFallback));

      const productNames = isCreativeAi ? creativeProductNames : resolvedProducts.map((p) => p.name);
      const catalogImageUrls = resolveCatalogImageUrlsFromSnapshot(snapshot, resolvedProducts);
      const silhouetteUrls = catalogImageUrls;

      const targetColorEntries =
        (snapshot.productTargetColors as Array<{ productId: string; color: string }> | undefined) ??
        [];
      const targetByProductId = Object.fromEntries(
        targetColorEntries.map((e) => [e.productId, e.color]),
      );
      const catalogColorSpecs = !isCreativeAi
        ? buildCatalogProductColorSpecs(resolvedProducts, targetByProductId)
        : [];
      const catalogColorRulesShort = formatCatalogColorRulesShort(catalogColorSpecs);

      const genSnapshot: GenerationSnapshot = {
        userPrompt: llmInput.userPrompt,
        category: llmInput.category,
        quantity: llmInput.quantity,
        colors: llmInput.colors,
        productNames,
        hasLogo: llmInput.hasLogo,
        logoUrl: llmInput.logoUrl,
      };

      const finalPrompt = buildProductMockupPrompt(llmOutput, genSnapshot);
      const compactPrompt = buildCompactImagePrompt(llmOutput, genSnapshot);
      this.logger.log(`Image prompt: full=${finalPrompt.length} compact=${compactPrompt.length} chars`);

      const preImageLlmOutput: Record<string, unknown> = {
        items: llmOutput.items,
        composition: llmOutput.composition,
        style: llmOutput.style,
        image_prompt: llmOutput.image_prompt,
        negative_prompt: llmOutput.negative_prompt,
      };

      const generatedDir = join(getUploadsDir(), 'generated');
      if (!existsSync(generatedDir)) mkdirSync(generatedDir, { recursive: true });

      const outputFilename = buildGenerationOutputFilename(generationId, snapshot);
      const outputPath = join(generatedDir, outputFilename);

      const logoPublicUrl = snapshot.logoPublicUrl as string | null;
      const mockupProducts = resolvedProducts.map((p, i) => ({
        name: p.name,
        imageUrl: catalogImageUrls[i] ?? resolveCatalogImageUrl(p),
      }));
      const generationMode = generationModeEarly;
      const providerChain = this.imageFactory.getProviderChainForMode(generationMode, {
        aiStyle: isCreativeAi ? 'creative' : 'catalog',
      });
      const primaryProviderName = providerChain[0]?.name ?? 'mockup';
      const isMockupMode = generationMode === 'mockup';
      const isAiMode = generationMode === 'ai';

      // AI (каталог и креатив): логотип ТОЛЬКО через нейросеть — референс PNG в OpenRouter.
      // Серверный post-compose (Sharp overlay) отключён полностью.
      const aiLogoHint =
        isAiMode && llmInput.hasLogo && llmInput.logoUrl
          ? await describeLogoForPrompt(llmInput.logoUrl)
          : '';
      const sceneBrief = (snapshot.sceneBrief as string | null)?.trim() || undefined;
      // Переключатель «в подарочной коробке (ложемент)» + типы товаров для детекции
      // крупногабарита (чемодан/зонт → рядом с коробкой, не внутрь).
      const giftBoxEnabled = (snapshot as { giftBoxEnabled?: boolean }).giftBoxEnabled !== false;
      const catalogProductTypes = resolvedProducts.map((p) => detectTypeSlug(p));
      // Размеры товаров (см) для правильного относительного масштаба на визуализации:
      // реальные габариты из каталога → иначе типовой размер по типу товара.
      const catalogProductSizes = resolvedProducts.map((p, i) => {
        const resolved = resolveProductSizeCm(
          {
            widthCm: p.widthCm ?? undefined,
            heightCm: p.heightCm ?? undefined,
            depthCm: p.depthCm ?? undefined,
          },
          catalogProductTypes[i],
        );
        return {
          name: p.name,
          longestCm: resolved?.longestCm ?? 0,
          sizeClass: resolved?.sizeClass ?? 'medium',
        };
      });
      const logoPromptOptions = { deferLogoToPostComposite: false };
      const aiEnhancePrompt = isAiMode
        ? isCreativeAi
          ? buildCreativeAiImagePrompt(
              llmOutput,
              { ...genSnapshot, userPrompt: llmInput.userPrompt },
              aiLogoHint || undefined,
              usedRealLlm,
              sceneBrief,
              { ...logoPromptOptions, conceptItems: selectedConcept?.items },
            )
          : buildCatalogAiImagePrompt(
              llmOutput,
              { ...genSnapshot, userPrompt: llmInput.userPrompt },
              aiLogoHint || undefined,
              usedRealLlm,
              catalogColorSpecs,
              sceneBrief,
              {
                ...logoPromptOptions,
                giftBoxEnabled,
                productTypes: catalogProductTypes,
                productSizes: catalogProductSizes,
              },
            )
        : '';
      const aiEnhanceNegative = isAiMode
        ? isCreativeAi
          ? buildCreativeAiNegativePrompt(llmOutput, genSnapshot, usedRealLlm, logoPromptOptions)
          : buildCatalogAiNegativePrompt(llmOutput, genSnapshot, usedRealLlm, {
              ...logoPromptOptions,
              giftBoxEnabled,
              productTypes: catalogProductTypes,
            })
        : '';
      const openrouterConfigured =
        this.config.get<string>('OPENROUTER_ENABLED', 'true') === 'true' &&
        Boolean(this.config.get<string>('OPENROUTER_API_KEY', '').trim());

      const imageInput = {
        prompt: isAiMode ? aiEnhancePrompt : compactPrompt,
        negativePrompt: isAiMode ? aiEnhanceNegative : llmOutput.negative_prompt,
        outputPath,
        width:
          Number(this.config.get(isAiMode ? 'AI_ENHANCE_WIDTH' : isMockupMode ? 'MOCKUP_WIDTH' : 'IMAGE_WIDTH')) ||
          (isAiMode ? 768 : 1024),
        height:
          Number(this.config.get(isAiMode ? 'AI_ENHANCE_HEIGHT' : isMockupMode ? 'MOCKUP_HEIGHT' : 'IMAGE_HEIGHT')) ||
          (isAiMode ? 768 : 1024),
        referenceImageUrl: logoPublicUrl ?? undefined,
        productNames,
        products: mockupProducts,
        category: llmInput.category,
        quantity: llmInput.quantity,
        silhouetteUrls,
        catalogImageUrls,
        llmPickedProducts: productNames.length > 0 && baseLlmInput.productNames.length === 0,
        colors: llmInput.colors,
        logoUrl: llmInput.logoUrl,
        hasLogo: llmInput.hasLogo,
        userPrompt: llmInput.userPrompt,
        generationMode,
        aiStyle: (isCreativeAi ? 'creative' : 'catalog') as 'catalog' | 'creative',
        llmImagePrompt: isAiMode ? aiEnhancePrompt : undefined,
        llmComposition: isAiMode ? llmOutput.composition : undefined,
        llmStyle: isAiMode ? llmOutput.style : undefined,
        catalogColorRules: isAiMode && !isCreativeAi ? catalogColorRulesShort : undefined,
        onProgress: async (pct: number) => {
          try {
            await job.updateProgress(Math.min(99, Math.max(55, pct)));
          } catch {
            // ignore progress update races
          }
        },
      };

      const pollinationsProvider = this.imageFactory.getPollinationsProvider();
      const aiPollinationsInput = isAiMode
        ? {
            ...imageInput,
            prompt: aiEnhancePrompt,
            negativePrompt: aiEnhanceNegative,
            imageModel: llmInput.hasLogo && logoPublicUrl ? 'flux' : 'flux',
            referenceImageUrl: llmInput.hasLogo ? logoPublicUrl ?? undefined : undefined,
          }
        : imageInput;
      const pollinationsUrl = pollinationsProvider.buildImageUrl(
        isAiMode ? aiEnhancePrompt : compactPrompt,
        aiPollinationsInput,
      );

      const partialDebug =
        debug
          ? {
              llm: {
                provider: providerName,
                systemPrompt: this.llmBrief.getSystemPrompt(
                  brief.userPayload.lock_user_products === true,
                  isCreativeAi,
                ),
                userPayload,
                userMessage: this.llmBrief.getUserMessage(userPayload),
                response: llmOutput,
                resolvedProducts: productNames,
                desiredItemCount: llmInput.desiredItemCount,
                modelUsed: brief.modelUsed,
                error: llmError,
                usedFallback,
                usedRealLlm,
              },
              image: {
                status: 'pending' as const,
                provider: primaryProviderName,
                promptFromLlm: llmOutput.image_prompt,
                finalPrompt,
                compactPrompt,
                aiEnhancePrompt: isAiMode ? aiEnhancePrompt : undefined,
                openrouterModel: isAiMode ? openrouterImageModel : undefined,
                aiEnhanceNegative: isAiMode ? aiEnhanceNegative : undefined,
                generationMode,
                pollinationsUrl,
                referenceImageUrl: logoPublicUrl ?? null,
                providerChain: providerChain.map((c) => c.name),
                openrouterConfigured,
                mockupProducts,
                logoNote: isAiMode
                  ? isCreativeAi
                    ? `OpenRouter creative: txt2img + логотип как референс → сцена с брендингом`
                    : `${openrouterImageModel}: фото каталога + логотип → единая AI-сцена с брендингом`
                  : 'Точный мокап из каталога',
              },
              inputSnapshot: snapshot,
            }
          : undefined;

      await this.prisma.generation.update({
        where: { id: generationId },
        data: {
          llmOutput: partialDebug
            ? ({ ...preImageLlmOutput, _debug: partialDebug } as object)
            : (preImageLlmOutput as object),
          imagePrompt: finalPrompt,
          negativePrompt: llmOutput.negative_prompt,
        },
      });
      await job.updateProgress(55);

      let imageProviderUsed = primaryProviderName;
      let imageUsedFallback = false;
      let generatedOutput: string | null = null;
      const imageErrors: string[] = [];

      for (let i = 0; i < providerChain.length; i++) {
        const { name, provider } = providerChain[i];
        try {
          this.logger.log(`Image provider [${i + 1}/${providerChain.length}]: ${name}`);
          await job.updateProgress(60);
          generatedOutput = await provider.generate(imageInput);
          await job.updateProgress(85);
          imageProviderUsed = name;
          imageUsedFallback = i > 0;
          break;
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown image error';
          imageErrors.push(`${name}: ${msg}`);
          this.logger.warn(`Image (${name}) failed: ${msg}`);
          if (i === providerChain.length - 1) {
            throw new Error(imageErrors.join(' | '));
          }
        }
      }

      let logoOverlayApplied = false;
      if (!generatedOutput) {
        throw new Error('Image provider returned empty output');
      }

      let resultImageUrl: string;
      try {
        resultImageUrl = await persistGenerationResultImage(generatedOutput, outputPath);
      } catch (persistErr) {
        const msg = persistErr instanceof Error ? persistErr.message : String(persistErr);
        throw new Error(`Could not save result image locally: ${msg}`);
      }
      const resultIsRemoteUrl = false;

      const logoOnMockup =
        (isMockupMode || imageProviderUsed === 'mockup') && llmInput.hasLogo && Boolean(llmInput.logoUrl);
      if (logoOnMockup) {
        logoOverlayApplied = true;
      }

      const llmStored: Record<string, unknown> = {
        items: llmOutput.items,
        composition: llmOutput.composition,
        style: llmOutput.style,
        image_prompt: llmOutput.image_prompt,
        negative_prompt: llmOutput.negative_prompt,
        _resultMeta: {
          generationMode,
          imageProvider: imageProviderUsed,
          usedLocalFallback: imageProviderUsed === 'local',
          usedAiFallback: isAiMode && imageProviderUsed === 'mockup',
          isAiPhoto: imageProviderUsed === 'ai',
          aiEnhanced: imageProviderUsed === 'ai',
          isBrandedMockup: imageProviderUsed === 'mockup' || isMockupMode,
          accurateProducts:
            imageProviderUsed === 'mockup' ||
            isMockupMode ||
            (isAiMode && imageProviderUsed === 'ai' && mockupProducts.length > 0),
          logoAppliedPerProduct: logoOnMockup,
          logoIntegratedByAi:
            isAiMode && imageProviderUsed === 'ai' && llmInput.hasLogo,
          logoPostComposited: false,
          resultIsRemoteUrl,
          productCount: mockupProducts.length,
          logoOverlayApplied,
          imageError: imageErrors.length ? imageErrors.join(' | ') : null,
          imageNote:
            imageUsedFallback && isAiMode
              ? 'OpenRouter недоступен — показан мокап из каталога'
              : null,
          openrouterModel: isAiMode ? openrouterImageModel : null,
        },
      };

      if (debug) {
        llmStored._debug = {
          llm: {
            provider: providerName,
            systemPrompt: this.llmBrief.getSystemPrompt(brief.userPayload.lock_user_products === true),
            userPayload,
            userMessage: this.llmBrief.getUserMessage(userPayload),
            response: llmOutput,
            resolvedProducts: productNames,
            desiredItemCount: llmInput.desiredItemCount,
            modelUsed: brief.modelUsed,
            error: llmError,
            usedFallback,
            usedRealLlm,
          },
          image: {
            provider: imageUsedFallback
              ? `${imageProviderUsed} (fallback)`
              : imageProviderUsed,
            promptFromLlm: llmOutput.image_prompt,
            finalPrompt,
            compactPrompt,
            aiEnhancePrompt: isAiMode ? aiEnhancePrompt : undefined,
            openrouterModel: isAiMode ? openrouterImageModel : undefined,
            status: 'done' as const,
            aiEnhanceNegative: isAiMode ? aiEnhanceNegative : undefined,
            generationMode,
            pollinationsUrl,
            aiPollinationsUrl: isAiMode ? pollinationsUrl : undefined,
            referenceImageUrl: logoPublicUrl ?? null,
            error: imageErrors.length ? imageErrors.join(' | ') : null,
            usedFallback: imageUsedFallback,
            providerChain: providerChain.map((c) => c.name),
            openrouterConfigured,
            logoNote: isAiMode
              ? imageProviderUsed === 'ai'
                ? `${openrouterImageModel}: ${mockupProducts.length} фото каталога + логотип → единая сцена`
                : `AI не сработал (${imageErrors.join(' | ') || 'ошибка'}) — показан мокап`
              : isMockupMode
              ? llmInput.hasLogo
                ? 'Ваш логотип наложен на каждый выбранный товар (точный мокап)'
                : 'Логотип не загружен — товары без брендинга'
              : llmInput.hasLogo
                ? logoPublicUrl
                  ? 'Логотип передан в нейросеть как reference image'
                  : 'Логотип в промпте (reference image недоступен)'
                : 'Логотип не загружен',
            mockupProducts,
          },
          inputSnapshot: snapshot,
        };
      }

      const chosenIdeaTitleForResult =
        (snapshot.chosenIdeaTitle as string | null)?.trim() || '';
      const conceptResults = chosenIdeaTitleForResult
        ? mergeConceptResult(generation.conceptResults, {
            chosenIdeaTitle: chosenIdeaTitleForResult,
            resultImageUrl,
            productIds: (snapshot.productIds as string[]) ?? [],
            revision: Number(snapshot.revision) || 1,
            finishedAt: new Date(),
            variantId: `${generationId}-r${Number(snapshot.revision) || 1}`,
          })
        : undefined;

      await this.prisma.generation.update({
        where: { id: generationId },
        data: {
          status: GenerationStatus.done,
          llmOutput: llmStored as object,
          imagePrompt: finalPrompt,
          negativePrompt: llmOutput.negative_prompt,
          resultImageUrl,
          ...(conceptResults ? { conceptResults: conceptResults as object } : {}),
          finishedAt: new Date(),
        },
      });

      await ensureInitialVisualizationVariant(
        this.prisma,
        generationId,
        resultImageUrl,
        finalPrompt,
      );

      await job.updateProgress(100);

      await this.prisma.request.update({
        where: { id: requestId },
        data: { status: RequestStatus.done },
      });

      this.logger.log(`Generation ${generationId} completed`);
      return { resultImageUrl, pollinationsUrl };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Generation ${generationId} failed: ${message}`);

      let failedOutput: Record<string, unknown> = {
        _error: message,
        _resultMeta: {
          imageProvider: this.imageFactory.getProviderName(),
          isAiPhoto: false,
          usedLocalFallback: false,
          imageError: message,
        },
      };

      try {
        const partial = await this.prisma.generation.findUnique({
          where: { id: generationId },
          select: { llmOutput: true },
        });
        if (partial?.llmOutput && typeof partial.llmOutput === 'object') {
          failedOutput = {
            ...(partial.llmOutput as Record<string, unknown>),
            _error: message,
            _resultMeta: {
              ...((partial.llmOutput as Record<string, unknown>)._resultMeta as object),
              imageError: message,
              isAiPhoto: false,
            },
          };
        }
      } catch {
        // ignore
      }

      await this.prisma.generation.update({
        where: { id: generationId },
        data: {
          status: GenerationStatus.failed,
          finishedAt: new Date(),
          llmOutput: failedOutput as object,
        },
      });
      await this.prisma.request.update({
        where: { id: requestId },
        data: { status: RequestStatus.failed },
      });
      throw error;
    }
  }

  private async processRefine(job: Job<GenerationJobData>) {
    const { generationId, requestId } = job.data;
    this.logger.log(`Processing refinement for generation ${generationId}`);

    try {
      const result = await processRefineVisualizationJob(job, {
        prisma: this.prisma,
        openrouter: this.openrouter,
        logger: this.logger,
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Refinement ${generationId} failed: ${message}`);

      const prev = await this.prisma.generation.findUnique({
        where: { id: generationId },
        select: { resultImageUrl: true, status: true },
      });

      await this.prisma.generation.update({
        where: { id: generationId },
        data: {
          status: prev?.resultImageUrl ? GenerationStatus.done : GenerationStatus.failed,
          finishedAt: new Date(),
        },
      });
      await this.prisma.request.update({
        where: { id: requestId },
        data: {
          status: prev?.resultImageUrl ? RequestStatus.done : RequestStatus.failed,
        },
      });
      throw error;
    }
  }
}

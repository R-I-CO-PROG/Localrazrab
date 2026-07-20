import { Injectable, Logger } from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import { writeFile, unlink, copyFile } from 'fs/promises';

import { existsSync, mkdirSync } from 'fs';

import { join } from 'path';

import { randomUUID } from 'crypto';

import sharp from 'sharp';

import { ImageProvider, ImageGenerationInput } from './image.interface';

import { buildAiRenderPrompt, buildAiRenderNegative } from '../../generation/ai-enhance.prompt';

import {

  describeLogoForPrompt,

  loadLogoBase64,

  resolvePublicAssetUrl,

} from '../../generation/logo-reference.util';

import { stableHordeGenerate } from './stable-horde.client';

import { PollinationsImageProvider } from './pollinations-image.provider';

import { OpenrouterImageProvider } from './openrouter-image.provider';

import { HuggingFaceImageProvider } from './huggingface-image.provider';

import { BrandedMockupImageProvider } from './branded-mockup-image.provider';

import { buildHfFluxPrompt } from '../../generation/hf-flux.prompt';



@Injectable()

export class AiEnhancedMockupImageProvider implements ImageProvider {

  private readonly logger = new Logger(AiEnhancedMockupImageProvider.name);



  constructor(

    private readonly config: ConfigService,

    private readonly openrouter: OpenrouterImageProvider,

    private readonly mockup: BrandedMockupImageProvider,

    private readonly huggingface: HuggingFaceImageProvider,

    private readonly pollinations: PollinationsImageProvider,

  ) {}



  private aiChainStatus(): {

    openrouter: boolean;

    huggingface: boolean;

    pollinations: boolean;

    anyPrimary: boolean;

  } {

    const openrouter =
      this.openrouter.isConfigured() &&
      this.config.get<string>('AI_SKIP_OPENROUTER_IMAGE', 'false') !== 'true';

    const huggingface =
      this.config.get('AI_SKIP_HUGGINGFACE', 'true') !== 'true' &&
      Boolean(this.config.get<string>('HUGGINGFACE_API_KEY', '').trim());

    const pollinations = this.config.get('AI_SKIP_POLLINATIONS', 'true') !== 'true';

    return {

      openrouter,

      huggingface,

      pollinations,

      anyPrimary: openrouter || huggingface,

    };

  }



  private logAiChainStatus(): void {

    const s = this.aiChainStatus();

    this.logger.log(

      `AI providers: openrouter=${s.openrouter ? 'ON' : 'skip'} | ` +

        `huggingface=${s.huggingface ? 'ON' : 'skip(no HUGGINGFACE_API_KEY)'} | ` +

        `pollinations=${s.pollinations ? 'ON' : 'skip(AI_SKIP_POLLINATIONS)'}`,

    );

    if (!s.anyPrimary && !s.pollinations) {

      this.logger.warn(

        'No AI image API configured — generation will fall back to mockup. ' +

          'Set OPENROUTER_API_KEY in apps/api/.env',

      );

    }

  }



  private getUploadsDir(): string {
    return this.config.get<string>('UPLOADS_DIR') || join(process.cwd(), '../../uploads');
  }

  private hasCatalogProducts(input: ImageGenerationInput): boolean {
    return (input.products?.length ?? 0) > 0 || (input.productNames?.length ?? 0) > 0;
  }

  private async publishTempImage(srcPath: string, publicBase: string): Promise<string> {
    const tempDir = join(this.getUploadsDir(), 'temp');
    if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true });
    const fileName = `mockup-${randomUUID()}.png`;
    await copyFile(srcPath, join(tempDir, fileName));
    return `${publicBase}/uploads/temp/${fileName}`;
  }

  /** Мокап с каталогом → опционально Pollinations img2img; без HF txt2img */
  private async renderMockupFallback(
    input: ImageGenerationInput,
    prompt: string,
    negative: string,
    publicBase: string,
    chain: ReturnType<AiEnhancedMockupImageProvider['aiChainStatus']>,
    width: number,
    height: number,
  ): Promise<string> {
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
        await unlink(mockupPath).catch(() => undefined);
        await this.sharpenOutput(input.outputPath);
        this.logger.log('AI render complete (mockup + pollinations)');
        return input.outputPath;
      } catch (err) {
        this.logger.warn(
          `Pollinations mockup enhance failed: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    await copyFile(mockupPath, input.outputPath);
    await unlink(mockupPath).catch(() => undefined);
    this.logger.log('AI render complete (branded mockup, OpenRouter unavailable)');
    return input.outputPath;
  }

  async generate(input: ImageGenerationInput): Promise<string> {

    this.logAiChainStatus();



    const width = Number(this.config.get('AI_ENHANCE_WIDTH')) || input.width || 768;

    const height = Number(this.config.get('AI_ENHANCE_HEIGHT')) || input.height || 768;

    const publicBase = this.config.get<string>('PUBLIC_API_URL', '').replace(/\/$/, '');

    const chain = this.aiChainStatus();



    const snapshot = {

      productNames: input.productNames ?? [],

      colors: input.colors,

      category: input.category,

      hasLogo: input.hasLogo,

      logoUrl: input.logoUrl,

      userPrompt: input.userPrompt,

    };



    const logoHint =

      input.hasLogo && input.logoUrl ? await describeLogoForPrompt(input.logoUrl) : '';

    const prompt =

      input.prompt?.trim() ||

      buildAiRenderPrompt(snapshot, logoHint || undefined);

    const negative =

      input.negativePrompt?.trim() || buildAiRenderNegative(snapshot);



    const logoPublicUrl =

      input.referenceImageUrl ??

      (input.logoUrl && publicBase ? resolvePublicAssetUrl(input.logoUrl, publicBase) : null);

    const logoBase64 =

      input.hasLogo && input.logoUrl ? await loadLogoBase64(input.logoUrl) : null;



    const errors: string[] = [];



    const hfPrompt = buildHfFluxPrompt(snapshot, prompt);

    // ── 1. OpenRouter — основной (Gemini Flash Image / Flux)
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
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`openrouter[${attempt}]: ${msg}`);
          this.logger.warn(errors[errors.length - 1]);
          if (attempt < attempts) await new Promise((r) => setTimeout(r, 3000 * attempt));
        }
      }
    }

    // ── 2. HuggingFace FLUX
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
      } catch (err) {
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

      referenceImageUrl: undefined as string | undefined,

      imageModel: 'flux' as string,

    };



    if (!chain.anyPrimary && !chain.pollinations) {

      throw new Error(

        'No AI image providers configured. Set OPENROUTER_API_KEY in apps/api/.env and restart API',

      );

    }



    // ── 3. Pollinations (часто 402 — платная очередь) ──

    if (chain.pollinations && input.hasLogo && logoPublicUrl) {

      try {

        this.logger.log('AI render: Pollinations flux (logo ref)...');

        await this.pollinations.generate({

          ...pollinationsInput,

          referenceImageUrl: logoPublicUrl,

        });

        await this.sharpenOutput(input.outputPath);

        return input.outputPath;

      } catch (err) {

        errors.push(`pollinations-flux: ${err instanceof Error ? err.message : err}`);

        this.logger.warn(errors[errors.length - 1]);

      }

    }



    if (this.config.get('AI_SKIP_HORDE', 'true') !== 'true') {

      try {

        this.logger.log('AI render: Stable Horde...');

        const result = await stableHordeGenerate({

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

        await writeFile(input.outputPath, result);

        await this.sharpenOutput(input.outputPath);

        return input.outputPath;

      } catch (err) {

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

      } catch (err) {

        errors.push(`pollinations-flux-plain: ${err instanceof Error ? err.message : err}`);

      }

    }



    // Мокап — только через цепочку processor (provider [2/2]), не дублируем здесь
    throw new Error(`AI render failed: ${errors.join('; ')}`);

  }



  private async sharpenOutput(outputPath: string): Promise<void> {

    const tempPath = `${outputPath}.sharpen.tmp.png`;

    try {

      await sharp(outputPath).sharpen({ sigma: 0.5 }).png().toFile(tempPath);

      await sharp(tempPath).png().toFile(outputPath);

    } catch {

      // ignore

    } finally {

      try {

        const { unlink } = await import('fs/promises');

        await unlink(tempPath);

      } catch {

        // ignore

      }

    }

  }

}


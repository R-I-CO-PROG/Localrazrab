import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import sharp from "sharp";
import type { AssetRef } from "../types";
import {
  isImageProviderConfigured,
  openrouterGenerateImageBuffer,
  resolveImageModel,
} from "./openrouter-image-client";
import { resolveManyReferenceUrls } from "../services/resolve-reference-images";
import { normalizeHeroPanelImage } from "../split-hero-image";
import {
  PRODUCT_HERO_ASPECT,
  PRODUCT_HERO_GENERATION_ASPECT,
  PRODUCT_HERO_PANEL_W,
  PRODUCT_SLIDE_H,
  PRODUCT_SLIDE_W,
} from "../product-slide-layout";

export interface GenerateImageInput {
  prompt: string;
  referenceUrls?: string[];
  aspectRatio?: string;
  presentationId: string;
  assetId: string;
  /** true = 8:9 product panel (960×1080), not full 16:9 slide */
  heroPanel?: boolean;
}

export interface GeneratedImage {
  asset: AssetRef;
  buffer: Buffer;
}

export interface ImageGenerationProvider {
  generateImage(input: GenerateImageInput): Promise<GeneratedImage>;
  isAvailable(): boolean;
}

function uploadsDir(): string {
  return process.env.UPLOADS_DIR || join(process.cwd(), "../../uploads");
}

function isHeroPanelInput(input: GenerateImageInput): boolean {
  return input.heroPanel === true || input.aspectRatio === PRODUCT_HERO_ASPECT;
}

export class OpenRouterImageProvider implements ImageGenerationProvider {
  isAvailable(): boolean {
    return isImageProviderConfigured();
  }

  async generateImage(input: GenerateImageInput): Promise<GeneratedImage> {
    const apiKey = (process.env.OPENROUTER_API_KEY ?? "").trim();
    if (!apiKey) {
      throw new Error("Для premium-генерации нужно подключить AI image provider (OPENROUTER_API_KEY)");
    }

    const heroPanel = isHeroPanelInput(input);
    const apiAspect = heroPanel
      ? (process.env.OPENROUTER_PRESENTATION_HERO_ASPECT?.trim() || PRODUCT_HERO_GENERATION_ASPECT)
      : (input.aspectRatio ?? "16:9");

    const refs = await resolveManyReferenceUrls((input.referenceUrls ?? []).slice(0, 8));
    if (refs.length === 0 && (input.referenceUrls ?? []).length > 0) {
      console.warn(
        `[presentation-ai] no resolvable reference images for ${input.assetId} (${input.referenceUrls?.length ?? 0} urls)`,
      );
    }

    const buffer = await openrouterGenerateImageBuffer({
      apiKey,
      model: resolveImageModel(),
      prompt: input.prompt,
      modalities: ["image", "text"],
      imageConfig: {
        aspect_ratio: apiAspect,
        image_size: process.env.OPENROUTER_FINAL_IMAGE_SIZE?.trim() || "1K",
      },
      referenceImageUrls: refs,
    });

    let optimized: Buffer;
    let width: number;
    let height: number;

    if (heroPanel) {
      optimized = await normalizeHeroPanelImage(buffer);
      width = PRODUCT_HERO_PANEL_W;
      height = PRODUCT_SLIDE_H;
    } else {
      optimized = await sharp(buffer)
        .resize(PRODUCT_SLIDE_W, PRODUCT_SLIDE_H, { fit: "cover", position: "centre" })
        .jpeg({ quality: 90, mozjpeg: true })
        .toBuffer();
      width = PRODUCT_SLIDE_W;
      height = PRODUCT_SLIDE_H;
    }

    const relDir = `presentations/ai/${input.presentationId}`;
    const dir = join(uploadsDir(), relDir);
    await mkdir(dir, { recursive: true });
    const fileName = `${input.assetId}.jpg`;
    const filePath = join(dir, fileName);
    await writeFile(filePath, optimized);

    return {
      buffer: optimized,
      asset: {
        id: input.assetId,
        url: `/uploads/${relDir}/${fileName}`,
        mimeType: "image/jpeg",
        width,
        height,
      },
    };
  }
}

let imageProvider: ImageGenerationProvider | null = null;

export function getImageProvider(): ImageGenerationProvider {
  if (!imageProvider) {
    imageProvider = new OpenRouterImageProvider();
  }
  return imageProvider;
}

export function getImageProviderError(): string {
  if (!isImageProviderConfigured()) {
    return "Для premium-генерации нужно подключить AI image provider (OPENROUTER_API_KEY и AI_IMAGE_PROVIDER=openrouter)";
  }
  return "";
}

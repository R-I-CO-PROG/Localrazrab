import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import { ImageProvider, ImageGenerationInput } from './image.interface';

@Injectable()
export class PollinationsImageProvider implements ImageProvider {
  private readonly logger = new Logger(PollinationsImageProvider.name);

  constructor(private readonly config: ConfigService) {}

  buildImageUrl(prompt: string, input?: Partial<ImageGenerationInput>): string {
    const baseUrl = this.config.get<string>(
      'POLLINATIONS_BASE_URL',
      'https://image.pollinations.ai',
    );
    const pathPrefix = this.config.get<string>('POLLINATIONS_PATH_PREFIX', 'p');
    const model =
      input?.imageModel ?? this.config.get<string>('POLLINATIONS_MODEL', 'flux');
    const feed = this.config.get<string>('POLLINATIONS_FEED', 'true');

    const encodedPrompt = encodeURIComponent(prompt.trim());
    const params = new URLSearchParams({
      feed,
      model,
      width: String(input?.width ?? (Number(this.config.get('POLLINATIONS_WIDTH')) || 1024)),
      height: String(input?.height ?? (Number(this.config.get('POLLINATIONS_HEIGHT')) || 1024)),
    });

    const negative = input?.negativePrompt?.trim();
    if (negative) params.set('negative_prompt', negative);

    const refs = input?.referenceImageUrls?.filter(Boolean);
    if (refs?.length) {
      params.set('image', refs.join('|'));
    } else if (input?.referenceImageUrl) {
      params.set('image', input.referenceImageUrl);
    }

    if (this.config.get('POLLINATIONS_ENHANCE') === 'true') params.set('enhance', 'true');

    const apiKey = this.config.get<string>('POLLINATIONS_API_KEY');
    if (apiKey) params.set('key', apiKey);

    if (this.config.get('POLLINATIONS_NOLOGO', 'true') !== 'false') params.set('nologo', 'true');

    return `${baseUrl}/${pathPrefix}/${encodedPrompt}?${params.toString()}`;
  }

  async generate(input: ImageGenerationInput): Promise<string> {
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

      await sharp(buffer).png().toFile(input.outputPath);
      this.logger.log(`Image saved to ${input.outputPath} (${buffer.length} bytes)`);
      return input.outputPath;
    } finally {
      clearTimeout(timer);
    }
  }
}

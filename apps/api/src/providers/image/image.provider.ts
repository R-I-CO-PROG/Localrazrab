import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ImageProvider } from './image.interface';
import { StubImageProvider } from './stub-image.provider';
import { PollinationsImageProvider } from './pollinations-image.provider';
import { LocalCompositeImageProvider } from './local-composite-image.provider';
import { StableHordeImageProvider } from './stable-horde-image.provider';
import { HuggingFaceImageProvider } from './huggingface-image.provider';
import { BrandedMockupImageProvider } from './branded-mockup-image.provider';
import { AiEnhancedMockupImageProvider } from './ai-enhanced-mockup-image.provider';

export type GenerationImageMode = 'mockup' | 'ai';

@Injectable()
export class ImageProviderFactory {
  constructor(
    private readonly config: ConfigService,
    private readonly stub: StubImageProvider,
    private readonly pollinations: PollinationsImageProvider,
    private readonly local: LocalCompositeImageProvider,
    private readonly stableHorde: StableHordeImageProvider,
    private readonly huggingface: HuggingFaceImageProvider,
    private readonly mockup: BrandedMockupImageProvider,
    private readonly aiEnhanced: AiEnhancedMockupImageProvider,
  ) {}

  getProviderByName(name: string): ImageProvider | null {
    switch (name) {
      case 'pollinations':
        return this.pollinations;
      case 'stablehorde':
        return this.stableHorde;
      case 'huggingface':
        return this.huggingface;
      case 'stub':
        return this.stub;
      case 'local':
        return this.mockup;
      case 'external':
        return this.aiEnhanced;
      case 'mockup':
        return this.mockup;
      case 'ai':
        return this.aiEnhanced;
      default:
        return null;
    }
  }

  /** UI can ask for "ai", but external image APIs are opt-in via IMAGE_PROVIDER=external. */
  getProviderChainForMode(
    mode: GenerationImageMode,
    options?: { aiStyle?: 'catalog' | 'creative' },
  ): { name: string; provider: ImageProvider }[] {
    const provider = this.getProviderName();
    const externalEnabled = ['external', 'ai', 'pollinations', 'huggingface', 'stablehorde'].includes(
      provider,
    );

    if (mode === 'ai' && externalEnabled) {
      const noMockupFallback =
        options?.aiStyle === 'creative' ||
        this.config.get<string>('AI_NO_MOCKUP_FALLBACK', 'true') === 'true';
      // Каталог + креатив с логотипом: только нейросеть, без мокап-fallback с серверным брендингом
      const chain: { name: string; provider: ImageProvider }[] = [
        { name: 'ai', provider: this.aiEnhanced },
      ];
      if (!noMockupFallback) {
        chain.push({ name: 'mockup', provider: this.mockup });
      }
      return chain;
    }
    return [{ name: 'mockup', provider: this.mockup }];
  }

  getProvider(): ImageProvider {
    const provider = this.config.get<string>('IMAGE_PROVIDER', 'mockup');
    return this.getProviderByName(provider) ?? this.mockup;
  }

  /** Цепочка провайдеров: primary + IMAGE_FALLBACK_PROVIDERS (через запятую) */
  getProviderChain(): { name: string; provider: ImageProvider }[] {
    const primary = this.getProviderName();

    if (primary === 'mockup') {
      return [{ name: 'mockup', provider: this.mockup }];
    }
    const fallbacks = (this.config.get<string>('IMAGE_FALLBACK_PROVIDERS', 'pollinations') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const names = [...new Set([primary, ...fallbacks])];
    const chain: { name: string; provider: ImageProvider }[] = [];

    for (const name of names) {
      if (name === 'huggingface' && !this.config.get<string>('HUGGINGFACE_API_KEY')) {
        continue;
      }
      const provider = this.getProviderByName(name);
      if (provider) chain.push({ name, provider });
    }

    const allowLocal = this.config.get<string>('IMAGE_FALLBACK_TO_LOCAL', 'false') === 'true';
    if (allowLocal && !chain.some((c) => c.name === 'local')) {
      chain.push({ name: 'local', provider: this.local });
    }

    return chain;
  }

  getLocalProvider(): LocalCompositeImageProvider {
    return this.local;
  }

  getProviderName(): string {
    return this.config.get<string>('IMAGE_PROVIDER', 'local');
  }

  getPollinationsProvider(): PollinationsImageProvider {
    return this.pollinations;
  }
}

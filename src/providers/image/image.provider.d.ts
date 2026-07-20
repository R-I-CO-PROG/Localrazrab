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
export declare class ImageProviderFactory {
    private readonly config;
    private readonly stub;
    private readonly pollinations;
    private readonly local;
    private readonly stableHorde;
    private readonly huggingface;
    private readonly mockup;
    private readonly aiEnhanced;
    constructor(config: ConfigService, stub: StubImageProvider, pollinations: PollinationsImageProvider, local: LocalCompositeImageProvider, stableHorde: StableHordeImageProvider, huggingface: HuggingFaceImageProvider, mockup: BrandedMockupImageProvider, aiEnhanced: AiEnhancedMockupImageProvider);
    getProviderByName(name: string): ImageProvider | null;
    getProviderChainForMode(mode: GenerationImageMode, options?: {
        aiStyle?: 'catalog' | 'creative';
    }): {
        name: string;
        provider: ImageProvider;
    }[];
    getProvider(): ImageProvider;
    getProviderChain(): {
        name: string;
        provider: ImageProvider;
    }[];
    getLocalProvider(): LocalCompositeImageProvider;
    getProviderName(): string;
    getPollinationsProvider(): PollinationsImageProvider;
}

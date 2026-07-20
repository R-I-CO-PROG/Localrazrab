import { ConfigService } from '@nestjs/config';
import { ImageProvider, ImageGenerationInput } from './image.interface';
import { PollinationsImageProvider } from './pollinations-image.provider';
import { OpenrouterImageProvider } from './openrouter-image.provider';
import { HuggingFaceImageProvider } from './huggingface-image.provider';
import { BrandedMockupImageProvider } from './branded-mockup-image.provider';
export declare class AiEnhancedMockupImageProvider implements ImageProvider {
    private readonly config;
    private readonly openrouter;
    private readonly mockup;
    private readonly huggingface;
    private readonly pollinations;
    private readonly logger;
    constructor(config: ConfigService, openrouter: OpenrouterImageProvider, mockup: BrandedMockupImageProvider, huggingface: HuggingFaceImageProvider, pollinations: PollinationsImageProvider);
    private aiChainStatus;
    private logAiChainStatus;
    private getUploadsDir;
    private hasCatalogProducts;
    private publishTempImage;
    private renderMockupFallback;
    generate(input: ImageGenerationInput): Promise<string>;
    private sharpenOutput;
}

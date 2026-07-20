import { ConfigService } from '@nestjs/config';
import { ImageProvider, ImageGenerationInput } from './image.interface';
export declare class BrandedMockupImageProvider implements ImageProvider {
    private readonly config;
    private readonly logger;
    constructor(config: ConfigService);
    generate(input: ImageGenerationInput): Promise<string>;
}

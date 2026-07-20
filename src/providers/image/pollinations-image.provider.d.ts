import { ConfigService } from '@nestjs/config';
import { ImageProvider, ImageGenerationInput } from './image.interface';
export declare class PollinationsImageProvider implements ImageProvider {
    private readonly config;
    private readonly logger;
    constructor(config: ConfigService);
    buildImageUrl(prompt: string, input?: Partial<ImageGenerationInput>): string;
    generate(input: ImageGenerationInput): Promise<string>;
}

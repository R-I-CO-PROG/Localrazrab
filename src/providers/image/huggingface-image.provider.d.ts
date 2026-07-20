import { ConfigService } from '@nestjs/config';
import { ImageProvider, ImageGenerationInput } from './image.interface';
export declare class HuggingFaceImageProvider implements ImageProvider {
    private readonly config;
    private readonly logger;
    constructor(config: ConfigService);
    private sleep;
    private buildEndpoints;
    private permissionHint;
    generate(input: ImageGenerationInput): Promise<string>;
}

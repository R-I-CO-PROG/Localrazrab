import { ConfigService } from '@nestjs/config';
import { ImageProvider, ImageGenerationInput } from './image.interface';
export declare class StableHordeImageProvider implements ImageProvider {
    private readonly config;
    private readonly logger;
    constructor(config: ConfigService);
    private headers;
    private fetchWithRetry;
    private resolveDimensions;
    generate(input: ImageGenerationInput): Promise<string>;
}

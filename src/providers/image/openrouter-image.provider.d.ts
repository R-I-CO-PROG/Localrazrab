import { ConfigService } from '@nestjs/config';
import { ImageProvider, ImageGenerationInput } from './image.interface';
export declare class OpenrouterImageProvider implements ImageProvider {
    private readonly config;
    private readonly logger;
    constructor(config: ConfigService);
    isConfigured(): boolean;
    private getApiKey;
    private previewModel;
    private finalModel;
    private catalogModel;
    private isCatalogInput;
    private isCreativeWithLogo;
    private resolveModel;
    private useCatalogImagePipeline;
    private resolveModalities;
    private resolveImageConfig;
    generateConceptPreview(input: {
        title: string;
        narrative: string;
        styleTags?: string[];
        colors?: string[];
        outputPath: string;
    }): Promise<string>;
    generate(input: ImageGenerationInput): Promise<string>;
    generateRefinement(input: ImageGenerationInput): Promise<string>;
}

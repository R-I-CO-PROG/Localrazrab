import { ImageProvider, ImageGenerationInput } from './image.interface';
export declare class LocalCompositeImageProvider implements ImageProvider {
    generate(input: ImageGenerationInput): Promise<string>;
    private escapeXml;
}

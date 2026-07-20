import { ImageProvider, ImageGenerationInput } from './image.interface';
export declare class StubImageProvider implements ImageProvider {
    generate(input: ImageGenerationInput): Promise<string>;
}

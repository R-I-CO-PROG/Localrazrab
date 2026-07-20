import { ImageProvider, ImageGenerationInput } from './image.interface';
import { StubImageProvider } from './stub-image.provider';
export declare class ReplicateImageProvider implements ImageProvider {
    private readonly stub;
    private readonly logger;
    constructor(stub: StubImageProvider);
    generate(input: ImageGenerationInput): Promise<string>;
}

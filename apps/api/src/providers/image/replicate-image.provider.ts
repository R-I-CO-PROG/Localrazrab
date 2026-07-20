import { Injectable, Logger } from '@nestjs/common';
import { ImageProvider, ImageGenerationInput } from './image.interface';
import { StubImageProvider } from './stub-image.provider';

/**
 * Placeholder for future Replicate/Stability/fal integration.
 * Falls back to stub composition in MVP.
 */
@Injectable()
export class ReplicateImageProvider implements ImageProvider {
  private readonly logger = new Logger(ReplicateImageProvider.name);

  constructor(private readonly stub: StubImageProvider) {}

  async generate(input: ImageGenerationInput): Promise<string> {
    this.logger.warn('ReplicateImageProvider not implemented, using stub');
    return this.stub.generate(input);
  }
}

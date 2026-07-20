import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { join } from 'path';
import { mkdirSync } from 'fs';
import { OpenrouterImageProvider } from '../providers/image/openrouter-image.provider';
import type { Concept } from './contracts';

@Injectable()
export class ConceptPreviewService {
  private readonly logger = new Logger(ConceptPreviewService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly openrouterImage: OpenrouterImageProvider,
  ) {}

  isEnabled(): boolean {
    if (this.config.get<string>('OPENROUTER_PREVIEW_ENABLED', 'true') !== 'true') return false;
    return this.openrouterImage.isConfigured();
  }

  async attachPreviews(
    concepts: Concept[],
    opts: { agentRunId: string; colors: string[] },
  ): Promise<Concept[]> {
    if (!this.isEnabled() || concepts.length === 0) {
      return concepts;
    }

    const uploadsDir = this.config.get<string>('UPLOADS_DIR') || join(process.cwd(), '../../uploads');
    const outDir = join(uploadsDir, 'generated', 'previews');
    mkdirSync(outDir, { recursive: true });

    const model =
      this.config.get<string>('OPENROUTER_IMAGE_MODEL_PREVIEW') ??
      'black-forest-labs/flux.2-klein-4b';

    const results = await Promise.all(
      concepts.map(async (concept, index) => {
        const filename = `preview-${opts.agentRunId}-${index}.jpg`;
        const outputPath = join(outDir, filename);
        try {
          await this.openrouterImage.generateConceptPreview({
            title: concept.title,
            narrative: concept.narrative || concept.description,
            styleTags: concept.styleTags,
            colors: opts.colors,
            outputPath,
          });
          return {
            ...concept,
            previewImageUrl: `/uploads/generated/previews/${filename}`,
          };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.warn(`Preview failed for «${concept.title}»: ${msg}`);
          return concept;
        }
      }),
    );

    const ok = results.filter((c) => c.previewImageUrl).length;
    this.logger.log(`Concept previews: ${ok}/${concepts.length} via OpenRouter (${model})`);
    return results;
  }
}

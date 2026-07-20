import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { join } from 'path';
import { mkdirSync } from 'fs';
import { PrismaService } from '../prisma/prisma.service';
import { BrandedMockupImageProvider } from '../providers/image/branded-mockup-image.provider';
import type { PromptBuilderOutput } from './contracts';

@Injectable()
export class AgentImageService {
  private readonly logger = new Logger(AgentImageService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly mockup: BrandedMockupImageProvider,
  ) {}

  async generateLocalImage(params: {
    requestId: string;
    agentRunId: string;
    prompt: PromptBuilderOutput;
    productIds: string[];
    colors: string[];
    logoUrl?: string | null;
    category?: string;
    quantity?: number | null;
  }): Promise<string> {
    const provider = this.config.get<string>('IMAGE_PROVIDER', 'local');
    if (provider !== 'local' && provider !== 'external') {
      this.logger.warn(`Unknown IMAGE_PROVIDER=${provider}, using local mockup`);
    }

    const products = await this.prisma.product.findMany({
      where: { id: { in: params.productIds } },
    });

    if (products.length === 0) {
      throw new Error('No products selected for image generation');
    }

    const uploadsDir = this.config.get<string>('UPLOADS_DIR') || join(process.cwd(), '../../uploads');
    const generatedDir = join(uploadsDir, 'generated');
    mkdirSync(generatedDir, { recursive: true });

    const outputPath = join(generatedDir, `agent-${params.agentRunId}.png`);
    const productInputs = products.map((p) => ({
      name: p.name,
      imageUrl: p.catalogImageUrl || p.silhouetteImageUrl,
    }));

    await this.mockup.generate({
      outputPath,
      productNames: products.map((p) => p.name),
      products: productInputs,
      colors: params.colors,
      logoUrl: params.logoUrl ?? null,
      hasLogo: Boolean(params.logoUrl),
      category: params.category,
      quantity: params.quantity ?? undefined,
      prompt: params.prompt.imagePrompt,
      negativePrompt: params.prompt.negativePrompt,
      width: 1024,
      height: 1024,
      layoutMode: 'scene',
      showLabels: false,
    });

    const url = `/uploads/generated/agent-${params.agentRunId}.png`;
    this.logger.log(`Agent image saved: ${url} (${provider})`);
    return url;
  }
}

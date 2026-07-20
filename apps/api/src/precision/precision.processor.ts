import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Worker } from 'bullmq';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import sharp from 'sharp';
import { PrismaService } from '../prisma/prisma.service';
import { OpenrouterImageProvider } from '../providers/image/openrouter-image.provider';
import { PrecisionJudgeService } from '../generation/precision-judge.service';
import { PrecisionService } from './precision.service';
import { buildDraftComposite, type DraftLayer } from '../generation/precision-draft';
import { detectLogoSurface } from '../generation/logo-surface.util';
import { conformArtToMethod, loadLogoArt, renderTextToPng } from './art-renderer';
import { PRECISION_QUEUE, createRedisConnection, type PrecisionJobData } from './precision.queue';
import type { ImprintMethodCode } from '../generation/imprint-methods';
import type { PrecisionRenderDto } from './dto/precision-render.dto';

function uploadsDir() {
  return process.env.UPLOADS_DIR || join(process.cwd(), '../../uploads');
}
function toAbsolute(publicUrl: string) {
  return join(uploadsDir(), publicUrl.replace(/^\/uploads\/?/, ''));
}

/**
 * Кадр-источник сессии — либо локальный /uploads/... (загруженное фото), либо удалённый
 * URL с CDN поставщика (сессия создана из productId без фото: product.catalogImageUrl ??
 * product.silhouetteImageUrl). Оба случая — штатный путь.
 */
async function loadSourceImage(sourceImageUrl: string): Promise<Buffer> {
  if (/^https?:\/\//i.test(sourceImageUrl)) {
    let res: Response;
    try {
      res = await fetch(sourceImageUrl, { signal: AbortSignal.timeout(15_000) });
    } catch (e) {
      throw new Error(
        `Не удалось загрузить исходное изображение: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    if (!res.ok) {
      throw new Error(`Не удалось загрузить исходное изображение (HTTP ${res.status}): ${sourceImageUrl}`);
    }
    return Buffer.from(await res.arrayBuffer());
  }
  return readFile(toAbsolute(sourceImageUrl));
}

@Injectable()
export class PrecisionProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrecisionProcessor.name);
  private worker: Worker<PrecisionJobData> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly image: OpenrouterImageProvider,
    private readonly judge: PrecisionJudgeService,
    private readonly precision: PrecisionService,
  ) {}

  onModuleInit() {
    this.worker = new Worker<PrecisionJobData>(PRECISION_QUEUE, (job) => this.handle(job.data.renderId), {
      connection: createRedisConnection(),
      concurrency: Number(process.env.PRECISION_CONCURRENCY ?? 2),
    });
    this.worker.on('failed', (job, err) => this.logger.error(`render ${job?.data.renderId} упал: ${err.message}`));
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }

  private async handle(renderId: string): Promise<void> {
    try {
      await this.prisma.precisionRender.update({ where: { id: renderId }, data: { status: 'running' } });

      const render = await this.prisma.precisionRender.findUniqueOrThrow({
        where: { id: renderId },
        include: { session: true },
      });
      const session = render.session;
      const dto = session.config as unknown as PrecisionRenderDto;

      const sourceBuf = await loadSourceImage(session.sourceImageUrl);
      const sourcePng = await sharp(sourceBuf).png().toBuffer();
      const meta = await sharp(sourcePng).metadata();

      const product = session.productId
        ? await this.prisma.product.findUnique({ where: { id: session.productId } })
        : null;
      const productName = product?.name ?? 'product';

      const layers: DraftLayer[] = [];
      let firstArt: Buffer | null = null;

      for (const imp of dto.imprints) {
        let art: Buffer;
        if (imp.contentKind === 'logo') {
          const asset = await this.prisma.asset.findUniqueOrThrow({ where: { id: imp.assetId! } });
          art = await loadLogoArt(toAbsolute(asset.url));
        } else {
          art = await renderTextToPng(imp.text!, { colorHex: imp.colorHex ?? '#000000', font: imp.font });
        }
        art = await conformArtToMethod(art, imp.methodCode as ImprintMethodCode);
        firstArt ??= art;
        layers.push({ artPng: art, placement: imp.placement, surface: detectLogoSurface(productName) });
      }

      const draftPng = await buildDraftComposite(sourcePng, layers);

      // Резолвим зону КАЖДОГО нанесения по его собственному zoneId — иначе при 2+ зонах
      // все, кроме первого, получают в промпте название чужой зоны (imprints[0].zoneId).
      const zoneById = await this.precision.getZoneMap(dto.imprints.map((imp) => imp.zoneId));
      const zoneNameFor = (imp: PrecisionRenderDto['imprints'][number]) =>
        (imp.zoneId ? zoneById.get(imp.zoneId)?.zoneNameRu : null) ?? null;
      // generatePrecisionImprint (Task 8) принимает одну диаграмму зоны на весь рендер —
      // берём первую непустую картинку зоны среди нанесений (известное ограничение сигнатуры).
      const zoneImageUrl =
        dto.imprints
          .map((imp) => (imp.zoneId ? zoneById.get(imp.zoneId)?.zoneImageUrl : null))
          .find((url): url is string => Boolean(url)) ?? null;

      const { image, prompt } = await this.image.generatePrecisionImprint({
        promptInput: {
          outputMode: dto.outputMode,
          productNameRu: productName,
          materialRu: product?.material ?? null,
          productDimsCm: product
            ? { widthCm: product.widthCm, heightCm: product.heightCm, depthCm: product.depthCm }
            : null,
          imprints: dto.imprints.map((imp) => ({
            methodCode: imp.methodCode as ImprintMethodCode,
            colorCount: imp.colorCount,
            sizeMm: imp.sizeMm,
            zoneNameRu: zoneNameFor(imp),
            contentDescription: imp.contentKind === 'logo' ? 'client logo' : `the text "${imp.text}"`,
          })),
        },
        sourcePng,
        draftPng,
        artPng: firstArt!,
        zoneImageUrl,
        sceneWidth: meta.width ?? 1024,
        sceneHeight: meta.height ?? 1024,
      });

      const dir = join(uploadsDir(), 'precision', session.id);
      await mkdir(dir, { recursive: true });
      const draftPath = join(dir, `draft-${renderId}.png`);
      const resultPath = join(dir, `result-${renderId}.png`);
      await writeFile(draftPath, draftPng);
      await writeFile(resultPath, image);

      const verdict = await this.judge.judge(sourcePng, image);

      await this.prisma.precisionRender.update({
        where: { id: renderId },
        data: {
          status: 'done',
          draftImageUrl: `/uploads/precision/${session.id}/draft-${renderId}.png`,
          imageUrl: `/uploads/precision/${session.id}/result-${renderId}.png`,
          imagePrompt: prompt,
          judgeVerdict: verdict ? (verdict as unknown as object) : undefined,
        },
      });
    } catch (e) {
      await this.prisma.precisionRender.update({
        where: { id: renderId },
        data: { status: 'failed', error: e instanceof Error ? e.message : String(e) },
      });
      throw e;
    }
  }
}

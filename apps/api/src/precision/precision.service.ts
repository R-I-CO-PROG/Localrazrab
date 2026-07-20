import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { ProductBranding } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { precisionQueue } from './precision.queue';
import type { PrecisionRenderDto } from './dto/precision-render.dto';
import type { ImprintToValidate } from '../generation/imprint-validation';

@Injectable()
export class PrecisionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Создание сессии из фото (sourceImageUrl уже загружено на диск контроллером) ИЛИ из
   * каталожного productId без фото — основной сценарий "выбрать из каталога"/поиск по
   * фото/тексту. В этом случае источником кадра становится удалённая CDN-картинка товара.
   */
  async createSession(input: { sourceImageUrl?: string; productId?: string }) {
    let sourceImageUrl = input.sourceImageUrl;

    if (!sourceImageUrl) {
      if (!input.productId) {
        throw new BadRequestException('Нужно фото товара или productId');
      }
      const product = await this.prisma.product.findUnique({ where: { id: input.productId } });
      if (!product) throw new NotFoundException('Товар не найден');
      sourceImageUrl = product.catalogImageUrl ?? product.silhouetteImageUrl;
    }

    const request = await this.prisma.request.create({
      data: { title: 'Точное нанесение', userPrompt: '' },
    });
    // include renders — та же форма, что и getSession. Путь «своё фото» кладёт этот ответ прямо в
    // стор студии (без пере-запроса getSession), а фронт читает session.renders.at(-1): без include
    // поле undefined → `Cannot read properties of undefined (reading 'at')`, белый экран.
    return this.prisma.precisionSession.create({
      data: {
        requestId: request.id,
        sourceImageUrl,
        productId: input.productId ?? null,
        config: {},
      },
      include: { renders: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  async getSession(id: string) {
    const session = await this.prisma.precisionSession.findUnique({
      where: { id },
      include: { renders: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!session) throw new NotFoundException('Сессия не найдена');
    return session;
  }

  async enqueueRender(sessionId: string, dto: PrecisionRenderDto) {
    const session = await this.prisma.precisionSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Сессия не найдена');

    for (const imp of dto.imprints) {
      if (imp.contentKind === 'logo' && !imp.assetId) {
        throw new BadRequestException('Для нанесения логотипа нужен assetId');
      }
      if (imp.contentKind === 'text' && !imp.text?.trim()) {
        throw new BadRequestException('Для текстового нанесения нужен непустой text');
      }
    }

    const count = await this.prisma.precisionRender.count({ where: { sessionId } });

    await this.prisma.precisionSession.update({
      where: { id: sessionId },
      data: { outputMode: dto.outputMode, config: dto as unknown as object },
    });

    const render = await this.prisma.precisionRender.create({
      data: { sessionId, status: 'queued', sortOrder: count },
    });

    await precisionQueue.add('render', { renderId: render.id }, { removeOnComplete: 50, attempts: 1 });
    return render;
  }

  /**
   * zoneId → строка ProductBranding. Общий помощник для attachZoneLimits (валидация) и
   * PrecisionProcessor (промпт на рендер) — оба должны резолвить зону КАЖДОГО нанесения
   * по его собственному zoneId, а не только по зоне первого. Неизвестные id просто
   * отсутствуют в карте.
   */
  async getZoneMap(zoneIds: Array<string | undefined>): Promise<Map<string, ProductBranding>> {
    const ids = [...new Set(zoneIds.filter((id): id is string => Boolean(id)))];
    if (ids.length === 0) return new Map();

    const zones = await this.prisma.productBranding.findMany({ where: { id: { in: ids } } });
    return new Map(zones.map((z) => [z.id, z]));
  }

  /** zoneId → лимиты зоны; неизвестный id просто не даёт лимитов */
  async attachZoneLimits(imprints: Array<ImprintToValidate & { zoneId?: string }>) {
    const byId = await this.getZoneMap(imprints.map((i) => i.zoneId));
    if (byId.size === 0) return imprints;

    return imprints.map((imp) => {
      const z = imp.zoneId ? byId.get(imp.zoneId) : undefined;
      if (!z) return imp;
      return {
        ...imp,
        zone: {
          zoneName: z.zoneNameRu ?? z.zoneName,
          maxWidthMm: z.maxWidthMm,
          maxHeightMm: z.maxHeightMm,
          maxAreaMm2: z.maxAreaMm2,
          maxColors: z.maxColors,
        },
      };
    });
  }
}

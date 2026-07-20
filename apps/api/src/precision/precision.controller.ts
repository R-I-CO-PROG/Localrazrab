import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { readFile, unlink } from 'fs/promises';
import { PrecisionService } from './precision.service';
import { PhotoSearchService } from './photo-search.service';
import { PrecisionRenderDto } from './dto/precision-render.dto';
import { judgeVerdictWarnings, type PrecisionVerdict } from '../generation/precision-judge';
import { IMPRINT_METHODS } from '../generation/imprint-methods';
import { validateImprints } from '../generation/imprint-validation';
import { PrecisionValidateDto } from './dto/precision-validate.dto';
import { assetMulterOptions } from '../assets/upload.config';

@Controller()
export class PrecisionController {
  constructor(
    private readonly precision: PrecisionService,
    private readonly photoSearch: PhotoSearchService,
  ) {}

  @Post('precision/sessions')
  @Throttle({ default: { limit: 30, ttl: 3_600_000 } })
  @UseInterceptors(FileInterceptor('photo', assetMulterOptions()))
  async createSession(@UploadedFile() photo?: Express.Multer.File, @Body('productId') productId?: string) {
    if (!photo && !productId) throw new BadRequestException('Нужно фото товара или productId');

    // assetMulterOptions() пишет через diskStorage в uploads/assets/<uuid>.<ext> — файл уже
    // на диске и прошёл 10 МБ/MIME-фильтр к этому моменту, буфера в памяти тут нет.
    const sourceImageUrl = photo ? `/uploads/assets/${photo.filename}` : undefined;

    return this.precision.createSession({ sourceImageUrl, productId });
  }

  @Post('precision/sessions/:id/render')
  @Throttle({ default: { limit: 30, ttl: 3_600_000 } })
  render(@Param('id') id: string, @Body() dto: PrecisionRenderDto) {
    return this.precision.enqueueRender(id, dto);
  }

  @Get('precision/sessions/:id')
  async getSession(@Param('id') id: string) {
    const session = await this.precision.getSession(id);
    return {
      ...session,
      renders: session.renders.map((r) => ({
        ...r,
        judgeWarnings: r.judgeVerdict ? judgeVerdictWarnings(r.judgeVerdict as unknown as PrecisionVerdict) : [],
      })),
    };
  }

  @Post('catalog/search-by-photo')
  @Throttle({ default: { limit: 60, ttl: 3_600_000 } })
  @UseInterceptors(FileInterceptor('photo', assetMulterOptions()))
  async searchByPhoto(@UploadedFile() photo: Express.Multer.File) {
    if (!photo) throw new BadRequestException('Нужно фото');
    // diskStorage не даёт photo.buffer — читаем то, что multer уже сохранил на диск.
    const buffer = await readFile(photo.path);
    const matches = await this.photoSearch.findSimilarByPhoto(buffer, 8);
    // Разовый поиск ничего не персистит в БД — не оставляем сиротский файл в uploads/assets.
    await unlink(photo.path).catch(() => undefined);
    return { matches };
  }

  /** Справочник методов для селекта на фронте — единственный источник правды */
  @Get('precision/methods')
  methods() {
    return Object.values(IMPRINT_METHODS).map((m) => ({
      code: m.code,
      labelRu: m.labelRu,
      colorMode: m.colorMode,
      maxColors: m.maxColors,
      maxWidthMm: m.maxWidthMm,
      maxHeightMm: m.maxHeightMm,
    }));
  }

  /**
   * Валидация с холста. Правила живут только здесь — фронт их не дублирует,
   * иначе таблица лимитов разъедется с промптом. zoneId → лимиты зоны
   * подтягиваются из ProductBranding перед прогоном чистого валидатора.
   */
  @Post('precision/validate')
  async validate(@Body() body: PrecisionValidateDto) {
    const enriched = await this.precision.attachZoneLimits(body.imprints);
    return { warnings: validateImprints(enriched, { materialRu: body.materialRu ?? null }) };
  }
}

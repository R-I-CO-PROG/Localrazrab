import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../security/public.decorator';
import {
  isAllowedExternalCatalogImageUrl,
  resolveExternalCatalogImageFetchUrl,
} from './catalog-external-image.util';

@Controller('catalog-external-image')
export class CatalogExternalImageController {
  @Public()
  @Get()
  async proxy(@Query('url') rawUrl: string, @Res() res: Response): Promise<void> {
    const url = resolveExternalCatalogImageFetchUrl(rawUrl ?? '');
    if (!url || !isAllowedExternalCatalogImageUrl(url)) {
      throw new BadRequestException('Invalid or disallowed image URL');
    }

    const upstream = await fetch(url, {
      headers: { 'User-Agent': 'Mercai-Catalog-Image-Proxy/1.0' },
      signal: AbortSignal.timeout(15_000),
    });

    if (!upstream.ok) {
      throw new NotFoundException(`Upstream image not found (${upstream.status})`);
    }

    const contentType = upstream.headers.get('content-type') ?? 'image/jpeg';
    if (!contentType.startsWith('image/')) {
      throw new BadRequestException('Upstream response is not an image');
    }

    const body = Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.send(body);
  }
}

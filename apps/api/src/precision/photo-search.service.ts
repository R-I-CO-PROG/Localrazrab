import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import { PrismaService } from '../prisma/prisma.service';
import { openRouterFetch } from '../providers/llm/openrouter-proxy.util';
import { safeJsonParse } from '../providers/llm/safe-json-parse.util';
import {
  DESCRIBE_PROMPT,
  parsePhotoDescription,
  parseRerankResponse,
  photoSearchTerms,
  type PhotoMatch,
} from './photo-search.parsers';

const RETRIEVAL_LIMIT = 60;
const RERANK_LIMIT = 24;

@Injectable()
export class PhotoSearchService {
  private readonly logger = new Logger(PhotoSearchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private async chat(content: unknown[]): Promise<string> {
    const apiKey = this.config.get<string>('OPENROUTER_API_KEY', '').trim();
    if (!apiKey) throw new Error('OPENROUTER_API_KEY is not configured');
    const model = this.config.get<string>('OPENROUTER_MODEL_PHOTO_SEARCH', 'google/gemini-2.5-flash');

    // openRouterFetch, а не голый fetch: OpenRouter за Cloudflare режет IP хостера (HTTP 403),
    // egress обязан идти через VPN-прокси OPENROUTER_PROXY — иначе поиск по фото молча пуст.
    const res = await openRouterFetch(
      process.env.OPENROUTER_API_URL?.trim() || 'https://openrouter.ai/api/v1/chat/completions',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: [{ role: 'user', content }] }),
        signal: AbortSignal.timeout(90_000),
      },
    );
    if (!res.ok) throw new Error(`photo-search HTTP ${res.status}`);
    // res.json() зовёт JSON.parse на СЫРОМ теле: гигантский/битый ответ (HTML-страница
    // Cloudflare 403, обрыв VPN) роняет ВЕСЬ процесс OOM-абортом внутри JsonParser —
    // try/catch его не ловит. Сначала читаем как текст и режем по размеру. [[mercai-openrouter-oom-guard]]
    const text = await res.text();
    const json = safeJsonParse<{ choices?: Array<{ message?: { content?: string } }> }>(text, 'photo-search');
    return json.choices?.[0]?.message?.content ?? '';
  }

  private async thumbnail(buf: Buffer, side = 256): Promise<string> {
    const png = await sharp(buf).resize(side, side, { fit: 'inside' }).png().toBuffer();
    return `data:image/png;base64,${png.toString('base64')}`;
  }

  private async fetchThumbnail(url: string): Promise<string | null> {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) return null;
      return await this.thumbnail(Buffer.from(await res.arrayBuffer()));
    } catch {
      return null;
    }
  }

  async findSimilarByPhoto(photo: Buffer, limit = 8): Promise<PhotoMatch[]> {
    const photoUri = await this.thumbnail(photo, 768);

    const described = parsePhotoDescription(
      await this.chat([{ type: 'text', text: DESCRIBE_PROMPT }, { type: 'image_url', image_url: { url: photoUri } }]),
    );
    if (!described) {
      this.logger.warn('Не удалось описать фото');
      return [];
    }

    // Кандидаты — по СТЕМАМ терминов (кружки→кружк ловит «кружка»), матч по name ИЛИ subcategory.
    // Категория — МЯГКИЙ сигнал в общем OR, а НЕ жёсткий AND: раньше одна неверная догадка
    // категории обнуляла всю выдачу («как будто не работает»). Ре-ранк ниже уточняет визуально.
    const terms = photoSearchTerms(described);
    const or: Array<Record<string, unknown>> = terms.flatMap((t) => [
      { name: { contains: t, mode: 'insensitive' as const } },
      { subcategory: { contains: t, mode: 'insensitive' as const } },
    ]);
    if (described.category) {
      or.push({ category: { contains: described.category, mode: 'insensitive' as const } });
      or.push({ subcategory: { contains: described.category, mode: 'insensitive' as const } });
    }

    const candidates = or.length
      ? await this.prisma.product.findMany({
          where: { OR: or },
          select: { id: true, name: true, catalogImageUrl: true },
          take: RETRIEVAL_LIMIT,
          orderBy: { stockAvailable: 'desc' },
        })
      : [];

    if (candidates.length === 0) {
      this.logger.warn(`Нет кандидатов по фото (термины: ${terms.join(', ') || '—'})`);
      return [];
    }

    const shortlist = candidates.slice(0, RERANK_LIMIT);
    if (candidates.length > RERANK_LIMIT) {
      this.logger.log(`Ререйк только первых ${RERANK_LIMIT} из ${candidates.length} кандидатов`);
    }

    const content: unknown[] = [
      {
        type: 'text',
        text: `Image 1 is the QUERY product photo. The following ${shortlist.length} images are catalog candidates. Rank how visually similar each candidate is to the query. Answer ONLY with JSON: {"matches":[{"productId":string,"similarity":0-100,"reason":string}]}. Reason in Russian, max 8 words. Return at most ${limit} matches, best first.`,
      },
      { type: 'image_url', image_url: { url: photoUri } },
    ];

    const thumbnails = await Promise.all(
      shortlist.map((c) => (c.catalogImageUrl ? this.fetchThumbnail(c.catalogImageUrl) : Promise.resolve(null))),
    );
    shortlist.forEach((c, i) => {
      const uri = thumbnails[i];
      if (!uri) return;
      content.push({ type: 'text', text: `Candidate productId=${c.id}: ${c.name}` });
      content.push({ type: 'image_url', image_url: { url: uri } });
    });

    const ids = shortlist.map((c) => c.id);
    return parseRerankResponse(await this.chat(content), ids).slice(0, limit);
  }
}

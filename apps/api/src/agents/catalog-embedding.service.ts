import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  embedTexts,
  embeddingsEnabled,
  giftIntentForBrief,
} from '../providers/llm/catalog-embeddings.util';
import type { CatalogProduct } from '../providers/llm/catalog.util';
import { withTimeout } from '../common/promise-timeout.util';

/** G4 (пере-скан): pgvector-запросы (seq-scan по 51k строк, без ANN-индекса) не были ничем
 *  ограничены по времени — зависший/деградировавший запрос молча висел бы до таймаута драйвера/
 *  пула соединений, блокируя генерацию. Безопасный верхний предел на каждый запрос: обычный
 *  cosine-скан 51k строк укладывается в десятки-сотни мс, 4с — щедрый запас без риска обрезать
 *  легитимно-медленный (но рабочий) запрос под нагрузкой. */
const PGVECTOR_QUERY_TIMEOUT_MS = 4_000;

/**
 * Семантический fit товара к «интенту подарка» аудитории через pgvector. fit = cos(товар,интент+)
 * − cos(товар,интент−): различает то, что keyword-правила не могут («органайзер для документов»
 * +0.02 vs «органайзер для багажника» −0.14). Товарные векторы в Product.embedding.
 */
@Injectable()
export class CatalogEmbeddingService {
  private readonly logger = new Logger(CatalogEmbeddingService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Карта id→fit для кандидатов брифа. Пустая при недоступности эмбеддингов/интента (fallback). */
  async semanticFit(brief: string, productIds: string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    const intent = giftIntentForBrief(brief);
    if (!intent || !embeddingsEnabled() || !productIds.length) return out;
    let vecs: number[][];
    try {
      vecs = await embedTexts([intent.positive, intent.negative]);
    } catch (e) {
      this.logger.warn(`intent embed failed: ${(e as Error).message}`);
      return out;
    }
    if (vecs.length < 2 || !vecs[0].length) return out;
    const posStr = `[${vecs[0].join(',')}]`;
    const negStr = `[${vecs[1].join(',')}]`;
    try {
      const ids = [...new Set(productIds)];
      const rows = await withTimeout(
        this.prisma.$queryRawUnsafe<Array<{ id: string; fit: number }>>(
          `SELECT id, ((1 - (embedding <=> $1::vector)) - (1 - (embedding <=> $2::vector)))::float8 AS fit
           FROM "Product"
           WHERE embedding IS NOT NULL AND id = ANY(string_to_array($3, ','))`,
          posStr,
          negStr,
          ids.join(','),
        ),
        PGVECTOR_QUERY_TIMEOUT_MS,
        'semanticFit query',
      );
      for (const r of rows) out.set(r.id, Number(r.fit));
      this.logger.log(`Semantic fit: ${out.size}/${ids.length} товаров оценено (интент аудитории)`);
    } catch (e) {
      this.logger.warn(`semantic fit query failed: ${(e as Error).message}`);
    }
    return out;
  }

  /**
   * Кросс-концептовый семантический дедуп: id кандидатов, СМЫСЛОВО близких (cos > threshold) к
   * уже использованным в прошлых наборах товарам. Ловит «ручка/рюкзак/папка везде» по смыслу, а
   * не по типу — две «папки для документов» ~0.9, блокируем повтор. Пустой при недоступности.
   */
  async similarToUsed(usedIds: string[], candidateIds: string[], threshold = 0.8): Promise<Set<string>> {
    const blocked = new Set<string>();
    if (!embeddingsEnabled() || !usedIds.length || !candidateIds.length) return blocked;
    try {
      const rows = await withTimeout(
        this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT c.id FROM "Product" c
           WHERE c.embedding IS NOT NULL AND c.id = ANY(string_to_array($1, ','))
             AND EXISTS (
               SELECT 1 FROM "Product" u
               WHERE u.id = ANY(string_to_array($2, ',')) AND u.embedding IS NOT NULL
                 AND (1 - (c.embedding <=> u.embedding)) > $3::float8)`,
          candidateIds.join(','),
          usedIds.join(','),
          threshold,
        ),
        PGVECTOR_QUERY_TIMEOUT_MS,
        'similarToUsed query',
      );
      for (const r of rows) blocked.add(r.id);
      if (blocked.size) this.logger.log(`Semantic dedup: ${blocked.size} кандидатов близки к уже использованным (cos>${threshold})`);
    } catch (e) {
      this.logger.warn(`semantic dedup query failed: ${(e as Error).message}`);
    }
    return blocked;
  }

  /**
   * СЕМАНТИЧЕСКИЙ RETRIEVAL: топ сильно-профильных товаров под аудиторию из ВСЕГО каталога (51k)
   * через pgvector — не только из keyword-среза. Гарантирует, что профильные позиции (визитница/
   * папка продажнику, маска для сна/бальзам врачу) попадут в пул каждого набора и байер их увидит.
   * Возвращает CatalogProduct[] с проставленным semanticFit (валидные: сток≥тираж, ≤бюджет, с фото).
   */
  async topProfileProducts(
    brief: string,
    opts: { budgetMax?: number | null; tirage?: number | null; minFit?: number; limit?: number },
  ): Promise<CatalogProduct[]> {
    const intent = giftIntentForBrief(brief);
    if (!intent || !embeddingsEnabled()) return [];
    let vecs: number[][];
    try {
      vecs = await embedTexts([intent.positive, intent.negative]);
    } catch {
      return [];
    }
    if (vecs.length < 2 || !vecs[0].length) return [];
    const posStr = `[${vecs[0].join(',')}]`;
    const negStr = `[${vecs[1].join(',')}]`;
    const budget = opts.budgetMax && opts.budgetMax > 0 ? opts.budgetMax : 1_000_000;
    const tirage = opts.tirage && opts.tirage > 0 ? opts.tirage : 0;
    const minFit = opts.minFit ?? 0.05;
    const limit = opts.limit ?? 80;
    try {
      // РАЗНООБРАЗИЕ инжекта: не топ-80 по fit (они почти все ОДНОГО типа — папки с макс.fit), а
      // ≤3 на категорию (window ROW_NUMBER) → визитница+папка+презентер+powerbank+термокружка+сумка.
      const rows = await withTimeout(
        this.prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT id, name, category, subcategory, description, price, "stockAvailable", colors,
                  "catalogImageUrl", "silhouetteImageUrl", "sourceUrl", "widthCm", "heightCm", "weightG", fit
           FROM (
             SELECT *, ((1 - (embedding <=> $1::vector)) - (1 - (embedding <=> $2::vector)))::float8 AS fit,
                    row_number() OVER (PARTITION BY category ORDER BY ((1 - (embedding <=> $1::vector)) - (1 - (embedding <=> $2::vector))) DESC) AS rn
             FROM "Product"
             WHERE embedding IS NOT NULL AND "catalogImageUrl" IS NOT NULL
               AND (price IS NULL OR price <= $3) AND "stockAvailable" >= $4
               AND ((1 - (embedding <=> $1::vector)) - (1 - (embedding <=> $2::vector))) > $5::float8
           ) t
           WHERE rn <= 3
           ORDER BY fit DESC
           LIMIT $6::int`,
          posStr, negStr, budget, tirage, minFit, limit,
        ),
        // Самый тяжёлый запрос (полный seq-scan + window-функция по всем 51k строкам с эмбеддингом) —
        // даём больше времени, чем более лёгким semanticFit/similarToUsed.
        PGVECTOR_QUERY_TIMEOUT_MS * 2,
        'topProfileProducts query',
      );
      const products = rows.map((r) => {
        const rawColors = r.colors;
        const colors = Array.isArray(rawColors)
          ? (rawColors as Array<string | { name?: string }>).map((c) => (typeof c === 'string' ? c : c?.name ?? '')).filter(Boolean)
          : [];
        return {
          id: String(r.id), name: String(r.name ?? ''), category: String(r.category ?? ''),
          subcategory: (r.subcategory as string) ?? null, description: (r.description as string) ?? null,
          price: r.price == null ? null : Number(r.price), stockAvailable: Number(r.stockAvailable ?? 0),
          colors: colors.map((name) => ({ name })),
          catalogImageUrl: (r.catalogImageUrl as string) ?? null,
          silhouetteImageUrl: String(r.silhouetteImageUrl ?? ''),
          imageUrl: (r.catalogImageUrl as string) ?? (r.silhouetteImageUrl as string) ?? null,
          sourceUrl: (r.sourceUrl as string) ?? null,
          widthCm: r.widthCm == null ? null : Number(r.widthCm),
          heightCm: r.heightCm == null ? null : Number(r.heightCm),
          weightG: r.weightG == null ? null : Number(r.weightG),
          semanticFit: Number(r.fit),
        } as CatalogProduct;
      });
      this.logger.log(`Semantic retrieval: ${products.length} топ-профильных товаров под аудиторию (fit>${minFit})`);
      return products;
    } catch (e) {
      this.logger.warn(`topProfileProducts query failed: ${(e as Error).message}`);
      return [];
    }
  }
}

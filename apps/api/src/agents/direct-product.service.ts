import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { DirectProductQuery, DirectProductResult } from './contracts';

@Injectable()
export class DirectProductService {
  private readonly logger = new Logger(DirectProductService.name);

  constructor(private readonly prisma: PrismaService) {}

  async search(query: DirectProductQuery, limit = 10): Promise<DirectProductResult> {
    const keywords = [...query.keywords, ...query.mustInclude].filter(Boolean);
    const products = await this.prisma.product.findMany({ orderBy: { name: 'asc' } });

    const scored = products
      .map((p) => ({ product: p, score: this.scoreProduct(p, query, keywords) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.min(Math.max(limit, 5), 12));

    if (scored.length === 0 && keywords.length > 0) {
      const fallback = products
        .filter((p) =>
          keywords.some((k) => p.name.toLowerCase().includes(k) || p.category.toLowerCase().includes(k)),
        )
        .slice(0, limit);
      return {
        productIds: fallback.map((p) => p.id),
        products: fallback.map((p) => ({ id: p.id, name: p.name, category: p.category })),
      };
    }

    const picked = scored.length ? scored.map((s) => s.product) : products.slice(0, limit);
    this.logger.log(`Direct product search: ${picked.length} items for [${keywords.join(', ')}]`);
    return {
      productIds: picked.map((p) => p.id),
      products: picked.map((p) => ({ id: p.id, name: p.name, category: p.category })),
    };
  }

  private scoreProduct(
    p: { name: string; category: string; slug: string },
    query: DirectProductQuery,
    keywords: string[],
  ): number {
    const name = p.name.toLowerCase();
    const category = p.category.toLowerCase();
    const slug = p.slug.toLowerCase();
    let score = 0;

    for (const k of keywords) {
      const kw = k.toLowerCase();
      if (name.includes(kw)) score += 3;
      if (slug.includes(kw)) score += 2;
      if (category.includes(kw)) score += 1;
    }

    for (const hint of query.categoryHints) {
      if (category.includes(hint.toLowerCase())) score += 2;
    }

    for (const bad of query.mustNotInclude) {
      if (name.includes(bad.toLowerCase())) score -= 5;
    }

    for (const color of query.colors) {
      if (name.includes(color.toLowerCase())) score += 1;
    }

    return score;
  }
}

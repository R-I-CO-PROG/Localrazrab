import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { buildProductWhere } from './products-where';
import { rankProductsBySearch } from './products-search-rank';

/** Верхняя граница пула для ранжирования поиска (хватает, чтобы поднять лучшие совпадения). */
const SEARCH_POOL = 600;
const SEARCH_PREFIX_POOL = 200;

export interface ProductsListResult {
  items: Awaited<ReturnType<PrismaService['product']['findMany']>>;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters?: {
    category?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  }): Promise<ProductsListResult> {
    const page = Math.max(1, filters?.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filters?.pageSize ?? 24));
    const where = buildProductWhere(filters);
    const skip = (page - 1) * pageSize;
    const search = filters?.search?.trim();

    // Поиск: ранжируем по релевантности и схлопываем цвето/размер-варианты (иначе выдача —
    // «всё подряд» по алфавиту, топ занимают 6 цветов одного товара). Пул включает префикс-
    // совпадения, чтобы лучшие имена не терялись в алфавите. Без поиска — обычный просмотр.
    if (search) {
      const categoryWhere = buildProductWhere({ category: filters?.category });
      const [prefixPool, mainPool, total] = await Promise.all([
        this.prisma.product.findMany({
          where: { AND: [categoryWhere, { name: { startsWith: search, mode: 'insensitive' } }] },
          orderBy: { name: 'asc' },
          take: SEARCH_PREFIX_POOL,
        }),
        this.prisma.product.findMany({ where, orderBy: { name: 'asc' }, take: SEARCH_POOL }),
        this.prisma.product.count({ where }),
      ]);

      const byId = new Map<string, (typeof mainPool)[number]>();
      for (const p of [...prefixPool, ...mainPool]) byId.set(p.id, p);
      const ranked = rankProductsBySearch([...byId.values()], search);

      return {
        items: ranked.slice(skip, skip + pageSize),
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      };
    }

    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy: { name: 'asc' },
        skip,
        take: pageSize,
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  findById(id: string) {
    return this.prisma.product.findUnique({ where: { id } });
  }

  async findBranding(productId: string) {
    return this.prisma.productBranding.findMany({
      where: { productId },
      orderBy: [{ zoneName: 'asc' }, { methodCode: 'asc' }],
    });
  }

  async stats() {
    const [total, categories] = await Promise.all([
      this.prisma.product.count(),
      this.prisma.product.groupBy({
        by: ['category'],
        _count: { _all: true },
        orderBy: { category: 'asc' },
      }),
    ]);
    return {
      total,
      categories: categories.map((c) => ({
        name: c.category,
        count: c._count._all,
      })),
    };
  }
}

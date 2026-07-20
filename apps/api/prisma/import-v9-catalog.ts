/**
 * Безопасный импорт каталога Catalog IMBA (site-catalog-snapshot.v9.json) в прод.
 *
 * В отличие от import-imba-catalog.ts:
 *  - НЕ удаляет существующие товары/RequestItem
 *  - НЕ пересчитывает категории regex-правилами — берёт готовые category/categoryTop из v9
 *  - Делает upsert по (sourceId, externalId): обновляет category/subcategory/description
 *    у существующих товаров, вставляет новые (xdconnects, portobello)
 *
 * Usage:
 *   cd apps/api
 *   npx tsx prisma/import-v9-catalog.ts "/path/to/site-catalog-snapshot.v9.json" [--limit=50] [--dry-run]
 */
import { Prisma, PrismaClient } from '@prisma/client';
import { existsSync, readFileSync } from 'fs';

const prisma = new PrismaClient();

const FALLBACK_IMAGE = '/uploads/silhouettes/pen.png';

interface V9Item {
  site: string;
  sku: string;
  id?: string;
  name: string;
  brand?: string;
  color?: string;
  category?: string;
  categoryTop?: string;
  priceRub?: string | number;
  stock?: string | number;
  image?: string;
  url?: string;
  description?: string;
  slug?: string;
}

interface V9Snapshot {
  items: V9Item[];
}

function slugFrom(site: string, sku: string): string {
  return `${site}__${sku.replace(/\./g, '-').replace(/\//g, '-')}`;
}

function parseNum(value: string | number | undefined): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function parseIntStock(value: string | number | undefined): number {
  if (value == null || value === '') return 0;
  const n = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function itemToRow(item: V9Item): Prisma.ProductCreateInput | null {
  const sourceId = String(item.site || '').trim();
  const externalId = String(item.sku || item.id || '').trim();
  const name = String(item.name || '').trim();
  const categoryTop = String(item.categoryTop || '').trim();
  const categoryPath = String(item.category || '').trim();
  if (!sourceId || !externalId || !name || !categoryTop) return null;

  const image = String(item.image || '').trim() || FALLBACK_IMAGE;
  const colors: Prisma.InputJsonValue = item.color?.trim()
    ? [{ name: item.color.trim(), hex: null, code: null }]
    : [];

  return {
    slug: item.slug?.trim() || slugFrom(sourceId, externalId),
    name,
    category: categoryTop,
    subcategory: categoryPath || null,
    description: item.description?.trim() || null,
    sourceId,
    externalId,
    price: parseNum(item.priceRub),
    currency: 'RUB',
    stockAvailable: parseIntStock(item.stock),
    colors,
    sourceUrl: item.url?.trim() || null,
    silhouetteImageUrl: image,
    catalogImageUrl: image.startsWith('http') ? image : null,
  };
}

async function main() {
  const jsonPath = process.argv[2];
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? Number.parseInt(limitArg.split('=')[1], 10) : null;
  const dryRun = process.argv.includes('--dry-run');

  if (!jsonPath || !existsSync(jsonPath)) {
    console.error(`v9 snapshot not found: ${jsonPath}`);
    process.exit(1);
  }

  console.log(`Reading ${jsonPath}…`);
  const snapshot = JSON.parse(readFileSync(jsonPath, 'utf8')) as V9Snapshot;
  let items = snapshot.items ?? [];
  console.log(`v9 snapshot: ${items.length} items`);

  if (limit) {
    items = items.slice(0, limit);
    console.log(`LIMIT active: processing first ${items.length} items`);
  }

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const skippedSamples: string[] = [];

  for (const item of items) {
    const row = itemToRow(item);
    if (!row) {
      skipped++;
      if (skippedSamples.length < 5) skippedSamples.push(item.name ?? '(no name)');
      continue;
    }

    if (dryRun) {
      const existing = await prisma.product.findUnique({
        where: { sourceId_externalId: { sourceId: row.sourceId, externalId: row.externalId } },
        select: { id: true, category: true, subcategory: true },
      });
      if (existing) {
        updated++;
        if (updated <= 10) {
          console.log(
            `[UPDATE] ${row.name.slice(0, 50)} :: "${existing.category}" → "${row.category}" | "${existing.subcategory}" → "${row.subcategory}"`,
          );
        }
      } else {
        inserted++;
        if (inserted <= 10) console.log(`[INSERT] ${row.name.slice(0, 50)} :: ${row.category} / ${row.subcategory}`);
      }
      continue;
    }

    const result = await prisma.product.upsert({
      where: { sourceId_externalId: { sourceId: row.sourceId, externalId: row.externalId } },
      create: row,
      update: {
        category: row.category,
        subcategory: row.subcategory,
        description: row.description,
        name: row.name,
        colors: row.colors,
        sourceUrl: row.sourceUrl,
      },
    });
    // upsert doesn't tell us insert-vs-update directly; check createdAt freshness instead
    const isNew = Date.now() - new Date(result.createdAt).getTime() < 5000;
    if (isNew) inserted++;
    else updated++;

    if ((inserted + updated) % 2000 === 0) {
      console.log(`  progress: ${inserted + updated}/${items.length} (inserted ${inserted}, updated ${updated})`);
    }
  }

  console.log(`\nDone${dryRun ? ' (dry-run, no writes)' : ''}: inserted=${inserted} updated=${updated} skipped=${skipped}`);
  if (skippedSamples.length) console.log(`Skipped samples: ${skippedSamples.join(' | ')}`);

  const count = await prisma.product.count();
  console.log(`Total products in DB now: ${count}`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

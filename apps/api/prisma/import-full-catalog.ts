/**
 * Импорт полного каталога (~2382 SKU) из catalog-handoff-full в PostgreSQL.
 * ВНИМАНИЕ: удаляет все существующие товары. Для дополнения используйте catalog:merge.
 *
 * Usage:
 *   cd apps/api
 *   pnpm catalog:import
 */
import { PrismaClient } from '@prisma/client';
import { existsSync } from 'fs';
import { join } from 'path';
import { entryToProductRow, loadCatalogIndex } from './catalog-import-lib';

const prisma = new PrismaClient();

const ROOT =
  process.env.CATALOG_HANDOFF_DIR ||
  join(process.cwd(), '../../data/catalog-handoff-full');

const INDEX_PATH = join(ROOT, 'catalog-index.json');

async function main() {
  if (!existsSync(INDEX_PATH)) {
    console.error(`catalog-index.json not found: ${INDEX_PATH}`);
    process.exit(1);
  }

  const index = loadCatalogIndex(INDEX_PATH);

  console.log(`Importing ${index.products.length} products from ${ROOT}`);

  await prisma.requestItem.deleteMany();
  await prisma.product.deleteMany();

  const batchSize = 100;
  let imported = 0;
  let skipped = 0;

  for (let i = 0; i < index.products.length; i += batchSize) {
    const chunk = index.products.slice(i, i + batchSize);
    const rows = [];

    for (const entry of chunk) {
      const row = entryToProductRow(entry, ROOT);
      if (!row) {
        skipped++;
        continue;
      }
      rows.push(row);
    }

    if (rows.length) {
      await prisma.product.createMany({ data: rows, skipDuplicates: true });
      imported += rows.length;
    }

    console.log(`  batch ${Math.floor(i / batchSize) + 1}: +${rows.length} (total ${imported})`);
  }

  const count = await prisma.product.count();
  console.log(`Done: ${count} products in DB (${skipped} skipped)`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

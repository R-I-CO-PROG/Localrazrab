/**
 * Бэкофилл габаритов в Product по (sourceId, externalId) — БЕЗ пересоздания каталога.
 * Запуск на VPS с ЖИВЫМ DATABASE_URL:
 *   DATABASE_URL='<live>' npx tsx prisma/backfill-dimensions.ts prisma/catalog-dimensions.json
 */
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';

interface DimRow {
  sourceId: string;
  externalId: string;
  widthCm: number | null;
  heightCm: number | null;
  depthCm: number | null;
  weightG: number | null;
}

async function main() {
  const prisma = new PrismaClient();
  const file = process.argv[2] || 'prisma/catalog-dimensions.json';
  const rows: DimRow[] = JSON.parse(readFileSync(file, 'utf8'));
  console.log(`rows: ${rows.length}`);

  const BATCH = 400;
  let updated = 0;
  for (let start = 0; start < rows.length; start += BATCH) {
    const batch = rows.slice(start, start + BATCH);
    const res = await Promise.all(
      batch.map((r) =>
        prisma.product.updateMany({
          where: { sourceId: r.sourceId, externalId: r.externalId },
          data: {
            widthCm: r.widthCm,
            heightCm: r.heightCm,
            depthCm: r.depthCm,
            weightG: r.weightG,
          },
        }),
      ),
    );
    updated += res.reduce((s, x) => s + x.count, 0);
    if (start % (BATCH * 20) === 0) console.log(`${start}/${rows.length} updated=${updated}`);
  }
  console.log(`DONE updated=${updated}/${rows.length}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

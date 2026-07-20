/**
 * Бэкофилл ProductBranding + Product.material по (sourceId, externalId).
 * Запускать ПОСЛЕ catalog:import-imba — импорт пересоздаёт Product и уносит ProductBranding каскадом.
 *   DATABASE_URL='<live>' npx tsx prisma/backfill-branding.ts prisma/catalog-branding.json
 *
 * Батчит запись (БД удалённая, за SSH-туннелем — построчные round trip'ы недопустимо медленные):
 *  - один findMany на весь батч, чтобы резолвить productId;
 *  - Product.material: группировка по значению материала → один updateMany на каждое
 *    отличающееся значение внутри батча (пропускаем строки без материала);
 *  - ProductBranding: один deleteMany({productId in [...], source}) на каждый источник,
 *    встретившийся в батче, затем ОДИН createMany на все зоны батча разом.
 */
import { Prisma, PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import type { ParsedProductBranding } from '../src/catalog/branding-feed-parsers';

const BATCH = 400;

async function main() {
  const prisma = new PrismaClient();
  const file = process.argv[2] || 'prisma/catalog-branding.json';
  const parsedRows: ParsedProductBranding[] = JSON.parse(readFileSync(file, 'utf8'));
  console.log(`rows: ${parsedRows.length}`);

  // Дедупликация по (sourceId, externalId) ДО батчинга: оставляем ПОСЛЕДНЕЕ вхождение,
  // чтобы last-write-wins выполнялось по построению, а не по случайному распределению
  // дублей между батчами (внутри одного батча delete-then-createMany не различает
  // порядок строк — оба дубля выжили бы и объединили зоны).
  const byDedupeKey = new Map<string, ParsedProductBranding>();
  for (const r of parsedRows) {
    byDedupeKey.set(`${r.sourceId}:${r.externalId}`, r);
  }
  const rows: ParsedProductBranding[] = Array.from(byDedupeKey.values());
  console.log(
    `dedupe: ${parsedRows.length} → ${rows.length} (collapsed ${parsedRows.length - rows.length} duplicate keys)`,
  );

  let matched = 0;
  let materialUpdated = 0;
  let zonesCreated = 0;
  const startedAt = Date.now();

  for (let start = 0; start < rows.length; start += BATCH) {
    const batch = rows.slice(start, start + BATCH);

    const products = await prisma.product.findMany({
      where: { OR: batch.map((r) => ({ sourceId: r.sourceId, externalId: r.externalId })) },
      select: { id: true, sourceId: true, externalId: true },
    });
    const byKey = new Map(products.map((p) => [`${p.sourceId}:${p.externalId}`, p.id]));

    const matchedRows: Array<{ productId: string; row: ParsedProductBranding }> = [];
    for (const r of batch) {
      const productId = byKey.get(`${r.sourceId}:${r.externalId}`);
      if (!productId) continue;
      matchedRows.push({ productId, row: r });
    }
    matched += matchedRows.length;

    // --- Product.material: сгруппировать по значению, один updateMany на значение ---
    const byMaterial = new Map<string, string[]>();
    for (const { productId, row } of matchedRows) {
      if (!row.material) continue;
      const ids = byMaterial.get(row.material) ?? [];
      ids.push(productId);
      byMaterial.set(row.material, ids);
    }
    for (const [material, ids] of byMaterial) {
      const res = await prisma.product.updateMany({ where: { id: { in: ids } }, data: { material } });
      materialUpdated += res.count;
    }

    // --- ProductBranding: один deleteMany на источник, один createMany на весь батч ---
    const sourceProductIds = new Map<string, string[]>();
    const zoneRows: Prisma.ProductBrandingCreateManyInput[] = [];
    for (const { productId, row } of matchedRows) {
      if (row.zones.length === 0) continue;
      const ids = sourceProductIds.get(row.sourceId) ?? [];
      ids.push(productId);
      sourceProductIds.set(row.sourceId, ids);
      for (const z of row.zones) {
        zoneRows.push({
          productId,
          zoneName: z.zoneName,
          zoneNameRu: z.zoneName,
          methodRaw: z.methodRaw,
          methodCode: z.methodCode,
          maxWidthMm: z.maxWidthMm,
          maxHeightMm: z.maxHeightMm,
          maxAreaMm2: z.maxAreaMm2,
          maxColors: z.maxColors,
          setupCost: z.setupCost,
          zoneImageUrl: z.zoneImageUrl,
          source: row.sourceId,
        });
      }
    }

    for (const [source, ids] of sourceProductIds) {
      await prisma.productBranding.deleteMany({ where: { productId: { in: ids }, source } });
    }
    if (zoneRows.length > 0) {
      const created = await prisma.productBranding.createMany({ data: zoneRows });
      zonesCreated += created.count;
    }

    if ((start / BATCH) % 20 === 0) {
      const elapsedS = ((Date.now() - startedAt) / 1000).toFixed(1);
      console.log(`${start}/${rows.length} matched=${matched} material=${materialUpdated} zones=${zonesCreated} (${elapsedS}s)`);
    }
  }

  const totalS = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`DONE matched=${matched}/${rows.length}, material=${materialUpdated}, zones=${zonesCreated}, wall=${totalS}s`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

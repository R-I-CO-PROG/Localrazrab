/**
 * Дополняет catalog-handoff-full и PostgreSQL новыми SKU из бэкапа без дубликатов.
 *
 * Usage:
 *   cd apps/api
 *   pnpm catalog:merge -- "D:/path/to/extracted-backup"
 *
 * Env:
 *   CATALOG_HANDOFF_DIR — целевой каталог (по умолчанию ../../data/catalog-handoff-full)
 *   CATALOG_BACKUP_DIR  — альтернатива аргументу CLI
 */
import { PrismaClient } from '@prisma/client';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  CatalogIndex,
  IndexEntry,
  entryToProductRow,
  loadCatalogIndex,
  normalizeIndexEntry,
  productKey,
} from './catalog-import-lib';

const prisma = new PrismaClient();

const TARGET_ROOT =
  process.env.CATALOG_HANDOFF_DIR ||
  join(process.cwd(), '../../data/catalog-handoff-full');

const BACKUP_ROOT =
  process.argv[2] ||
  process.env.CATALOG_BACKUP_DIR ||
  '';

const TARGET_INDEX = join(TARGET_ROOT, 'catalog-index.json');
const BACKUP_INDEX = BACKUP_ROOT
  ? join(BACKUP_ROOT, 'html-catalog-images', 'catalog-index.json')
  : '';
const IMAGES_SUBDIR = 'html-catalog-images';

function emptyIndex(): CatalogIndex {
  return { totalProducts: 0, products: [] };
}

function loadTargetIndex(): CatalogIndex {
  if (!existsSync(TARGET_INDEX)) {
    return emptyIndex();
  }
  return loadCatalogIndex(TARGET_INDEX);
}

function folderExists(folder: string): boolean {
  return existsSync(join(TARGET_ROOT, IMAGES_SUBDIR, folder, 'meta.json'));
}

function copyProductFolder(folder: string, backupRoot: string): void {
  const src = join(backupRoot, IMAGES_SUBDIR, folder);
  const dest = join(TARGET_ROOT, IMAGES_SUBDIR, folder);
  if (!existsSync(src)) {
    throw new Error(`Backup folder not found: ${src}`);
  }
  mkdirSync(join(TARGET_ROOT, IMAGES_SUBDIR), { recursive: true });
  cpSync(src, dest, { recursive: true });
}

function saveIndex(index: CatalogIndex): void {
  const normalized = index.products.map(normalizeIndexEntry);
  const payload: CatalogIndex = {
    generatedAt: new Date().toISOString(),
    totalProducts: normalized.length,
    totalImages: normalized.length,
    products: normalized,
  };
  mkdirSync(TARGET_ROOT, { recursive: true });
  writeFileSync(TARGET_INDEX, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function mergeFiles(): Promise<IndexEntry[]> {
  if (!BACKUP_ROOT || !existsSync(BACKUP_INDEX)) {
    console.error(`Backup index not found. Pass backup dir as argument or set CATALOG_BACKUP_DIR.`);
    console.error(`Expected: ${BACKUP_INDEX || '<backup>/html-catalog-images/catalog-index.json'}`);
    process.exit(1);
  }

  const target = loadTargetIndex();
  const backup = loadCatalogIndex(BACKUP_INDEX);

  const existingKeys = new Set(
    target.products.map((p) => productKey(p.sourceId, p.externalId)),
  );
  const existingFolders = new Set(target.products.map((p) => p.folder));

  console.log(`Target: ${target.products.length} products (${TARGET_ROOT})`);
  console.log(`Backup: ${backup.products.length} products (${BACKUP_ROOT})`);

  const added: IndexEntry[] = [];
  let skippedDuplicate = 0;
  let skippedMissing = 0;

  for (const raw of backup.products) {
    const entry = normalizeIndexEntry(raw);
    const key = productKey(entry.sourceId, entry.externalId);

    if (existingKeys.has(key) || existingFolders.has(entry.folder) || folderExists(entry.folder)) {
      skippedDuplicate++;
      continue;
    }

    const backupFolder = join(BACKUP_ROOT, IMAGES_SUBDIR, entry.folder);
    if (!existsSync(join(backupFolder, 'meta.json'))) {
      skippedMissing++;
      continue;
    }

    copyProductFolder(entry.folder, BACKUP_ROOT);
    target.products.push(entry);
    existingKeys.add(key);
    existingFolders.add(entry.folder);
    added.push(entry);
  }

  saveIndex(target);

  console.log(
    `Files merged: +${added.length} new, ${skippedDuplicate} duplicates skipped, ${skippedMissing} missing in backup`,
  );
  console.log(`Index total: ${target.products.length} products`);

  const categoriesSrc = join(BACKUP_ROOT, 'categories.json');
  const categoriesDest = join(TARGET_ROOT, 'categories.json');
  if (existsSync(categoriesSrc) && !existsSync(categoriesDest)) {
    cpSync(categoriesSrc, categoriesDest);
    console.log('Copied categories.json');
  }

  return added;
}

async function importNewProducts(entries: IndexEntry[]): Promise<void> {
  if (entries.length === 0) {
    console.log('No new products to import into DB');
    return;
  }

  const existing = await prisma.product.findMany({
    select: { sourceId: true, externalId: true },
  });
  const existingKeys = new Set(
    existing
      .filter((p) => p.sourceId && p.externalId)
      .map((p) => productKey(p.sourceId!, p.externalId!)),
  );

  const batchSize = 100;
  let imported = 0;
  let skipped = 0;

  for (let i = 0; i < entries.length; i += batchSize) {
    const chunk = entries.slice(i, i + batchSize);
    const rows = [];

    for (const entry of chunk) {
      const key = productKey(entry.sourceId, entry.externalId);
      if (existingKeys.has(key)) {
        skipped++;
        continue;
      }
      const row = entryToProductRow(entry, TARGET_ROOT);
      if (!row) {
        skipped++;
        continue;
      }
      rows.push(row);
      existingKeys.add(key);
    }

    if (rows.length) {
      await prisma.product.createMany({ data: rows, skipDuplicates: true });
      imported += rows.length;
    }
    console.log(`  DB batch ${Math.floor(i / batchSize) + 1}: +${rows.length}`);
  }

  const count = await prisma.product.count();
  console.log(`DB import done: +${imported} new (${skipped} skipped), total ${count} products`);
}

async function main() {
  console.log(`Merging catalog backup into ${TARGET_ROOT}`);
  const added = await mergeFiles();
  await importNewProducts(added);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

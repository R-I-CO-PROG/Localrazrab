import { Prisma } from '@prisma/client';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export interface IndexEntry {
  sourceId: string;
  externalId: string;
  name: string;
  folder: string;
  exportPath?: string;
  price?: number;
  currency?: string;
  category: string;
  subcategory?: string;
  stockAvailable?: number;
}

export interface CatalogIndex {
  generatedAt?: string;
  totalProducts: number;
  totalImages?: number;
  products: IndexEntry[];
}

interface MetaColor {
  name: string;
  hex?: string;
  code?: string;
}

interface MetaJson {
  name: string;
  description?: string;
  price?: number;
  currency?: string;
  category: string;
  subcategory?: string;
  sourceUrl?: string;
  colors?: MetaColor[];
  stock?: { available?: number; total?: number };
}

export function productKey(sourceId: string, externalId: string): string {
  return `${sourceId}::${externalId}`;
}

export function slugFrom(entry: Pick<IndexEntry, 'sourceId' | 'externalId'>): string {
  return `${entry.sourceId}__${entry.externalId.replace(/\./g, '-').replace(/\//g, '-')}`;
}

export function exportPathFrom(entry: IndexEntry): string {
  if (entry.exportPath?.trim()) {
    return entry.exportPath.replace(/\\/g, '/');
  }
  const folder = entry.folder || slugFrom(entry);
  return `html-catalog-images/${folder}`;
}

export function imageUrl(exportPath: string): string {
  return `/catalog-handoff/${exportPath.replace(/\\/g, '/')}/image_01.png`;
}

export function normalizeIndexEntry(entry: IndexEntry): IndexEntry {
  const folder = entry.folder || slugFrom(entry);
  return {
    ...entry,
    folder,
    exportPath: exportPathFrom({ ...entry, folder }),
  };
}

export function loadCatalogIndex(path: string): CatalogIndex {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as CatalogIndex;
  return {
    ...raw,
    products: (raw.products ?? []).map(normalizeIndexEntry),
  };
}

export function entryToProductRow(
  entry: IndexEntry,
  root: string,
): Prisma.ProductCreateManyInput | null {
  const normalized = normalizeIndexEntry(entry);
  const relParts = normalized.exportPath!.split(/[\\/]/).filter(Boolean);
  const metaPath = join(root, ...relParts, 'meta.json');
  const imgPath = join(root, ...relParts, 'image_01.png');

  if (!existsSync(metaPath)) {
    return null;
  }

  let meta: MetaJson;
  try {
    meta = JSON.parse(readFileSync(metaPath, 'utf8')) as MetaJson;
  } catch {
    return null;
  }

  const img = existsSync(imgPath)
    ? imageUrl(normalized.exportPath!)
    : '/uploads/silhouettes/pen.png';
  const colors = (meta.colors ?? []).map((c) => ({
    name: c.name,
    hex: c.hex ?? null,
    code: c.code ?? null,
  }));

  return {
    slug: slugFrom(normalized),
    name: meta.name || normalized.name,
    category: meta.category || normalized.category,
    subcategory: meta.subcategory ?? normalized.subcategory ?? null,
    description: meta.description ?? null,
    sourceId: normalized.sourceId,
    externalId: normalized.externalId,
    price: meta.price ?? normalized.price ?? null,
    currency: meta.currency ?? normalized.currency ?? 'RUB',
    stockAvailable:
      meta.stock?.available ??
      meta.stock?.total ??
      normalized.stockAvailable ??
      0,
    colors,
    sourceUrl: meta.sourceUrl ?? null,
    silhouetteImageUrl: img,
    catalogImageUrl: img,
  };
}

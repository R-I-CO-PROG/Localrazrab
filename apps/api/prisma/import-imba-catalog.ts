/**
 * Полная замена каталога из Catalog IMBA (catalog-unified.json, ~51k SKU).
 * Накладывает category-overrides.json (менеджер категорий) поверх сырого фида.
 *
 * Usage:
 *   cd apps/api
 *   pnpm catalog:import-imba -- "D:/path/catalog-unified.json" "D:/path/category-overrides.json"
 *   CATALOG_IMBA_JSON=... CATALOG_IMBA_OVERRIDES=... pnpm catalog:import-imba
 */
import { Prisma, PrismaClient } from '@prisma/client';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  effectiveImbaCategory,
  leafCategoryName,
  type CategoryOverrides,
} from '../src/catalog/imba-category-overrides';

const prisma = new PrismaClient();

const SITE_SOURCE: Record<string, string> = {
  'art24.by': 'art24',
  'midoceanbrands.ru': 'midocean',
  'oceangifts.ru': 'oceangifts',
  'topcatalog.ru': 'topcatalog',
  'oasiscatalog.com': 'oasis',
};

const FALLBACK_IMAGE = '/uploads/silhouettes/pen.png';

interface ImbaItem {
  site: string;
  sku: string;
  id?: string;
  name: string;
  brand?: string;
  color?: string;
  category?: string;
  categoryUnified?: string;
  categoryRaw?: string;
  priceRub?: string | number;
  stock?: string | number;
  image?: string;
  url?: string;
  description?: string;
}

interface ImbaCatalog {
  generatedAt?: string;
  totals?: { totalUniqueSkuAllSites?: number };
  items: ImbaItem[];
}

function sourceIdFromSite(site: string): string {
  return SITE_SOURCE[site] ?? site.replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 32);
}

function slugFrom(sourceId: string, externalId: string): string {
  return `${sourceId}__${externalId.replace(/\./g, '-').replace(/\//g, '-')}`;
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

/** Упрощённая категория для UI-фильтров Mercai (legacy buckets) */
export function simplifyCategory(path: string): string {
  const p = path.toLowerCase();
  if (/ручк|карандаш|маркер|фломастер|письм|стержн/.test(p)) return 'Ручки';
  if (/кружк|стакан/.test(p) && !/термос|бутыл/.test(p)) return 'Кружки';
  if (/ежедневник|блокнот|записн/.test(p)) return 'Ежедневники и блокноты';
  if (/термос|бутылк|фляж/.test(p)) return 'Термосы и бутылки';
  if (/сумк|рюкзак|шоппер|портфел|портплед|косметичк/.test(p)) return 'Сумки и рюкзаки';
  if (/зонт/.test(p)) return 'Зонты';
  if (/футболк|поло|худи|свитшот|куртк|жилет|брюк|юбк|рубашк|одежд/.test(p)) return 'Одежда';
  if (/текстил|шарф|платок|бейсболк|кепк|панам|носк|перчат/.test(p)) return 'Текстиль';
  if (/электрон|power|флеш|usb|наушник|колонк|заряд|аккумулятор|смарт|проектор/.test(p)) return 'Электроника';
  if (/час/.test(p)) return 'Часы';
  if (/набор|welcome|подарочн/.test(p)) return 'Подарочные наборы';
  if (/офис|канцел|ластик|стикер|папк|бейдж/.test(p)) return 'Офис и канцелярия';
  if (/отдых|спорт|пикник|фитнес|игр|плед|антистресс/.test(p)) return 'Отдых и спорт';
  if (/наград|медал|сувенир|брелок|значк|плакет/.test(p)) return 'Сувениры и награды';
  if (/посуд|кухн|декантер|штоф|шейкер|ступк/.test(p)) return 'Посуда';
  return leafCategoryName(path);
}

function loadOverrides(path: string): CategoryOverrides | null {
  if (!existsSync(path)) {
    console.warn(`category-overrides not found: ${path} — importing without overrides`);
    return null;
  }
  const raw = JSON.parse(readFileSync(path, 'utf8')) as CategoryOverrides;
  console.log(
    `Overrides: ${Object.keys(raw.productMoves ?? {}).length} productMoves, ` +
      `${Object.keys(raw.categoryMoves ?? {}).length} categoryMoves`,
  );
  return raw;
}

function itemToRow(
  item: ImbaItem,
  overrides: CategoryOverrides | null,
): Prisma.ProductCreateManyInput | null {
  const sourceId = sourceIdFromSite(item.site);
  const externalId = String(item.sku || item.id || '').trim();
  const name = String(item.name || '').trim();
  if (!externalId || !name) return null;

  const categoryPath = effectiveImbaCategory(
    {
      sku: externalId,
      name,
      brand: item.brand,
      category: item.categoryUnified || item.category || item.categoryRaw,
      categoryRaw: item.categoryRaw,
    },
    overrides,
  );

  const image = String(item.image || '').trim() || FALLBACK_IMAGE;
  const colors: Prisma.InputJsonValue = item.color?.trim()
    ? [{ name: item.color.trim(), hex: null, code: null }]
    : [];

  return {
    slug: slugFrom(sourceId, externalId),
    name,
    category: simplifyCategory(categoryPath),
    subcategory: categoryPath,
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
  const jsonPath =
    process.argv[2] ||
    process.env.CATALOG_IMBA_JSON ||
    join(process.cwd(), '../../data/catalog-imba/catalog-unified.json');

  const overridesPath =
    process.argv[3] ||
    process.env.CATALOG_IMBA_OVERRIDES ||
    join(process.cwd(), '../../data/catalog-imba/category-overrides.json');

  if (!existsSync(jsonPath)) {
    console.error(`catalog-unified.json not found: ${jsonPath}`);
    process.exit(1);
  }

  const overrides = loadOverrides(overridesPath);

  console.log(`Reading ${jsonPath}…`);
  const catalog = JSON.parse(readFileSync(jsonPath, 'utf8')) as ImbaCatalog;
  const items = catalog.items ?? [];
  console.log(`IMBA catalog: ${items.length} items (generated ${catalog.generatedAt ?? '?'})`);

  console.log('Wiping RequestItem + Product…');
  await prisma.requestItem.deleteMany();
  await prisma.product.deleteMany();

  const batchSize = 500;
  let imported = 0;
  let skipped = 0;

  for (let i = 0; i < items.length; i += batchSize) {
    const chunk = items.slice(i, i + batchSize);
    const rows: Prisma.ProductCreateManyInput[] = [];
    for (const item of chunk) {
      const row = itemToRow(item, overrides);
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
    if ((i / batchSize) % 20 === 0 || i + batchSize >= items.length) {
      console.log(`  batch ${Math.floor(i / batchSize) + 1}: total ${imported}`);
    }
  }

  const count = await prisma.product.count();
  const sample = await prisma.product.findFirst({
    where: { subcategory: { contains: 'Декантер' } },
    select: { name: true, category: true, subcategory: true },
  });
  console.log(`Done: ${count} products in DB (${skipped} skipped)`);
  if (sample) console.log(`Sample decanter: ${sample.name} → ${sample.subcategory}`);
  await prisma.$disconnect();

  if (count < 51000) {
    console.error(`WARNING: expected 51000+ products, got ${count}`);
    process.exit(1);
  }
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

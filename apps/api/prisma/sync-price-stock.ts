/**
 * Безопасное обновление ТОЛЬКО price/stockAvailable у существующих товаров (#69).
 *
 * Не трогает category/subcategory/name/description и вообще ничего, кроме двух полей —
 * категории курируются вручную (category-overrides.json) и не должны затираться
 * автоматическим обновлением цен.
 *
 * Покрывает 4 из 7 источников (art24, midocean, oceangifts, oasis — ~85% каталога по
 * объёму). topcatalog не покрыт: его фид не отдаётся по URL, а вручную пересылается
 * через Telegram Desktop — не автоматизируется без участия человека. portobello и
 * xdconnects — не входят в этот пайплайн (см. README/CLAUDE.md).
 *
 * Usage:
 *   cd apps/api
 *   npx tsx prisma/sync-price-stock.ts [--dry-run]
 *
 * Требует переменные окружения (без хардкода, см. .env):
 *   ART24_USER, ART24_PASS, MO_USER, MO_PASS, OASIS_KEY
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} не задан в окружении`);
  return value;
}

async function fetchText(url: string, auth?: [string, string]): Promise<string> {
  const headers: Record<string, string> = auth
    ? { Authorization: `Basic ${Buffer.from(`${auth[0]}:${auth[1]}`).toString('base64')}` }
    : {};
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} при загрузке ${url}`);
  return res.text();
}

function extractTag(block: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = block.match(re);
  if (!m) return '';
  let val = m[1].trim();
  const cdata = val.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  if (cdata) val = cdata[1];
  return val.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseNum(v: string | number | undefined): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number.parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

interface PriceStock {
  price: number | null;
  stock: number;
}

async function collectArt24(): Promise<Map<string, PriceStock>> {
  const auth: [string, string] = [requireEnv('ART24_USER'), requireEnv('ART24_PASS')];
  const xml = await fetchText(
    'https://art24.by/capi_v100_xmls/products_description_xml_cdata002.xml',
    auth,
  );
  const blocks = xml.split(/<item>/i).slice(1).map((b) => b.split(/<\/item>/i)[0]);
  const map = new Map<string, PriceStock>();
  for (const b of blocks) {
    const sku = extractTag(b, 'sku');
    if (!sku) continue;
    const priceRu = parseNum(extractTag(b, 'price_ru'));
    const price = parseNum(extractTag(b, 'price'));
    const stock = parseNum(extractTag(b, 'stock')) ?? 0;
    map.set(sku, { price: priceRu ?? price, stock: Math.max(0, stock) });
  }
  return map;
}

async function collectMidocean(): Promise<Map<string, PriceStock>> {
  const auth: [string, string] = [requireEnv('MO_USER'), requireEnv('MO_PASS')];
  const xml = await fetchText('http://cdn.midoceanbrands.ru/export.xml', auth);
  const blocks = xml.split(/<product>/i).slice(1).map((b) => b.split(/<\/product>/i)[0]);
  const map = new Map<string, PriceStock>();
  for (const b of blocks) {
    const sku = extractTag(b, 'code');
    if (!sku) continue;
    const price = parseNum(extractTag(b, 'price'));
    const stockBlock = b.match(/<stocks>([\s\S]*?)<\/stocks>/i)?.[1] ?? '';
    const qtyBlocks = stockBlock.split(/<stock>/i).slice(1).map((s) => s.split(/<\/stock>/i)[0]);
    let total = 0;
    for (const qb of qtyBlocks) {
      const qty = Number((qb.match(/<quantity>([^<]*)<\/quantity>/i) ?? [])[1]?.trim() ?? '0');
      if (Number.isFinite(qty)) total += qty;
    }
    map.set(sku, { price, stock: Math.max(0, total) });
  }
  return map;
}

async function collectOceangifts(): Promise<Map<string, PriceStock>> {
  const auth: [string, string] = [requireEnv('MO_USER'), requireEnv('MO_PASS')];
  const text = await fetchText('http://www.oceangifts.ru/upload/catalog.json', auth);
  const data = JSON.parse(text) as {
    products?: Array<{
      colors?: Array<{ sizes?: Array<{ article?: string; price?: number; stores?: { total_remains?: number } }> }>;
    }>;
  };
  const map = new Map<string, PriceStock>();
  for (const prod of data.products ?? []) {
    for (const col of prod.colors ?? []) {
      for (const sz of col.sizes ?? []) {
        if (!sz.article) continue;
        map.set(sz.article, {
          price: parseNum(sz.price),
          stock: Math.max(0, sz.stores?.total_remains ?? 0),
        });
      }
    }
  }
  return map;
}

async function collectOasis(): Promise<Map<string, PriceStock>> {
  const key = requireEnv('OASIS_KEY');
  const text = await fetchText(
    `https://api.oasiscatalog.com/v4/products?key=${key}&currency=rub&format=json&no_vat=0`,
  );
  const data = JSON.parse(text) as { products?: unknown[]; items?: unknown[] } | unknown[];
  const list = (Array.isArray(data) ? data : data.products ?? data.items ?? []) as Array<{
    id?: number | string;
    article?: string;
    price?: number;
    discount_price?: number;
    total_stock?: number;
  }>;
  const map = new Map<string, PriceStock>();
  for (const p of list) {
    const sku = String(p.article ?? p.id ?? '');
    if (!sku) continue;
    // Обычная цена (не discount_price) — решение владельца каталога.
    map.set(sku, {
      price: parseNum(p.price ?? p.discount_price),
      stock: Math.max(0, p.total_stock ?? 0),
    });
  }
  return map;
}

async function syncSource(sourceId: string, feed: Map<string, PriceStock>) {
  let updated = 0;
  let unchanged = 0;
  let notFound = 0;

  const existing = await prisma.product.findMany({
    where: { sourceId },
    select: { id: true, externalId: true, price: true, stockAvailable: true },
  });
  const bySku = new Map(existing.map((p) => [p.externalId, p]));

  for (const [sku, fresh] of feed) {
    const current = bySku.get(sku);
    if (!current) {
      notFound++;
      continue;
    }
    const priceChanged = fresh.price != null && fresh.price !== current.price;
    const stockChanged = fresh.stock !== current.stockAvailable;
    if (!priceChanged && !stockChanged) {
      unchanged++;
      continue;
    }
    updated++;
    if (!DRY_RUN) {
      await prisma.product.update({
        where: { id: current.id },
        data: {
          ...(fresh.price != null ? { price: fresh.price } : {}),
          stockAvailable: fresh.stock,
        },
      });
    }
  }

  console.log(
    `[${sourceId}] фид: ${feed.size} | в БД: ${existing.length} | обновлено: ${updated} | без изменений: ${unchanged} | нет в фиде: ${existing.length - bySku.size + notFound}`,
  );
}

async function main() {
  console.log(`=== sync-price-stock ${DRY_RUN ? '(dry-run)' : ''} ${new Date().toISOString()} ===`);

  const sources: Array<[string, () => Promise<Map<string, PriceStock>>]> = [
    ['art24', collectArt24],
    ['midocean', collectMidocean],
    ['oceangifts', collectOceangifts],
    ['oasis', collectOasis],
  ];

  for (const [sourceId, collect] of sources) {
    try {
      const feed = await collect();
      await syncSource(sourceId, feed);
    } catch (error) {
      console.error(`[${sourceId}] FAILED:`, error instanceof Error ? error.message : error);
    }
  }

  console.log('=== done ===');
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

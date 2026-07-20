/**
 * Извлекает данные о нанесении из СЫРЫХ фидов → slim JSON.
 * Ключ (sourceId, externalId) совпадает с БД (как в import-imba-catalog.ts).
 * Запуск: cd apps/api && npx tsx --max-old-space-size=4096 prisma/parse-catalog-branding.ts
 */
import { readFileSync, writeFileSync } from 'fs';
import {
  parseArt24ItemBlock,
  parseMidoceanProductBlock,
  parseOasisProduct,
  type ParsedProductBranding,
} from '../src/catalog/branding-feed-parsers';

const DATA = process.env.CATALOG_FEEDS_DIR || 'D:/wr/mercai/tmp/catalog-imba-extract/Catalog IMBA/data';
const OUT = 'D:/wr/mercai/apps/api/prisma/catalog-branding.json';

const out: ParsedProductBranding[] = [];

{
  const xml = readFileSync(`${DATA}/midocean_export.xml`, 'utf8');
  let n = 0;
  for (const raw of xml.split(/<product>/i).slice(1)) {
    const parsed = parseMidoceanProductBlock(raw.split(/<\/product>/i)[0]);
    if (parsed) {
      out.push(parsed);
      n++;
    }
  }
  console.log(`Midocean: ${n} товаров с нанесением`);
}

{
  const xml = readFileSync(`${DATA}/products_description.xml`, 'utf8');
  let n = 0;
  for (const raw of xml.split(/<item>/i).slice(1)) {
    const parsed = parseArt24ItemBlock(raw.split(/<\/item>/i)[0]);
    if (parsed) {
      out.push(parsed);
      n++;
    }
  }
  console.log(`Art24: ${n} товаров с методами`);
}

{
  const parsed = JSON.parse(readFileSync(`${DATA}/oasis_products.json`, 'utf8')) as unknown;
  const list = (Array.isArray(parsed) ? parsed : []) as Array<Record<string, unknown>>;
  let n = 0;
  for (const p of list) {
    const r = parseOasisProduct(p);
    if (r) {
      out.push(r);
      n++;
    }
  }
  console.log(`Oasis: ${n} товаров с нанесением/материалом`);
}

writeFileSync(OUT, JSON.stringify(out));
const zones = out.reduce((s, p) => s + p.zones.length, 0);
console.log(`ИТОГО ${out.length} товаров, ${zones} строк зон → ${OUT}`);
console.log('sample:', JSON.stringify(out.slice(0, 1)));

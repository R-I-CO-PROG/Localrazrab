/**
 * Энричмент габаритов: парсит СЫРЫЕ фиды поставщиков → slim JSON с размерами,
 * ключ (sourceId, externalId) совпадает с БД (как в import-imba-catalog.ts).
 * Запуск локально: cd apps/api && npx tsx --max-old-space-size=4096 prisma/parse-catalog-dimensions.ts
 */
import { readFileSync, writeFileSync } from 'fs';
import { parseDimensionsString, parseWeightToGrams } from '../src/providers/llm/product-dimensions.util';

const DATA = 'D:/wr/mercai/tmp/catalog-imba-extract/Catalog IMBA/data';
const OUT = 'D:/wr/mercai/apps/api/prisma/catalog-dimensions.json';

interface DimRow {
  sourceId: string;
  externalId: string;
  widthCm: number | null;
  heightCm: number | null;
  depthCm: number | null;
  weightG: number | null;
}

const out: DimRow[] = [];

function extractTag(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? m[1].trim() : '';
}

function push(sourceId: string, rawId: string, dimStr: string, weightRaw: string, unit: 'kg' | 'g') {
  const externalId = String(rawId ?? '').trim();
  if (!externalId) return;
  const d = parseDimensionsString(dimStr || '');
  const w = weightRaw ? parseWeightToGrams(weightRaw, unit) : null;
  if (d.widthCm == null && d.heightCm == null && d.depthCm == null && w == null) return;
  out.push({
    sourceId,
    externalId,
    widthCm: d.widthCm ?? null,
    heightCm: d.heightCm ?? null,
    depthCm: d.depthCm ?? null,
    weightG: w,
  });
}

// --- Midocean XML: <dimensions>, <net_weight> (кг), sku=code ---
{
  const xml = readFileSync(`${DATA}/midocean_export.xml`, 'utf8');
  let n = 0;
  for (const raw of xml.split(/<product>/i).slice(1)) {
    const b = raw.split(/<\/product>/i)[0];
    const sku = extractTag(b, 'code') || extractTag(b, 'id');
    const before = out.length;
    push('midocean', sku, extractTag(b, 'dimensions'), extractTag(b, 'net_weight'), 'kg');
    if (out.length > before) n++;
  }
  console.log(`Midocean: ${n} с габаритами/весом`);
}

// --- Art24 XML: <attr_460_key name="Размер товара">, <attr_185_key name="Вес"> (кг) ---
{
  const xml = readFileSync(`${DATA}/products_description.xml`, 'utf8');
  let n = 0;
  for (const raw of xml.split(/<item>/i).slice(1)) {
    const b = raw.split(/<\/item>/i)[0];
    const sku = extractTag(b, 'sku') || extractTag(b, 'id');
    const dimM = b.match(/<attr_460_key[^>]*>([^<]*)<\/attr_460_key>/i);
    const wM = b.match(/<attr_185_key[^>]*>([^<]*)<\/attr_185_key>/i);
    const before = out.length;
    push('art24', sku, dimM?.[1]?.trim() ?? '', wM?.[1]?.trim() ?? '', 'kg');
    if (out.length > before) n++;
  }
  console.log(`Art24: ${n} с габаритами/весом`);
}

// --- Oasis JSON: attributes[] {name:"Размер товара (см)"}, {name:"Вес"} (граммы), sku=article||id ---
{
  const parsed = JSON.parse(readFileSync(`${DATA}/oasis_products.json`, 'utf8')) as unknown;
  const list: Array<Record<string, unknown>> = Array.isArray(parsed)
    ? (parsed as Array<Record<string, unknown>>)
    : (((parsed as { products?: unknown[]; items?: unknown[] }).products as Array<Record<string, unknown>>) ??
        ((parsed as { items?: unknown[] }).items as Array<Record<string, unknown>>) ??
        []);
  let n = 0;
  for (const p of list) {
    const externalId = String((p.article as string) ?? (p.id as string) ?? '');
    const attrs = (p.attributes as Array<{ name?: string; value?: string }>) ?? [];
    const dimA = attrs.find((a) => /размер\s+товара/i.test(a.name ?? ''));
    const wA = attrs.find((a) => /^\s*вес/i.test(a.name ?? ''));
    const before = out.length;
    push('oasis', externalId, dimA?.value ?? '', wA?.value ?? '', 'g');
    if (out.length > before) n++;
  }
  console.log(`Oasis: ${n} с габаритами/весом`);
}

writeFileSync(OUT, JSON.stringify(out));
console.log(`ИТОГО ${out.length} строк → ${OUT}`);
console.log('sample:', JSON.stringify(out.slice(0, 3)));

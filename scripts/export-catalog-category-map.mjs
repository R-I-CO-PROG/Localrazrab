#!/usr/bin/env node
/**
 * Карта категорий из Catalog IMBA (catalog-unified.json, ~51k SKU).
 * Выход: data/catalog-category-map.json | .md | .csv (+ копия на Desktop)
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const IMBA_JSON =
  process.argv[2] ||
  process.env.CATALOG_IMBA_JSON ||
  join(ROOT, 'data', 'catalog-imba', 'catalog-unified.json');
const OUT_DIR = join(ROOT, 'data');
const DESKTOP = join(homedir(), 'Desktop');

function simplifyCategory(path) {
  const p = String(path || '').toLowerCase();
  if (/ручк|карандаш|маркер|фломастер|письм|стержн/.test(p)) return 'Ручки';
  if (/кружк|стакан/.test(p) && !/термос|бутыл/.test(p)) return 'Кружки';
  if (/ежедневник|блокнот|записн/.test(p)) return 'Ежедневники и блокноты';
  if (/термос|бутылк|фляж/.test(p)) return 'Термосы и бутылки';
  if (/сумк|рюкзак|шоппер|портфел|портплед|косметичк|несессер/.test(p)) return 'Сумки и рюкзаки';
  if (/зонт/.test(p)) return 'Зонты';
  if (/футболк|поло|худи|свитшот|куртк|жилет|брюк|юбк|рубашк/.test(p)) return 'Одежда';
  if (/текстил|шарф|платок|бейсболк|кепк|панам|носк|перчат/.test(p)) return 'Текстиль';
  if (/электрон|power|флеш|usb|наушник|колонк|заряд|аккумулятор|смарт/.test(p)) return 'Электроника';
  if (/час/.test(p)) return 'Часы';
  if (/набор|welcome|подарочн/.test(p)) return 'Подарочные наборы';
  if (/офис|канцел|ластик|стикер|папк|бейдж/.test(p)) return 'Офис и канцелярия';
  if (/отдых|спорт|пикник|фитнес|игр|плед|антистресс/.test(p)) return 'Отдых и спорт';
  if (/наград|медал|сувенир|брелок|значк|плакет/.test(p)) return 'Сувениры и награды';
  const parts = String(path || '')
    .split(/[/|]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts[parts.length - 1] || parts[0] || 'Прочее';
}

const SITE_SOURCE = {
  'art24.by': 'art24',
  'midoceanbrands.ru': 'midocean',
  'oceangifts.ru': 'oceangifts',
  'topcatalog.ru': 'topcatalog',
  'oasiscatalog.com': 'oasis',
};

function sourceId(site) {
  return SITE_SOURCE[site] ?? site.replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 32);
}

function subcategoryFromItem(item) {
  const unified = String(item.categoryUnified || item.category || '').trim();
  if (unified) {
    const parts = unified.split('/').map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2) return parts.slice(1, 3).join(' / ');
    if (parts.length === 1) return parts[0];
  }
  const raw = String(item.categoryRaw || '').trim();
  if (raw) {
    const pipe = raw.split('|').map((s) => s.trim()).filter(Boolean);
    if (pipe[0]) return pipe[0];
  }
  return '(без подкатегории)';
}

function subsubFromItem(item) {
  const raw = String(item.categoryRaw || '').trim();
  if (raw.includes('|')) {
    const parts = raw.split('|').map((s) => s.trim()).filter(Boolean);
    if (parts[1]) return parts[1];
  }
  const unified = String(item.categoryUnified || item.category || '').trim();
  if (unified) {
    const parts = unified.split('/').map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 4) return parts.slice(3).join(' / ');
    if (parts.length === 3) return parts[2];
  }
  if (item.url) {
    try {
      const segs = new URL(item.url).pathname.split('/').filter(Boolean);
      const ci = segs.indexOf('catalog');
      if (ci >= 0 && segs[ci + 1]) {
        return decodeURIComponent(segs[ci + 1]).replace(/_/g, ' ');
      }
    } catch {
      /* skip */
    }
  }
  return '(без подподкатегории)';
}

if (!existsSync(IMBA_JSON)) {
  console.error(`catalog-unified.json not found: ${IMBA_JSON}`);
  process.exit(1);
}

const catalog = JSON.parse(readFileSync(IMBA_JSON, 'utf8'));
const items = catalog.items ?? [];
const tree = {};

function add(cat, sub, subsub, src) {
  if (!tree[cat]) tree[cat] = { _sku: 0, subs: {} };
  tree[cat]._sku++;
  const subKey = sub?.trim() || '(без подкатегории)';
  if (!tree[cat].subs[subKey]) tree[cat].subs[subKey] = { _sku: 0, subsubs: {} };
  tree[cat].subs[subKey]._sku++;
  const subsubKey = subsub?.trim() || '(без подподкатегории)';
  if (!tree[cat].subs[subKey].subsubs[subsubKey]) {
    tree[cat].subs[subKey].subsubs[subsubKey] = { _sku: 0, sources: new Set() };
  }
  tree[cat].subs[subKey].subsubs[subsubKey]._sku++;
  if (src) tree[cat].subs[subKey].subsubs[subsubKey].sources.add(src);
}

const sourceCounts = new Map();

for (const item of items) {
  const path = item.categoryUnified || item.category || item.categoryRaw || 'Прочее';
  const cat = simplifyCategory(path);
  const sub = subcategoryFromItem(item);
  const subsub = subsubFromItem(item);
  const src = sourceId(item.site);
  add(cat, sub, subsub, src);
  sourceCounts.set(src, (sourceCounts.get(src) ?? 0) + 1);
}

const outTree = Object.entries(tree)
  .sort(([aName, a], [bName, b]) => b._sku - a._sku || aName.localeCompare(bName, 'ru'))
  .map(([cat, v]) => ({
    category: cat,
    sku: v._sku,
    subcategories: Object.entries(v.subs)
      .sort(([, a], [, b]) => b._sku - a._sku)
      .map(([sub, sv]) => ({
        subcategory: sub,
        sku: sv._sku,
        subsubcategories: Object.entries(sv.subsubs)
          .sort(([, a], [, b]) => b._sku - a._sku)
          .slice(0, 50)
          .map(([ssk, ssv]) => ({
            subsubcategory: ssk,
            sku: ssv._sku,
            suppliers: [...ssv.sources].sort(),
          })),
      })),
  }));

const payload = {
  generatedAt: new Date().toISOString(),
  source: IMBA_JSON,
  catalogGeneratedAt: catalog.generatedAt ?? null,
  totalProducts: items.length,
  categories: outTree.length,
  sources: [...sourceCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count })),
  note:
    'Категория Mercai — simplifyCategory() из IMBA. Подкатегория — сегменты categoryUnified/categoryRaw. Подподкатегория — хвост пути или URL /catalog/{slug}/.',
  tree: outTree,
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, 'catalog-category-map.json'), JSON.stringify(payload, null, 2), 'utf8');

let md = `# Карта категорий каталога Mercai (Catalog IMBA)\n\n`;
md += `Сгенерировано: ${payload.generatedAt}\n\n`;
md += `Всего SKU: **${payload.totalProducts}** · Категорий Mercai: **${payload.categories}**\n\n`;
md += `## Поставщики\n\n`;
for (const s of payload.sources) {
  md += `- **${s.name}** — ${s.count} SKU\n`;
}
md += `\n${payload.note}\n\n`;

for (const c of outTree) {
  md += `## ${c.category} (${c.sku} SKU)\n\n`;
  for (const s of c.subcategories.slice(0, 30)) {
    md += `### ${s.subcategory} (${s.sku} SKU)\n\n`;
    for (const ss of s.subsubcategories.slice(0, 20)) {
      md += `- **${ss.subsubcategory}** — ${ss.sku} SKU`;
      if (ss.suppliers.length) md += ` · ${ss.suppliers.join(', ')}`;
      md += `\n`;
    }
    if (s.subsubcategories.length > 20) {
      md += `- _…ещё ${s.subsubcategories.length - 20} подподкатегорий_\n`;
    }
    md += `\n`;
  }
  if (c.subcategories.length > 30) {
    md += `_…ещё ${c.subcategories.length - 30} подкатегорий_\n\n`;
  }
}

writeFileSync(join(OUT_DIR, 'catalog-category-map.md'), md, 'utf8');

const csvLines = ['category,subcategory,subsubcategory,sku,suppliers'];
for (const c of outTree) {
  for (const s of c.subcategories) {
    for (const ss of s.subsubcategories) {
      const esc = (x) => `"${String(x).replace(/"/g, '""')}"`;
      csvLines.push(
        [c.category, s.subcategory, ss.subsubcategory, ss.sku, ss.suppliers.join('|')]
          .map(esc)
          .join(','),
      );
    }
  }
}
writeFileSync(join(OUT_DIR, 'catalog-category-map.csv'), csvLines.join('\n'), 'utf8');

try {
  writeFileSync(join(DESKTOP, 'catalog-category-map.md'), md, 'utf8');
  writeFileSync(join(DESKTOP, 'catalog-category-map.json'), JSON.stringify(payload, null, 2), 'utf8');
} catch {
  /* desktop optional */
}

console.log(`Wrote ${outTree.length} categories, ${items.length} SKU → data/catalog-category-map.{json,md,csv}`);

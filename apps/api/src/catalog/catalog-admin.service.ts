import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { exec } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import {
  buildTree,
  effectiveImbaCategory,
  emptyOverrides,
  IMBA_CATEGORY_SEP,
  IMBA_UNCATEGORIZED,
  normalizeBaseCategory,
  treeStats,
  type CategoryOverrides,
  type CategoryTreeNode,
  type ImbaCatalogItem,
} from './imba-category-overrides';

const execAsync = promisify(exec);

export interface ImbaCatalogUnifiedItem extends ImbaCatalogItem {
  site: string;
  color?: string;
  priceRub?: string | number;
  stock?: string | number;
  image?: string;
  url?: string;
}

export interface CompactProduct {
  sku: string;
  name: string;
  brand: string;
  color: string;
  site: string;
  priceRub: string;
  stock: string;
  image: string;
  url: string;
  base: string;
  effective: string;
}

@Injectable()
export class CatalogAdminService implements OnModuleInit {
  private readonly logger = new Logger(CatalogAdminService.name);
  private items: ImbaCatalogUnifiedItem[] = [];
  private bySku = new Map<string, ImbaCatalogUnifiedItem>();
  private overrides: CategoryOverrides = emptyOverrides();
  private pathIndex = new Map<string, ImbaCatalogUnifiedItem[]>();

  private readonly catalogPath =
    process.env.CATALOG_IMBA_JSON || join(process.cwd(), '../../data/catalog-imba/catalog-unified.json');

  private readonly overridesPath =
    process.env.CATALOG_IMBA_OVERRIDES ||
    join(process.cwd(), '../../data/catalog-imba/category-overrides.json');

  private readonly snapshotsDir = join(
    process.env.CATALOG_IMBA_SNAPSHOTS_DIR ||
      join(process.cwd(), '../../data/catalog-imba/override-snapshots'),
  );

  onModuleInit() {
    this.loadCatalog();
    this.loadOverrides();
    this.reindex();
    this.logger.log(
      `Catalog admin: ${this.items.length} items, overrides ${this.overridesPath}`,
    );
  }

  private loadCatalog() {
    if (!existsSync(this.catalogPath)) {
      this.logger.warn(`catalog-unified.json not found: ${this.catalogPath}`);
      return;
    }
    const catalog = JSON.parse(readFileSync(this.catalogPath, 'utf8')) as {
      items?: ImbaCatalogUnifiedItem[];
    };
    this.items = catalog.items ?? [];
    this.bySku = new Map();
    for (const it of this.items) {
      if (!this.bySku.has(it.sku)) this.bySku.set(it.sku, it);
    }
  }

  private loadOverrides() {
    if (existsSync(this.overridesPath)) {
      this.overrides = JSON.parse(readFileSync(this.overridesPath, 'utf8')) as CategoryOverrides;
    } else {
      this.overrides = emptyOverrides();
    }
    this.overrides.categoryMoves ??= {};
    this.overrides.productMoves ??= {};
    this.overrides.extraCategories ??= [];
  }

  private persist() {
    this.overrides.updatedAt = new Date().toISOString();
    const dir = join(this.overridesPath, '..');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(this.overridesPath, JSON.stringify(this.overrides, null, 2), 'utf8');
  }

  private reindex() {
    const idx = new Map<string, ImbaCatalogUnifiedItem[]>();
    for (const it of this.items) {
      const p = effectiveImbaCategory(it, this.overrides);
      let arr = idx.get(p);
      if (!arr) {
        arr = [];
        idx.set(p, arr);
      }
      arr.push(it);
    }
    this.pathIndex = idx;
  }

  private compact(it: ImbaCatalogUnifiedItem): CompactProduct {
    return {
      sku: it.sku,
      name: it.name,
      brand: it.brand || '',
      color: it.color || '',
      site: it.site,
      priceRub: String(it.priceRub ?? ''),
      stock: String(it.stock ?? ''),
      image: it.image || '',
      url: it.url || '',
      base: normalizeBaseCategory(it),
      effective: effectiveImbaCategory(it, this.overrides),
    };
  }

  getTree() {
    const { roots } = buildTree(this.items, this.overrides);
    return {
      roots,
      stats: treeStats(this.items, this.overrides),
      updatedAt: this.overrides.updatedAt,
    };
  }

  getPaths(): string[] {
    const set = new Set<string>();
    for (const p of this.pathIndex.keys()) {
      const parts = p.split(IMBA_CATEGORY_SEP);
      for (let i = 1; i <= parts.length; i++) {
        set.add(parts.slice(0, i).join(IMBA_CATEGORY_SEP));
      }
    }
    for (const p of this.overrides.extraCategories || []) set.add(p);
    return [...set].sort((a, b) => a.localeCompare(b, 'ru'));
  }

  getProducts(params: {
    path: string;
    page: number;
    pageSize: number;
    q?: string;
    site?: string;
  }) {
    const cat = params.path || '';
    const q = (params.q || '').trim().toLowerCase();
    const site = params.site || '';
    const page = Math.max(1, params.page);
    const pageSize = Math.min(200, Math.max(1, params.pageSize));

    const prefix = cat + IMBA_CATEGORY_SEP;
    let hasChildren = false;
    for (const p of this.pathIndex.keys()) {
      if (p.startsWith(prefix)) {
        hasChildren = true;
        break;
      }
    }
    if (!hasChildren) {
      for (const p of this.overrides.extraCategories || []) {
        if (p.startsWith(prefix)) {
          hasChildren = true;
          break;
        }
      }
    }

    let pool: ImbaCatalogUnifiedItem[] = [];
    if (hasChildren) {
      for (const [p, arr] of this.pathIndex) {
        if (p === cat || p.startsWith(prefix)) pool.push(...arr);
      }
    } else {
      pool = this.pathIndex.get(cat) || [];
    }

    const isLeaf = !hasChildren;
    let filtered = pool;
    if (site) filtered = filtered.filter((it) => it.site === site);
    if (q) {
      filtered = filtered.filter(
        (it) =>
          (it.name || '').toLowerCase().includes(q) ||
          (it.sku || '').toLowerCase().includes(q) ||
          (it.brand || '').toLowerCase().includes(q),
      );
    }

    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const items = filtered.slice(start, start + pageSize).map((it) => this.compact(it));

    return { total, page, pageSize, items, isLeaf, aggregated: !isLeaf };
  }

  search(q: string) {
    const query = q.trim().toLowerCase();
    if (!query) return { total: 0, items: [] as CompactProduct[] };
    const out: CompactProduct[] = [];
    for (const it of this.items) {
      if (
        (it.name || '').toLowerCase().includes(query) ||
        (it.sku || '').toLowerCase().includes(query) ||
        (it.brand || '').toLowerCase().includes(query)
      ) {
        out.push(this.compact(it));
        if (out.length >= 300) break;
      }
    }
    return { total: out.length, items: out };
  }

  moveProducts(skus: string[], target: string) {
    if (!target) throw new BadRequestException('Не указана целевая категория');
    let n = 0;
    for (const sku of skus) {
      if (!this.bySku.has(sku)) continue;
      this.overrides.productMoves![sku] = target;
      n++;
    }
    if (n > 100) this.takeSnapshot(`auto-before-move-${n}-products`);
    this.persist();
    this.reindex();
    return { ok: true as const, moved: n };
  }

  moveCategory(from: string, to: string) {
    if (!from || !to) throw new BadRequestException('Нужны исходный и целевой пути');
    if (from === to) return { ok: true as const };
    if (to === from || to.startsWith(from + IMBA_CATEGORY_SEP)) {
      throw new BadRequestException('Нельзя переместить категорию внутрь самой себя');
    }
    this.overrides.categoryMoves![from] = to;
    this.overrides.extraCategories = (this.overrides.extraCategories || []).map((p) =>
      p === from || p.startsWith(from + IMBA_CATEGORY_SEP) ? to + p.slice(from.length) : p,
    );
    this.persist();
    this.reindex();
    return { ok: true as const };
  }

  renameCategory(path: string, newName: string) {
    if (!path || !newName) throw new BadRequestException('Нужны путь и новое имя');
    if (newName.includes('/')) throw new BadRequestException('Имя не может содержать «/»');
    const parts = path.split(IMBA_CATEGORY_SEP);
    parts[parts.length - 1] = newName.trim();
    return this.moveCategory(path, parts.join(IMBA_CATEGORY_SEP));
  }

  createCategory(path: string) {
    if (!path) throw new BadRequestException('Пустой путь');
    const clean = path
      .split(IMBA_CATEGORY_SEP)
      .map((s) => s.trim())
      .filter(Boolean)
      .join(IMBA_CATEGORY_SEP);
    if (!this.overrides.extraCategories!.includes(clean)) {
      this.overrides.extraCategories!.push(clean);
    }
    this.persist();
    this.reindex();
    return { ok: true as const, path: clean };
  }

  deleteCategory(path: string, mode: 'merge-up' | 'to-uncategorized' = 'merge-up') {
    if (!path) throw new BadRequestException('Пустой путь');
    const parts = path.split(IMBA_CATEGORY_SEP);
    const parent = parts.length > 1 ? parts.slice(0, -1).join(IMBA_CATEGORY_SEP) : IMBA_UNCATEGORIZED;
    const target = mode === 'to-uncategorized' ? IMBA_UNCATEGORIZED : parent;
    this.moveCategory(path, target);
    this.overrides.extraCategories = (this.overrides.extraCategories || []).filter(
      (p) => !(p === path || p.startsWith(path + IMBA_CATEGORY_SEP)),
    );
    this.persist();
    this.reindex();
    return { ok: true as const };
  }

  reset(withSnapshot = true) {
    if (withSnapshot) this.takeSnapshot('before-reset');
    this.overrides = emptyOverrides();
    this.persist();
    this.reindex();
    return { ok: true as const };
  }

  takeSnapshot(reason = 'manual') {
    if (!existsSync(this.snapshotsDir)) mkdirSync(this.snapshotsDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeReason = reason.replace(/[^a-zA-Zа-яА-Я0-9_-]+/g, '_').slice(0, 80);
    const filename = `${stamp}_${safeReason}.json`;
    const filepath = join(this.snapshotsDir, filename);
    const data = {
      takenAt: new Date().toISOString(),
      reason,
      categoryMoves: this.overrides.categoryMoves,
      productMoves: this.overrides.productMoves,
      extraCategories: this.overrides.extraCategories,
    };
    writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf8');
    return { ok: true as const, file: filename, path: filepath };
  }

  listSnapshots() {
    if (!existsSync(this.snapshotsDir)) return [];
    return readdirSync(this.snapshotsDir)
      .filter((f) => f.endsWith('.json'))
      .sort()
      .reverse();
  }

  async exportToSite() {
    this.persist();
    const apiRoot = join(process.cwd(), '..');
    try {
      const { stdout, stderr } = await execAsync('pnpm catalog:import-imba', {
        cwd: apiRoot,
        env: {
          ...process.env,
          CATALOG_IMBA_JSON: this.catalogPath,
          CATALOG_IMBA_OVERRIDES: this.overridesPath,
        },
        timeout: 600_000,
      });
      if (stdout) this.logger.log(stdout.trim());
      if (stderr) this.logger.warn(stderr.trim());
      return {
        ok: true as const,
        productCount: this.items.length,
        note: 'catalog:import-imba completed',
      };
    } catch (err) {
      this.logger.warn(`catalog:import-imba failed: ${String(err)}`);
      return {
        ok: true as const,
        productCount: this.items.length,
        note: 'Overrides persisted; catalog import subprocess failed or skipped',
      };
    }
  }
}

/** Strip Map from tree nodes for JSON serialization */
export function serializeTreeRoots(roots: CategoryTreeNode[]): CategoryTreeNode[] {
  return roots;
}

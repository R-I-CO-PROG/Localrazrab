"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var CatalogAdminService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CatalogAdminService = void 0;
exports.serializeTreeRoots = serializeTreeRoots;
const common_1 = require("@nestjs/common");
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const node_util_1 = require("node:util");
const imba_category_overrides_1 = require("./imba-category-overrides");
const execAsync = (0, node_util_1.promisify)(node_child_process_1.exec);
let CatalogAdminService = CatalogAdminService_1 = class CatalogAdminService {
    constructor() {
        this.logger = new common_1.Logger(CatalogAdminService_1.name);
        this.items = [];
        this.bySku = new Map();
        this.overrides = (0, imba_category_overrides_1.emptyOverrides)();
        this.pathIndex = new Map();
        this.catalogPath = process.env.CATALOG_IMBA_JSON || (0, node_path_1.join)(process.cwd(), '../../data/catalog-imba/catalog-unified.json');
        this.overridesPath = process.env.CATALOG_IMBA_OVERRIDES ||
            (0, node_path_1.join)(process.cwd(), '../../data/catalog-imba/category-overrides.json');
        this.snapshotsDir = (0, node_path_1.join)(process.env.CATALOG_IMBA_SNAPSHOTS_DIR ||
            (0, node_path_1.join)(process.cwd(), '../../data/catalog-imba/override-snapshots'));
    }
    onModuleInit() {
        this.loadCatalog();
        this.loadOverrides();
        this.reindex();
        this.logger.log(`Catalog admin: ${this.items.length} items, overrides ${this.overridesPath}`);
    }
    loadCatalog() {
        if (!(0, node_fs_1.existsSync)(this.catalogPath)) {
            this.logger.warn(`catalog-unified.json not found: ${this.catalogPath}`);
            return;
        }
        const catalog = JSON.parse((0, node_fs_1.readFileSync)(this.catalogPath, 'utf8'));
        this.items = catalog.items ?? [];
        this.bySku = new Map();
        for (const it of this.items) {
            if (!this.bySku.has(it.sku))
                this.bySku.set(it.sku, it);
        }
    }
    loadOverrides() {
        if ((0, node_fs_1.existsSync)(this.overridesPath)) {
            this.overrides = JSON.parse((0, node_fs_1.readFileSync)(this.overridesPath, 'utf8'));
        }
        else {
            this.overrides = (0, imba_category_overrides_1.emptyOverrides)();
        }
        this.overrides.categoryMoves ??= {};
        this.overrides.productMoves ??= {};
        this.overrides.extraCategories ??= [];
    }
    persist() {
        this.overrides.updatedAt = new Date().toISOString();
        const dir = (0, node_path_1.join)(this.overridesPath, '..');
        if (!(0, node_fs_1.existsSync)(dir))
            (0, node_fs_1.mkdirSync)(dir, { recursive: true });
        (0, node_fs_1.writeFileSync)(this.overridesPath, JSON.stringify(this.overrides, null, 2), 'utf8');
    }
    reindex() {
        const idx = new Map();
        for (const it of this.items) {
            const p = (0, imba_category_overrides_1.effectiveImbaCategory)(it, this.overrides);
            let arr = idx.get(p);
            if (!arr) {
                arr = [];
                idx.set(p, arr);
            }
            arr.push(it);
        }
        this.pathIndex = idx;
    }
    compact(it) {
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
            base: (0, imba_category_overrides_1.normalizeBaseCategory)(it),
            effective: (0, imba_category_overrides_1.effectiveImbaCategory)(it, this.overrides),
        };
    }
    getTree() {
        const { roots } = (0, imba_category_overrides_1.buildTree)(this.items, this.overrides);
        return {
            roots,
            stats: (0, imba_category_overrides_1.treeStats)(this.items, this.overrides),
            updatedAt: this.overrides.updatedAt,
        };
    }
    getPaths() {
        const set = new Set();
        for (const p of this.pathIndex.keys()) {
            const parts = p.split(imba_category_overrides_1.IMBA_CATEGORY_SEP);
            for (let i = 1; i <= parts.length; i++) {
                set.add(parts.slice(0, i).join(imba_category_overrides_1.IMBA_CATEGORY_SEP));
            }
        }
        for (const p of this.overrides.extraCategories || [])
            set.add(p);
        return [...set].sort((a, b) => a.localeCompare(b, 'ru'));
    }
    getProducts(params) {
        const cat = params.path || '';
        const q = (params.q || '').trim().toLowerCase();
        const site = params.site || '';
        const page = Math.max(1, params.page);
        const pageSize = Math.min(200, Math.max(1, params.pageSize));
        const prefix = cat + imba_category_overrides_1.IMBA_CATEGORY_SEP;
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
        let pool = [];
        if (hasChildren) {
            for (const [p, arr] of this.pathIndex) {
                if (p === cat || p.startsWith(prefix))
                    pool.push(...arr);
            }
        }
        else {
            pool = this.pathIndex.get(cat) || [];
        }
        const isLeaf = !hasChildren;
        let filtered = pool;
        if (site)
            filtered = filtered.filter((it) => it.site === site);
        if (q) {
            filtered = filtered.filter((it) => (it.name || '').toLowerCase().includes(q) ||
                (it.sku || '').toLowerCase().includes(q) ||
                (it.brand || '').toLowerCase().includes(q));
        }
        const total = filtered.length;
        const start = (page - 1) * pageSize;
        const items = filtered.slice(start, start + pageSize).map((it) => this.compact(it));
        return { total, page, pageSize, items, isLeaf, aggregated: !isLeaf };
    }
    search(q) {
        const query = q.trim().toLowerCase();
        if (!query)
            return { total: 0, items: [] };
        const out = [];
        for (const it of this.items) {
            if ((it.name || '').toLowerCase().includes(query) ||
                (it.sku || '').toLowerCase().includes(query) ||
                (it.brand || '').toLowerCase().includes(query)) {
                out.push(this.compact(it));
                if (out.length >= 300)
                    break;
            }
        }
        return { total: out.length, items: out };
    }
    moveProducts(skus, target) {
        if (!target)
            throw new common_1.BadRequestException('Не указана целевая категория');
        let n = 0;
        for (const sku of skus) {
            if (!this.bySku.has(sku))
                continue;
            this.overrides.productMoves[sku] = target;
            n++;
        }
        if (n > 100)
            this.takeSnapshot(`auto-before-move-${n}-products`);
        this.persist();
        this.reindex();
        return { ok: true, moved: n };
    }
    moveCategory(from, to) {
        if (!from || !to)
            throw new common_1.BadRequestException('Нужны исходный и целевой пути');
        if (from === to)
            return { ok: true };
        if (to === from || to.startsWith(from + imba_category_overrides_1.IMBA_CATEGORY_SEP)) {
            throw new common_1.BadRequestException('Нельзя переместить категорию внутрь самой себя');
        }
        this.overrides.categoryMoves[from] = to;
        this.overrides.extraCategories = (this.overrides.extraCategories || []).map((p) => p === from || p.startsWith(from + imba_category_overrides_1.IMBA_CATEGORY_SEP) ? to + p.slice(from.length) : p);
        this.persist();
        this.reindex();
        return { ok: true };
    }
    renameCategory(path, newName) {
        if (!path || !newName)
            throw new common_1.BadRequestException('Нужны путь и новое имя');
        if (newName.includes('/'))
            throw new common_1.BadRequestException('Имя не может содержать «/»');
        const parts = path.split(imba_category_overrides_1.IMBA_CATEGORY_SEP);
        parts[parts.length - 1] = newName.trim();
        return this.moveCategory(path, parts.join(imba_category_overrides_1.IMBA_CATEGORY_SEP));
    }
    createCategory(path) {
        if (!path)
            throw new common_1.BadRequestException('Пустой путь');
        const clean = path
            .split(imba_category_overrides_1.IMBA_CATEGORY_SEP)
            .map((s) => s.trim())
            .filter(Boolean)
            .join(imba_category_overrides_1.IMBA_CATEGORY_SEP);
        if (!this.overrides.extraCategories.includes(clean)) {
            this.overrides.extraCategories.push(clean);
        }
        this.persist();
        this.reindex();
        return { ok: true, path: clean };
    }
    deleteCategory(path, mode = 'merge-up') {
        if (!path)
            throw new common_1.BadRequestException('Пустой путь');
        const parts = path.split(imba_category_overrides_1.IMBA_CATEGORY_SEP);
        const parent = parts.length > 1 ? parts.slice(0, -1).join(imba_category_overrides_1.IMBA_CATEGORY_SEP) : imba_category_overrides_1.IMBA_UNCATEGORIZED;
        const target = mode === 'to-uncategorized' ? imba_category_overrides_1.IMBA_UNCATEGORIZED : parent;
        this.moveCategory(path, target);
        this.overrides.extraCategories = (this.overrides.extraCategories || []).filter((p) => !(p === path || p.startsWith(path + imba_category_overrides_1.IMBA_CATEGORY_SEP)));
        this.persist();
        this.reindex();
        return { ok: true };
    }
    reset(withSnapshot = true) {
        if (withSnapshot)
            this.takeSnapshot('before-reset');
        this.overrides = (0, imba_category_overrides_1.emptyOverrides)();
        this.persist();
        this.reindex();
        return { ok: true };
    }
    takeSnapshot(reason = 'manual') {
        if (!(0, node_fs_1.existsSync)(this.snapshotsDir))
            (0, node_fs_1.mkdirSync)(this.snapshotsDir, { recursive: true });
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const safeReason = reason.replace(/[^a-zA-Zа-яА-Я0-9_-]+/g, '_').slice(0, 80);
        const filename = `${stamp}_${safeReason}.json`;
        const filepath = (0, node_path_1.join)(this.snapshotsDir, filename);
        const data = {
            takenAt: new Date().toISOString(),
            reason,
            categoryMoves: this.overrides.categoryMoves,
            productMoves: this.overrides.productMoves,
            extraCategories: this.overrides.extraCategories,
        };
        (0, node_fs_1.writeFileSync)(filepath, JSON.stringify(data, null, 2), 'utf8');
        return { ok: true, file: filename, path: filepath };
    }
    listSnapshots() {
        if (!(0, node_fs_1.existsSync)(this.snapshotsDir))
            return [];
        return (0, node_fs_1.readdirSync)(this.snapshotsDir)
            .filter((f) => f.endsWith('.json'))
            .sort()
            .reverse();
    }
    async exportToSite() {
        this.persist();
        const apiRoot = (0, node_path_1.join)(process.cwd(), '..');
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
            if (stdout)
                this.logger.log(stdout.trim());
            if (stderr)
                this.logger.warn(stderr.trim());
            return {
                ok: true,
                productCount: this.items.length,
                note: 'catalog:import-imba completed',
            };
        }
        catch (err) {
            this.logger.warn(`catalog:import-imba failed: ${String(err)}`);
            return {
                ok: true,
                productCount: this.items.length,
                note: 'Overrides persisted; catalog import subprocess failed or skipped',
            };
        }
    }
};
exports.CatalogAdminService = CatalogAdminService;
exports.CatalogAdminService = CatalogAdminService = CatalogAdminService_1 = __decorate([
    (0, common_1.Injectable)()
], CatalogAdminService);
function serializeTreeRoots(roots) {
    return roots;
}
//# sourceMappingURL=catalog-admin.service.js.map
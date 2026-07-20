import { createHash } from 'crypto';
import type { CatalogFilterInput } from './catalog-filter.util';
import type { CatalogPipelineResult } from './catalog-index.util';
import type { CatalogProduct } from './catalog.util';

interface CacheEntry {
  at: number;
  result: CatalogPipelineResult;
}

interface RawEntry {
  at: number;
  candidates: CatalogProduct[];
  totalInDb: number;
}

const store = new Map<string, CacheEntry>();
const rawStore = new Map<string, RawEntry>();

/**
 * Ключ кеша сырых кандидатов.
 * Зависит от DB-фильтров + группы категорий (тема брифа) + timeBucket (ротация пула каждые 5 мин).
 * Одинаковые брифы с одной темой и одним бюджетом делят пул — но пул обновляется раз в 5 мин,
 * а per-request shuffle делает выборку уникальной для каждого пользователя.
 */
export function rawCandidatesCacheKey(
  input: CatalogFilterInput,
  categoryGroup: string,
  timeBucket?: number,
): string {
  const bucket = timeBucket ?? Math.floor(Date.now() / (5 * 60_000));
  const payload = {
    q: input.quantity ?? null,
    bmin: input.budgetMin ?? null,
    bmax: input.budgetMax ?? null,
    bps: input.budgetPerSet ?? null,
    bl: input.blacklistedProductIds ?? [],
    bs: input.blacklistedSupplierIds ?? [],
    cg: categoryGroup,
    tb: bucket,
    // Seed воспроизводимого ретривала входит в ключ: seeded-запрос не должен получить пул,
    // загруженный со СЛУЧАЙНЫМ offset более раннего unseeded-запроса (детерминизм ломался бы).
    seed: input.retrievalSeed ?? null,
  };
  return 'raw:' + createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function getCachedRawCandidates(
  key: string,
  ttlMs: number,
): { candidates: CatalogProduct[]; totalInDb: number } | null {
  const entry = rawStore.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > ttlMs) { rawStore.delete(key); return null; }
  return { candidates: entry.candidates, totalInDb: entry.totalInDb };
}

export function setCachedRawCandidates(
  key: string,
  candidates: CatalogProduct[],
  totalInDb: number,
): void {
  rawStore.set(key, { at: Date.now(), candidates, totalInDb });
  if (rawStore.size > 24) {
    const oldest = [...rawStore.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) rawStore.delete(oldest[0]);
  }
}

export function catalogPipelineCacheKey(
  input: CatalogFilterInput,
  stratifiedMax: number,
): string {
  const payload = {
    p: input.userPrompt.slice(0, 600),
    q: input.quantity ?? null,
    bmin: input.budgetMin ?? null,
    bmax: input.budgetMax ?? null,
    bps: input.budgetPerSet ?? null,
    colors: input.colors ?? [],
    allowed: input.allowedItems ?? [],
    forbidden: input.forbiddenItems ?? [],
    bl: input.blacklistedProductIds ?? [],
    bs: input.blacklistedSupplierIds ?? [],
    sic: input.setItemCount ?? null,
    useLimit: input.useProductCountLimit ?? true,
    minP: input.minProductsPerSet ?? null,
    maxP: input.maxProductsPerSet ?? null,
    cat: input.projectCategory ?? null,
    stratifiedMax,
    // Seed в ключе: результат полного пайплайна зависит от seeded shuffle/offset, поэтому
    // seeded и unseeded (и разные seed) запросы не должны делить один кэш-результат.
    seed: input.retrievalSeed ?? null,
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function getCachedCatalogPipeline(
  key: string,
  ttlMs: number,
): CatalogPipelineResult | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > ttlMs) {
    store.delete(key);
    return null;
  }
  return entry.result;
}

export function setCachedCatalogPipeline(key: string, result: CatalogPipelineResult): void {
  store.set(key, { at: Date.now(), result });
  if (store.size > 48) {
    const oldest = [...store.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) store.delete(oldest[0]);
  }
}

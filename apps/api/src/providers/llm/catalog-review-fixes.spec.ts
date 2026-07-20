import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { filterCatalogForRequest } from './catalog-filter.util';
import { buildConceptPool } from './catalog-shortlist.util';
import { rawCandidatesCacheKey, catalogPipelineCacheKey } from './catalog-pipeline-cache.util';
import { SelectionLedger } from './catalog-selection-ledger';
import { clearProductTypeCache } from '../../concept/product-taxonomy';
import { detectConceptProductType } from './concept-diversity.util';
import type { CatalogProduct } from './catalog.util';
import type { CatalogFilterInput } from './catalog-filter.util';
import type { ShortlistContext } from './catalog-neural-selector.types';

function prod(
  id: string,
  name: string,
  category: string,
  opts: { price?: number; stock?: number; sourceId?: string } = {},
): CatalogProduct {
  const { price = 1200, stock = 500, sourceId = 'oasis' } = opts;
  return {
    id, name, category, subcategory: null, description: name, price,
    stockAvailable: stock, colors: [], silhouetteImageUrl: '',
    catalogImageUrl: 'https://cdn.example.com/i.jpg', imageUrl: 'https://cdn.example.com/i.jpg',
    sourceId,
  } as CatalogProduct;
}

const base = (over: Partial<CatalogFilterInput> = {}): CatalogFilterInput => ({
  userPrompt: '', quantity: null, budgetMin: null, budgetMax: null,
  colors: [], allowedItems: [], forbiddenItems: [], ...over,
});

// #1 — резерв обязательных типов уважает blacklist ПОСТАВЩИКОВ
describe('reserve channel respects supplier blacklist (#1)', () => {
  beforeEach(() => clearProductTypeCache());
  it('обязательный проектор от заблокированного поставщика НЕ доливается резервом', () => {
    const catalog = [
      prod('proj-x', 'Проектор Rombica Ray Mini', 'Электроника', { price: 3255, stock: 445, sourceId: 'SUPPLIER_X' }),
      ...Array.from({ length: 30 }, (_, i) => prod(`mug${i}`, `Кружка ${i}`, 'Кружки', { sourceId: 'oasis' })),
    ];
    const out = filterCatalogForRequest(catalog, base({
      userPrompt: 'нужен набор с проектором',
      blacklistedSupplierIds: ['SUPPLIER_X'],
    }));
    assert.ok(
      !out.some((p) => p.id === 'proj-x'),
      'проектор заблокированного поставщика утёк через резерв',
    );
  });
  it('обязательный проектор НЕ заблокированного поставщика доливается как раньше', () => {
    const catalog = [
      prod('proj-ok', 'Проектор Rombica Ray Mini', 'Электроника', { price: 3255, stock: 445, sourceId: 'oasis' }),
      ...Array.from({ length: 30 }, (_, i) => prod(`mug${i}`, `Кружка ${i}`, 'Кружки')),
    ];
    const out = filterCatalogForRequest(catalog, base({ userPrompt: 'нужен набор с проектором' }));
    assert.ok(out.some((p) => p.id === 'proj-ok'), 'валидный проектор должен остаться');
  });
});

// #5 — обход allowed НЕ пропускает hard-reject мусор
describe('explicit-allow bypass keeps hard-reject junk out (#5)', () => {
  beforeEach(() => clearProductTypeCache());
  it('штопор (hard-reject −170) в разрешённой «Посуда» всё равно вырезается, тарелки остаются', () => {
    // Нейтральный бриф (strictMin −40): тарелки (rel 0 > −40) проходят strict штатно и
    // держат пул ≥8, поэтому strict-гейт реально отрабатывает (не уходит в fallback).
    // Штопор (rel −170) — hard-reject: разрешённая категория НЕ должна его протаскивать.
    const corkscrews = Array.from({ length: 6 }, (_, i) =>
      prod(`cork${i}`, `Штопор винтовой ${i}`, 'Посуда'),
    );
    const goodDishes = Array.from({ length: 12 }, (_, i) =>
      prod(`plate${i}`, `Тарелка керамическая ${i}`, 'Посуда'),
    );
    const out = filterCatalogForRequest([...corkscrews, ...goodDishes], base({
      userPrompt: 'подарки коллегам на праздник, можно посуду',
      budgetMax: 5000,
      allowedItems: ['Посуда'],
    }));
    assert.ok(out.some((p) => /тарелк/i.test(p.name)), 'разрешённые тарелки должны остаться');
    assert.ok(
      !out.some((p) => /штопор/i.test(p.name)),
      `hard-reject штопор просочился: ${out.filter((p) => /штопор/i.test(p.name)).length}`,
    );
  });
});

// #3 — тираж-бонус не протаскивает off-theme товар в нишевый пул
describe('tirage no longer pollutes niche diversification pool (#3)', () => {
  beforeEach(() => clearProductTypeCache());
  it('эко-бриф + тираж: off-theme лампа с большим стоком НЕ попадает в пул', () => {
    const bags = Array.from({ length: 20 }, (_, i) =>
      prod(`bag${i}`, `Эко-сумка шоппер хлопок ${i}`, 'Сумки и рюкзаки', { stock: 900 }),
    );
    const lamp = prod('lamp', 'Настольная лампа офисная', 'Электроника', { stock: 900 });
    const ctx: ShortlistContext = {
      brief: 'эко-конференция, экологичные подарки',
      brandColors: [],
      budgetPerSet: 3000,
      tirage: 100,
    };
    const ledger = new SelectionLedger(new Set(), new Set(), new Set(), ctx.brief);
    const pool = buildConceptPool([...bags, lamp], [...bags, lamp], ctx, ledger, { size: 48 });
    assert.ok(
      !pool.some((p) => p.id === 'lamp'),
      'off-theme лампа просочилась в нишевый пул только из-за стока под тираж',
    );
  });
});

// #4 — тираж не перебивает сильную релевантность
describe('tirage does not outrank strong relevance (#4)', () => {
  beforeEach(() => clearProductTypeCache());
  it('высокорелевантный near-miss по стоку ранжируется выше маргинального full-stock', () => {
    // Термокружка (релевантна «онбордингу менеджеров»), остаток на 1 меньше тиража,
    // против случайного full-stock товара со слабой релевантностью.
    const relevantNearMiss = prod('mug-rel', 'Термокружка стальная с логотипом', 'Термосы и бутылки', { stock: 154 });
    const marginalFull = prod('rnd-full', ' Силиконовый браслет', 'Сувениры и награды', { stock: 155 });
    const filler = Array.from({ length: 8 }, (_, i) => prod(`nb${i}`, `Блокнот ${i}`, 'Ежедневники и блокноты'));
    const ctx: ShortlistContext = {
      brief: 'подарки для онбординга менеджеров по продажам, термокружка',
      brandColors: [],
      budgetPerSet: 3000,
      tirage: 155,
    };
    const ledger = new SelectionLedger(new Set(), new Set(), new Set(), ctx.brief);
    const pool = buildConceptPool([marginalFull, relevantNearMiss, ...filler], [marginalFull, relevantNearMiss, ...filler], ctx, ledger, { size: 48 });
    const relIdx = pool.findIndex((p) => p.id === 'mug-rel');
    const margIdx = pool.findIndex((p) => p.id === 'rnd-full');
    assert.ok(relIdx >= 0, 'релевантная термокружка должна быть в пуле');
    assert.ok(
      margIdx < 0 || relIdx < margIdx,
      `релевантный near-miss (${relIdx}) должен идти раньше маргинального full-stock (${margIdx})`,
    );
  });
});

// #6/#7 — seed входит в оба кэш-ключа
describe('retrievalSeed is part of cache keys (#6/#7)', () => {
  it('rawCandidatesCacheKey различает seed', () => {
    const a = rawCandidatesCacheKey(base({ retrievalSeed: 111 }), 'tech', 42);
    const b = rawCandidatesCacheKey(base({ retrievalSeed: 222 }), 'tech', 42);
    const none = rawCandidatesCacheKey(base(), 'tech', 42);
    assert.notEqual(a, b);
    assert.notEqual(a, none);
  });
  it('catalogPipelineCacheKey различает seed', () => {
    const a = catalogPipelineCacheKey(base({ userPrompt: 'x', retrievalSeed: 111 }), 280);
    const b = catalogPipelineCacheKey(base({ userPrompt: 'x', retrievalSeed: 222 }), 280);
    const none = catalogPipelineCacheKey(base({ userPrompt: 'x' }), 280);
    assert.notEqual(a, b);
    assert.notEqual(a, none);
  });
});

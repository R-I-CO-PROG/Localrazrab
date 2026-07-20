import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildSlotShortlists, buildConceptPool, relaxShortlist, scoreRow } from './catalog-shortlist.util';
import { buildBriefRelevanceContext } from './catalog-brief-relevance.util';
import { COHERENCE_BONUS } from './catalog-context-scoring.util';
import { SelectionLedger } from './catalog-selection-ledger';
import { clearProductTypeCache } from '../../concept/product-taxonomy';
import type { CatalogProduct } from './catalog.util';
import type { ProductSlot } from './catalog-slot-picker.util';
import type { ShortlistContext } from './catalog-neural-selector.types';

function prod(
  id: string,
  name: string,
  category: string,
  price: number,
): CatalogProduct {
  return {
    id,
    name,
    category,
    subcategory: null,
    description: name,
    price,
    stockAvailable: 50,
    colors: [],
    silhouetteImageUrl: '',
    catalogImageUrl: 'https://cdn.example.com/i.jpg',
    imageUrl: 'https://cdn.example.com/i.jpg',
  };
}

const mug = (id: string, price: number) =>
  prod(id, `Термокружка стальная ${id}`, 'Термосы и бутылки', price);
const towel = (id: string) => prod(id, `Полотенце ${id}`, 'Банные принадлежности', 300);

describe('buildConceptPool: реализуемость под тираж', () => {
  beforeEach(() => clearProductTypeCache());

  it('при заданном тираже товар с остатком ≥ тиража идёт выше того же типа с малым остатком', () => {
    const inStock = { ...mug('m-ok', 500), stockAvailable: 900 };
    const shortStock = { ...mug('m-short', 500), stockAvailable: 10 };
    const filler = Array.from({ length: 8 }, (_, i) =>
      prod(`nb${i}`, `Блокнот А5 ${i}`, 'Ежедневники и блокноты', 400),
    );
    const catalog = [shortStock, inStock, ...filler];
    const ctx: ShortlistContext = {
      brief: 'подарки для команды, термокружка',
      brandColors: [],
      budgetPerSet: 3000,
      tirage: 155,
    };
    const ledger = new SelectionLedger(new Set(), new Set(), new Set(), ctx.brief);
    const pool = buildConceptPool(catalog, catalog, ctx, ledger, { size: 48 });
    const okIdx = pool.findIndex((p) => p.id === 'm-ok');
    const shortIdx = pool.findIndex((p) => p.id === 'm-short');
    assert.ok(okIdx >= 0, 'покрывающий тираж товар должен быть в пуле');
    assert.ok(
      shortIdx < 0 || okIdx < shortIdx,
      `покрывающий тираж (${okIdx}) должен идти раньше короткого (${shortIdx})`,
    );
  });
});

describe('buildSlotShortlists', () => {
  beforeEach(() => clearProductTypeCache());

  it('returns valid, budget-fitting, ranked, capped candidates for a slot', () => {
    const catalog: CatalogProduct[] = [
      towel('t1'),
      ...Array.from({ length: 30 }, (_, i) => mug(`m${i}`, 450 + i)),
    ];
    const slots: ProductSlot[] = [
      { type: 'thermos', priority: 'must', notes: 'термокружка' },
    ];
    const ledger = new SelectionLedger(new Set(), new Set(), new Set(), 'кофейный набор');
    const out = buildSlotShortlists(
      slots,
      catalog,
      { brief: 'кофейный набор', brandColors: [], budgetPerSet: 1500, perSlotSize: 10 },
      ledger,
    );
    assert.equal(out.length, 1);
    assert.ok(out[0].candidates.length > 0);
    assert.ok(out[0].candidates.length <= 10);
    // Самый релевантный кандидат под «кофейный набор» — кружка, не полотенце.
    assert.match(out[0].candidates[0].name.toLowerCase(), /кружка|термо/);
  });

  it('drops products above the per-set budget', () => {
    const catalog = [mug('cheap', 400), mug('rich', 9000)];
    const ledger = new SelectionLedger(new Set(), new Set(), new Set(), 'набор');
    const out = buildSlotShortlists(
      [{ type: 'thermos', priority: 'must' }],
      catalog,
      { brief: 'набор', brandColors: [], budgetPerSet: 1500 },
      ledger,
    );
    assert.ok(out[0].candidates.some((c) => c.id === 'cheap'));
    assert.ok(!out[0].candidates.some((c) => c.id === 'rich'));
  });

  it('excludes ledger-blocked products', () => {
    const catalog = [mug('1', 400), mug('2', 600)];
    const ledger = new SelectionLedger(new Set(['1']), new Set(), new Set(), 'набор');
    const out = buildSlotShortlists(
      [{ type: 'thermos', priority: 'must' }],
      catalog,
      { brief: 'набор', brandColors: [], budgetPerSet: 1500 },
      ledger,
    );
    assert.ok(!out[0].candidates.some((c) => c.id === '1'));
  });

  it('relaxShortlist ignores type and excludes given ids', () => {
    const catalog = [mug('1', 400), mug('2', 600), mug('3', 500)];
    const ledger = new SelectionLedger(new Set(), new Set(), new Set(), 'набор');
    const out = relaxShortlist(
      { type: 'thermos', priority: 'nice' },
      catalog,
      { brief: 'набор', brandColors: [], budgetPerSet: 1500 },
      ledger,
      new Set(['1']),
    );
    assert.ok(!out.some((c) => c.id === '1'));
    assert.ok(out.length >= 2);
  });
});

describe('buildConceptPool — гарантия обязательного типа (mandatoryTypes)', () => {
  beforeEach(() => clearProductTypeCache());

  it('пиннит повербанк в пул, даже если релевантность его не подняла', () => {
    // 20 нерелевантных кружек + один валидный повербанк.
    const noise = Array.from({ length: 20 }, (_, i) => prod(`n${i}`, `Кружка ${i}`, 'Кружки', 300 + i));
    const pb = prod('PB', 'Внешний аккумулятор 10000 мАч', 'Электроника', 1500);
    const catalog = [...noise, pb];
    const ledger = new SelectionLedger(new Set(), new Set(), new Set(), 'повербанки');
    const ctx: ShortlistContext = {
      brief: 'жёлтые повербанки 10000',
      brandColors: [],
      budgetPerSet: 2000,
      mandatoryTypes: ['powerbank'],
    };
    const pool = buildConceptPool(catalog, catalog, ctx, ledger, { size: 12, perCategoryCap: 3 });
    assert.ok(pool.some((p) => p.id === 'PB'), 'powerbank must be pinned into pool');
  });
});

describe('G4: semanticFit клампится к ±0.15 перед весом ×120 (пере-скан)', () => {
  it('аномальный semanticFit (выброс/дрейф модели) не перебивает variety-cap и другие сигналы', () => {
    const relCtx = buildBriefRelevanceContext('кружка для команды', []);
    const ctx: ShortlistContext = { brief: 'кружка для команды', brandColors: [], budgetPerSet: 2000 };

    const normal = mug('normal', 800);
    const anomalous = mug('anomalous', 800);
    (anomalous as unknown as { semanticFit: number }).semanticFit = 5.0; // выброс за пределами cos-разности

    const withinFit = mug('within-fit', 800);
    (withinFit as unknown as { semanticFit: number }).semanticFit = 0.15; // на границе документированного диапазона

    const scoreNormal = scoreRow(normal, relCtx, ctx);
    const scoreAnomalous = scoreRow(anomalous, relCtx, ctx);
    const scoreWithinFit = scoreRow(withinFit, relCtx, ctx);

    // Клампнутый выброс (0.15) и легитимное значение НА границе (0.15) дают ОДИНАКОВЫЙ вклад —
    // подтверждает, что клампинг реально применяется, а не просто умножает как есть.
    assert.equal(scoreAnomalous, scoreWithinFit, 'аномальный fit должен клампиться к тому же значению, что и легитимный 0.15');
    // Разница между клампнутым и обычным (без fit) — ровно ±0.15×120=18, а НЕ 5.0×120=600.
    const diff = scoreAnomalous - scoreNormal;
    assert.ok(diff <= 18.01, `клампнутая разница должна быть ≤18 (±0.15×120), получено ${diff}`);
  });
});

describe('G7: тема концепции считается ОДИН раз (theme+coherence не двойной счёт)', () => {
  it('вклад темы в scoreRow = COHERENCE_BONUS, а не COHERENCE_BONUS + THEME_BONUS', () => {
    // Единственный conceptTitle-зависимый терм scoreRow теперь — scoreConceptCoherence.
    // Бриф (relCtx) держим постоянным; варьируем только тему концепции.
    const brief = 'подарочный набор коллегам';
    const relCtx = buildBriefRelevanceContext(brief, []);
    const pled = prod('pled', 'Плед флисовый', 'Пледы', 900);
    const ctxTheme: ShortlistContext = {
      brief, brandColors: [], budgetPerSet: 3000,
      conceptTitle: 'Уютный вечер', conceptComposition: 'дома с чаем',
    };
    const ctxNoTheme: ShortlistContext = { brief, brandColors: [], budgetPerSet: 3000 };
    const delta = scoreRow(pled, relCtx, ctxTheme) - scoreRow(pled, relCtx, ctxNoTheme);
    // Ровно COHERENCE_BONUS (24). До фикса было бы 24+18=42 (тема считалась дважды). Допуск на
    // float-шум прочих термов скора.
    assert.ok(Math.abs(delta - COHERENCE_BONUS) < 0.01, `вклад темы должен быть ≈COHERENCE_BONUS (${COHERENCE_BONUS}), получено ${delta}`);
  });
});

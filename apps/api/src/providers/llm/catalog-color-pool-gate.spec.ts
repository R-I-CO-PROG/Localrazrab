import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildConceptPool, scoreRow } from './catalog-shortlist.util';
import { assembleFromPool } from './catalog-set-assembler.util';
import { SelectionLedger } from './catalog-selection-ledger';
import { buildBriefRelevanceContext } from './catalog-brief-relevance.util';
import { clearProductTypeCache } from '../../concept/product-taxonomy';
import type { CatalogProduct } from './catalog.util';
import type { ShortlistContext } from './catalog-neural-selector.types';

function prod(id: string, name: string, category: string, price: number, colors: string[] = []): CatalogProduct {
  return {
    id, name, category, subcategory: null, description: name, price,
    stockAvailable: 500,
    colors: colors.map((name) => ({ name, hex: null, code: null })) as unknown as CatalogProduct['colors'],
    silhouetteImageUrl: '',
    catalogImageUrl: 'https://cdn.example.com/i.jpg', imageUrl: 'https://cdn.example.com/i.jpg',
  } as CatalogProduct;
}
const ledger = () => new SelectionLedger(new Set(), new Set(), new Set(), 'набор');

describe('скан#4: запрещённый брифом цвет — ЖЁСТКИЙ гейт пула, а не только скор', () => {
  beforeEach(() => clearProductTypeCache());

  const brief = 'подарочный набор коллегам, без красного цвета';

  it('красный SKU не попадает в пул кандидатов, который видит LLM-байер', () => {
    const catalog = [
      prod('red', 'Кружка керамическая', 'Кружки', 700, ['красный']),
      prod('blue', 'Кружка керамическая синяя', 'Кружки', 700, ['синий']),
      prod('nb', 'Блокнот А5', 'Ежедневники и блокноты', 500, ['серый']),
      prod('pen', 'Ручка металлическая', 'Ручки', 400, ['чёрный']),
    ];
    const ctx: ShortlistContext = { brief, brandColors: [], budgetPerSet: 3000 };
    const pool = buildConceptPool(catalog, catalog, ctx, ledger(), { size: 20, perCategoryCap: 3 });
    assert.ok(!pool.some((p) => p.id === 'red'), `красный в пуле байера: ${pool.map((p) => p.id)}`);
    assert.ok(pool.some((p) => p.id === 'blue'), 'синий должен остаться');
  });

  it('сборщик не принимает красный SKU, даже если тот просочился в пул (глубинная защита)', () => {
    const red = prod('red', 'Кружка керамическая', 'Кружки', 700, ['красный']);
    const pool = [
      red,
      prod('nb', 'Блокнот А5', 'Ежедневники и блокноты', 500, ['серый']),
      prod('pen', 'Ручка металлическая', 'Ручки', 400, ['чёрный']),
    ];
    const out = assembleFromPool({
      pool,
      productIds: ['red', 'nb', 'pen'], // байер явно выбрал красный
      ledger: ledger(), minItems: 2, maxItems: 3, budgetPerSet: 3000,
      brief, brandColors: [], fullCatalog: pool,
    });
    assert.ok(!out.some((p) => p.id === 'red'), `красный принят сборщиком: ${out.map((p) => p.id)}`);
  });

  it('без цветового запрета в брифе красный проходит (гейт не сверх-режет)', () => {
    const catalog = [
      prod('red', 'Кружка керамическая', 'Кружки', 700, ['красный']),
      prod('nb', 'Блокнот А5', 'Ежедневники и блокноты', 500, ['серый']),
    ];
    const ctx: ShortlistContext = { brief: 'подарочный набор коллегам', brandColors: [], budgetPerSet: 3000 };
    const pool = buildConceptPool(catalog, catalog, ctx, ledger(), { size: 20, perCategoryCap: 3 });
    assert.ok(pool.some((p) => p.id === 'red'), 'без запрета красный должен проходить');
  });
});

describe('скан#8: накопление premium-сигнала не перебивает жёсткий variety-cap', () => {
  beforeEach(() => clearProductTypeCache());

  /**
   * Скан утверждал: premium/материал суммируется в ~5 скорерах и «перебивает −150 variety-cap».
   * УТОЧНЁННАЯ картина (замерено на реальном коде + adversarial-ревью):
   *  - `−150` срабатывает по МЕЛКОМУ семейству (familyUsage >= OPTIONAL_TYPE_MAX_CONCEPTS = 2);
   *  - жёсткий `blockedFamilies` — КРУПНОГРУППОВОЙ и включается только при coarse usage >= 3.
   *  Значит в полосе «fine=2, coarse=2» разнообразие держит ИМЕННО этот мягкий штраф (а не
   *  жёсткий гейт — вопреки первоначальному упрощению). Инвариант, который реально важен:
   *  товар исчерпавшего семейства обязан ранжироваться ниже ЛЮБОГО кандидата, проходящего
   *  relevance-floor добора (−20). Слабее этого порога кандидат и так режется гейтами.
   *  Тест ЛОЧИТ этот инвариант именно в рисковой полосе fine=2.
   */
  it('premium исчерпавшего мелкого семейства (fine=2) ранжируется ниже нормального свежего товара', () => {
    const brief = 'премиум подарки топ-менеджменту и партнёрам';
    const relCtx = buildBriefRelevanceContext(brief, []);
    const premiumPen = prod('pp', 'Ручка в кожаном футляре с гравировкой', 'Ручки', 3000);
    const freshMug = prod('pm', 'Кружка керамическая', 'Кружки', 800);

    const penFineExhausted: ShortlistContext = {
      brief, brandColors: [], budgetPerSet: 5000,
      conceptTitle: 'Премиум-набор для партнёров', conceptComposition: 'статусный подарок',
      // РИСКОВАЯ ПОЛОСА: мелкое семейство «pen» уже в 2 наборах (−150), но крупная группа
      // «write» ещё НЕ достигла жёсткого лимита 3 → защищает только скор.
      familyUsage: new Map([['pen', 2]]),
    };
    const premiumScore = scoreRow(premiumPen, relCtx, penFineExhausted);
    const freshScore = scoreRow(freshMug, relCtx, penFineExhausted);
    assert.ok(
      premiumScore < freshScore,
      `premium накопление перебило variety-cap в полосе fine=2: premium=${premiumScore} >= fresh=${freshScore}`,
    );
    // И запас должен быть ощутимым, а не «на грани» — иначе любой новый бонус сломает инвариант.
    assert.ok(
      freshScore - premiumScore > 40,
      `слишком тонкий запас variety-cap: ${freshScore - premiumScore}`,
    );
  });
});

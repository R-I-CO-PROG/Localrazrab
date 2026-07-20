import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { CatalogNeuralSelectorService } from './catalog-neural-selector.service';
import { SelectionLedger } from '../providers/llm/catalog-selection-ledger';
import { clearProductTypeCache } from '../concept/product-taxonomy';
import { resolveSetBudgetRange, estimateSetTotalPrice } from '../providers/llm/set-budget.util';
import type { CatalogProduct } from '../providers/llm/catalog.util';

function prod(id: string, name: string, category: string, price: number): CatalogProduct {
  return {
    id, name, category, subcategory: null, description: name, price,
    stockAvailable: 500, colors: [], silhouetteImageUrl: '',
    catalogImageUrl: 'https://cdn.example.com/i.jpg', imageUrl: 'https://cdn.example.com/i.jpg',
  } as CatalogProduct;
}

const svc = () => new CatalogNeuralSelectorService({ selectForConcept: async () => null } as never);

/** Прямой вызов приватного шага: он и восстанавливает floor после пост-гейтов. */
function topUp(
  s: CatalogNeuralSelectorService,
  set: CatalogProduct[],
  pool: CatalogProduct[],
  args: Record<string, unknown>,
): CatalogProduct[] {
  return (s as unknown as {
    topUpToBudgetFloor(
      set: CatalogProduct[], pool: CatalogProduct[], ctx: Record<string, unknown>, args: Record<string, unknown>,
      anchorType?: string, anchorLabel?: string,
    ): CatalogProduct[];
  }).topUpToBudgetFloor(set, pool, { brief: args.brief, brandColors: [] }, args);
}

const baseArgs = (over: Record<string, unknown> = {}) => ({
  brief: 'корпоративный набор сотрудникам',
  brandColors: [] as string[],
  budgetPerSet: 6000,
  maxItems: 5,
  minItems: 3,
  ledger: new SelectionLedger(new Set(), new Set(), new Set(), 'набор'),
  ...over,
});

describe('скан#11: восстановление бюджет-floor после пост-гейтов', () => {
  beforeEach(() => clearProductTypeCache());

  it('тонкий набор (пост-гейты уронили сумму) добирается до floor', () => {
    const set = [
      prod('mug', 'Кружка керамическая', 'Кружки', 300),
      prod('nb', 'Блокнот A5', 'Ежедневники и блокноты', 300),
      prod('pen', 'Ручка металлическая', 'Ручки', 300),
    ];
    const pool = [
      ...set,
      prod('bag', 'Рюкзак городской', 'Сумки и рюкзаки', 2200),
      prod('pb', 'Внешний аккумулятор 10000 мАч', 'Электроника', 2400),
    ];
    const { floor, cap } = resolveSetBudgetRange(null, 6000);
    assert.ok(estimateSetTotalPrice(set) < floor, 'предусловие: набор ниже floor');

    const out = topUp(svc(), set, pool, baseArgs());
    const total = estimateSetTotalPrice(out);
    assert.ok(out.length > set.length, `ничего не добрано: ${out.map((p) => p.id)}`);
    assert.ok(total > estimateSetTotalPrice(set), 'сумма не выросла');
    assert.ok(total <= cap, `пробит cap: ${total} > ${cap}`);
    assert.ok(out.length <= 5, `превышен maxItems: ${out.length}`);
  });

  it('набор уже на floor — no-op (не раздуваем)', () => {
    const set = [
      prod('bag', 'Рюкзак городской', 'Сумки и рюкзаки', 2600),
      prod('pb', 'Внешний аккумулятор 10000 мАч', 'Электроника', 2600),
    ];
    const pool = [...set, prod('pen', 'Ручка металлическая', 'Ручки', 300)];
    const { floor } = resolveSetBudgetRange(null, 6000);
    assert.ok(estimateSetTotalPrice(set) >= floor, 'предусловие: уже на floor');
    const out = topUp(svc(), set, pool, baseArgs());
    assert.equal(out.length, set.length, 'не должен добирать сверх floor');
  });

  it('не добирает дубль категории/семейства', () => {
    const set = [prod('mug', 'Кружка керамическая', 'Кружки', 300)];
    // Единственный кандидат — ещё одна кружка (та же категория и семейство drinkware).
    const pool = [...set, prod('mug2', 'Кружка керамическая большая', 'Кружки', 2500)];
    const out = topUp(svc(), set, pool, baseArgs({ minItems: 1 }));
    assert.equal(out.length, 1, `добран дубль категории: ${out.map((p) => p.id)}`);
  });

  it('не пробивает cap: слишком дорогой кандидат не берётся', () => {
    const set = [prod('mug', 'Кружка керамическая', 'Кружки', 300)];
    const pool = [...set, prod('lux', 'Рюкзак кожаный премиум', 'Сумки и рюкзаки', 99000)];
    const out = topUp(svc(), set, pool, baseArgs({ minItems: 1 }));
    assert.ok(!out.some((p) => p.id === 'lux'), 'взят кандидат дороже cap');
  });

  it('флаг CATALOG_BUDGET_FLOOR_TOPUP=false отключает шаг', () => {
    const prev = process.env.CATALOG_BUDGET_FLOOR_TOPUP;
    process.env.CATALOG_BUDGET_FLOOR_TOPUP = 'false';
    try {
      const set = [prod('mug', 'Кружка керамическая', 'Кружки', 300)];
      const pool = [...set, prod('bag', 'Рюкзак городской', 'Сумки и рюкзаки', 2200)];
      const out = topUp(svc(), set, pool, baseArgs({ minItems: 1 }));
      assert.equal(out.length, 1, 'флаг не отключил top-up');
    } finally {
      if (prev === undefined) delete process.env.CATALOG_BUDGET_FLOOR_TOPUP;
      else process.env.CATALOG_BUDGET_FLOOR_TOPUP = prev;
    }
  });
});

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { assembleFromPool } from './catalog-set-assembler.util';
import { SelectionLedger } from './catalog-selection-ledger';
import { clearProductTypeCache } from '../../concept/product-taxonomy';
import { resolveSetBudgetRange, estimateSetTotalPrice } from './set-budget.util';
import type { CatalogProduct } from './catalog.util';

function prod(id: string, name: string, category: string, price: number): CatalogProduct {
  return {
    id, name, category, subcategory: null, description: name, price,
    stockAvailable: 500, colors: [], silhouetteImageUrl: '',
    catalogImageUrl: 'https://cdn.example.com/i.jpg', imageUrl: 'https://cdn.example.com/i.jpg',
  } as CatalogProduct;
}
const ledger = () => new SelectionLedger(new Set(), new Set(), new Set(), 'набор');

// Фикс 5: тонкий недобранный набор (staple-семейства заблокированы variety-cap) добирается
// staple-позициями к floor — но apparel/novelty НЕ воскрешаются (иначе футболки-3/5).
describe('Фикс 5: полнота добора к бюджету (staple-резерв)', () => {
  beforeEach(() => clearProductTypeCache());

  it('тонкий набор добирается заблокированными STAPLE (ручка/блокнот/сумка/напиток)', () => {
    const budget = 3000;
    const { floor } = resolveSetBudgetRange(null, budget); // 2550
    const pool = [
      prod('brelok', 'Брелок-открывашка Champion', 'Сувениры и награды', 171),
      prod('pb', 'Внешний аккумулятор 5000 мАч', 'Электроника', 388),
      prod('hub', 'USB-хаб «Link» 2-в-1', 'Электроника', 734),
      prod('diary', 'Ежедневник недатированный А5, кожзам', 'Ежедневники и блокноты', 800),
      prod('bag', 'Сумка-шоппер городская', 'Сумки и рюкзаки', 700),
      prod('bottle', 'Бутылка для воды 600 мл', 'Термосы и бутылки', 600),
    ];
    const blockedFamilies = new Set(['pen', 'writing', 'carry', 'drinkware']);
    const out = assembleFromPool({
      pool, productIds: ['brelok', 'pb', 'hub'], ledger: ledger(),
      minItems: 3, maxItems: 5, budgetPerSet: budget,
      brief: 'наборы для онбординга менеджеров по продажам', brandColors: [],
      fullCatalog: pool, blockedFamilies,
    });
    const total = estimateSetTotalPrice(out);
    assert.ok(out.length >= 4 || total >= floor, `застряло: ${out.length} поз., ${total}₽; ${out.map((p) => p.id)}`);
    assert.ok(total <= budget, `превышен cap: ${total}`);
  });

  it('apparel (футболка) НЕ воскрешается добором даже при недоборе бюджета', () => {
    const pool = [
      prod('mug', 'Кружка керамическая', 'Кружки', 400),
      prod('nb', 'Блокнот А5', 'Ежедневники и блокноты', 400),
      prod('bag', 'Сумка городская', 'Сумки и рюкзаки', 500),
      prod('tshirt', 'Футболка Premium мужская', 'Одежда', 900),
    ];
    // всё staple уже использовано + футболка (apparel) заблокирована
    const out = assembleFromPool({
      pool, productIds: ['mug', 'nb', 'bag'], ledger: ledger(),
      minItems: 3, maxItems: 5, budgetPerSet: 3000, brief: 'подарки команде', brandColors: [],
      fullCatalog: pool, blockedFamilies: new Set(['unique:tshirt']),
    });
    assert.ok(!out.some((p) => p.id === 'tshirt'), `футболка воскрешена добором: ${out.map((p) => p.id)}`);
  });

  it('гаджет-слот (флешка usb_storage) НЕ воскрешается добором — должен варьироваться', () => {
    const pool = [
      prod('mug', 'Кружка керамическая', 'Кружки', 400),
      prod('nb', 'Блокнот А5', 'Ежедневники и блокноты', 400),
      prod('bag', 'Сумка городская', 'Сумки и рюкзаки', 500),
      prod('flash', 'Флешка в виде футболки, 16 Гб', 'Электроника', 900),
    ];
    const out = assembleFromPool({
      pool, productIds: ['mug', 'nb', 'bag'], ledger: ledger(),
      minItems: 3, maxItems: 5, budgetPerSet: 3000, brief: 'подарки команде', brandColors: [],
      fullCatalog: pool, blockedFamilies: new Set(['usb_storage']),
    });
    assert.ok(!out.some((p) => p.id === 'flash'), `флешка воскрешена добором: ${out.map((p) => p.id)}`);
  });

  it('функц. редундантность: зонт+дождевик не сосуществуют, две зарядки — тоже', () => {
    const pool = [
      prod('umbr', 'Зонт складной автоматический', 'Зонты', 700),
      prod('rain', 'Дождевик-плащ водонепроницаемый', 'Одежда', 600),
      prod('pb', 'Внешний аккумулятор 10000 мАч', 'Электроника', 800),
      prod('wch', 'Беспроводное зарядное устройство', 'Электроника', 750),
      prod('mug', 'Термокружка стальная', 'Термосы', 650),
      prod('nb', 'Ежедневник А5', 'Ежедневники', 600),
    ];
    const out = assembleFromPool({
      pool, productIds: ['umbr', 'rain', 'pb', 'wch', 'mug', 'nb'], ledger: ledger(),
      minItems: 3, maxItems: 5, budgetPerSet: 5000, brief: 'подарки', brandColors: [], fullCatalog: pool,
    });
    const names = out.map((p) => p.id);
    assert.ok(!(names.includes('umbr') && names.includes('rain')), `зонт+дождевик вместе: ${names}`);
    assert.ok(!(names.includes('pb') && names.includes('wch')), `две зарядки вместе: ${names}`);
  });

  it('добор уважает cap (не превышает бюджет)', () => {
    const pool = [
      prod('a', 'Ручка металлическая', 'Ручки', 300),
      prod('b', 'Ежедневник премиум', 'Ежедневники и блокноты', 2800),
      prod('c', 'Сумка кожаная', 'Сумки и рюкзаки', 2600),
    ];
    const out = assembleFromPool({
      pool, productIds: ['a'], ledger: ledger(),
      minItems: 1, maxItems: 5, budgetPerSet: 3000, brief: 'подарки', brandColors: [],
      fullCatalog: pool, blockedFamilies: new Set(['writing', 'carry']),
    });
    assert.ok(estimateSetTotalPrice(out) <= 3000, `cap пробит: ${estimateSetTotalPrice(out)}`);
  });
});

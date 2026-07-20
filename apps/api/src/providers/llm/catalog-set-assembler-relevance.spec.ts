import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { assembleFromPool } from './catalog-set-assembler.util';
import { SelectionLedger } from './catalog-selection-ledger';
import { clearProductTypeCache } from '../../concept/product-taxonomy';
import type { CatalogProduct } from './catalog.util';

function prod(id: string, name: string, category: string, price: number): CatalogProduct {
  return {
    id, name, category, subcategory: null, description: name, price,
    stockAvailable: 500, colors: [], silhouetteImageUrl: '',
    catalogImageUrl: 'https://cdn.example.com/i.jpg', imageUrl: 'https://cdn.example.com/i.jpg',
  };
}
const ledger = () => new SelectionLedger(new Set(), new Set(), new Set(), 'набор');

describe('budget-fill не тянет off-theme дорогой предмет ради бюджета (#2)', () => {
  beforeEach(() => clearProductTypeCache());

  it('врачу: дешёвый релевантный апгрейд предпочтён дорогому off-theme коврику', () => {
    const brief = 'подарки врачам на день медицинского работника';
    // Набор недобирает floor; в пуле есть дорогой off-theme коврик для йоги (1566) и
    // релевантный апгрейд (термокружка 1200). Гейт должен выбрать термокружку, не коврик.
    const accepted0 = ['pen', 'nb', 'bag'];
    const pool = [
      prod('pen', 'Ручка металлическая', 'Ручки', 300),
      prod('nb', 'Блокнот А5', 'Ежедневники и блокноты', 350),
      prod('bag', 'Сумка для документов', 'Сумки и рюкзаки', 400),
      prod('yoga', 'Коврик Cobra для фитнеса и йоги, черный', 'Отдых и спорт', 1566),
      prod('mug-up', 'Термокружка стальная премиум 400 мл', 'Термосы и бутылки', 1200),
    ];
    const out = assembleFromPool({
      pool,
      productIds: accepted0,
      ledger: ledger(),
      minItems: 3,
      maxItems: 5,
      budgetPerSet: 3000,
      brief,
      brandColors: [],
      fullCatalog: pool,
    });
    const ids = out.map((p) => p.id);
    assert.ok(!ids.includes('yoga'), `off-theme коврик протащен ради бюджета: ${ids}`);
  });

  it('в спорт-брифе коврик релевантен — апгрейд к нему допустим', () => {
    const brief = 'фитнес-наборы для wellness-программы сотрудников';
    const pool = [
      prod('bottle', 'Бутылка для воды', 'Термосы и бутылки', 300),
      prod('towel', 'Полотенце спортивное', 'Отдых и спорт', 350),
      prod('band', 'Фитнес-резинка', 'Отдых и спорт', 250),
      prod('yoga', 'Коврик Cobra для фитнеса и йоги, черный', 'Отдых и спорт', 1566),
    ];
    const out = assembleFromPool({
      pool,
      productIds: ['bottle', 'towel', 'band'],
      ledger: ledger(),
      minItems: 3,
      maxItems: 5,
      budgetPerSet: 3000,
      brief,
      brandColors: [],
      fullCatalog: pool,
    });
    // Здесь коврик тематичен — гейт его НЕ обязан выкидывать (проверяем, что не сломали кейс).
    assert.ok(out.length >= 3);
  });
});

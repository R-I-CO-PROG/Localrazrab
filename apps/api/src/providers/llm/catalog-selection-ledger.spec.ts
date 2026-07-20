import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { SelectionLedger } from './catalog-selection-ledger';
import { clearProductTypeCache } from '../../concept/product-taxonomy';
import type { CatalogProduct } from './catalog.util';

function P(
  id: string,
  name: string,
  category = 'Сумки и рюкзаки',
): CatalogProduct {
  return {
    id,
    name,
    category,
    subcategory: null,
    description: null,
    price: 500,
    stockAvailable: 100,
    colors: [],
    silhouetteImageUrl: '',
    catalogImageUrl: 'https://cdn.example.com/i.jpg',
    imageUrl: 'https://cdn.example.com/i.jpg',
  };
}

describe('SelectionLedger', () => {
  beforeEach(() => clearProductTypeCache());

  it('blocks a product after it is reserved', () => {
    const l = new SelectionLedger(new Set(), new Set(), new Set(), 'подарки');
    const bag = P('1', 'Рюкзак городской');
    assert.equal(l.canUse(bag), true);
    l.reserve(bag);
    assert.equal(l.canUse(bag), false);
  });

  it('flags a duplicate role within the same set', () => {
    const l = new SelectionLedger(new Set(), new Set(), new Set(), 'подарки');
    const bag1 = P('1', 'Рюкзак городской');
    const bag2 = P('2', 'Рюкзак спортивный');
    assert.equal(l.wouldDupeRole(bag2, [bag1]), true);
  });

  it('does not flag different roles as duplicates', () => {
    const l = new SelectionLedger(new Set(), new Set(), new Set(), 'подарки');
    const bag = P('1', 'Рюкзак городской', 'Сумки и рюкзаки');
    const mug = P('2', 'Термокружка стальная', 'Термосы и бутылки');
    assert.equal(l.wouldDupeRole(mug, [bag]), false);
  });

  it('blocks the same base product in another color (dash-separated)', () => {
    const l = new SelectionLedger(new Set(), new Set(), new Set(), 'эко');
    const grey = P('a', 'Байрон поясная сумка из переработанных материалов объемом 1,5 л - Серый');
    const blue = P('b', 'Байрон поясная сумка из переработанных материалов объемом 1,5 л - Ярко-синий');
    l.reserve(grey);
    assert.equal(l.canUse(blue), false);
  });

  it('respects seeded cross-concept ids', () => {
    const l = new SelectionLedger(
      new Set(['9']),
      new Set(),
      new Set(),
      'подарки',
    );
    assert.equal(l.canUse(P('9', 'Кружка', 'Посуда')), false);
  });
});

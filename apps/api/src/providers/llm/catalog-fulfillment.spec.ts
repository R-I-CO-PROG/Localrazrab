import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  productFulfillsTirage,
  productStockShortfall,
  fulfillmentRank,
  summarizeSetFulfillment,
  formatStockShortfall,
} from './catalog-fulfillment.util';
import type { CatalogProduct } from './catalog.util';

function prod(id: string, stock: number): CatalogProduct {
  return {
    id,
    name: `Товар ${id}`,
    category: 'Электроника',
    subcategory: null,
    description: '',
    price: 1000,
    stockAvailable: stock,
    colors: [],
    silhouetteImageUrl: '',
    catalogImageUrl: 'https://cdn.example.com/i.jpg',
    imageUrl: 'https://cdn.example.com/i.jpg',
  } as CatalogProduct;
}

describe('productFulfillsTirage', () => {
  it('покрывает при остатке ≥ тиража', () => {
    assert.equal(productFulfillsTirage(prod('a', 200), 155), true);
    assert.equal(productFulfillsTirage(prod('a', 155), 155), true);
  });
  it('не покрывает при остатке < тиража', () => {
    assert.equal(productFulfillsTirage(prod('a', 1), 155), false);
    assert.equal(productFulfillsTirage(prod('a', 0), 155), false);
  });
  it('тираж не задан → всегда покрывает', () => {
    assert.equal(productFulfillsTirage(prod('a', 0), 0), true);
    assert.equal(productFulfillsTirage(prod('a', 0), null), true);
  });
});

describe('productStockShortfall', () => {
  it('считает нехватку', () => {
    assert.equal(productStockShortfall(prod('a', 1), 155), 154);
    assert.equal(productStockShortfall(prod('a', 200), 155), 0);
    assert.equal(productStockShortfall(prod('a', 5), 0), 0);
  });
});

describe('fulfillmentRank', () => {
  it('1 если покрывает, 0 если нет', () => {
    assert.equal(fulfillmentRank(prod('a', 200), 155), 1);
    assert.equal(fulfillmentRank(prod('a', 1), 155), 0);
  });
});

describe('summarizeSetFulfillment', () => {
  it('все покрывают → ok', () => {
    const r = summarizeSetFulfillment([prod('a', 200), prod('b', 300)], 155);
    assert.equal(r.status, 'ok');
    assert.equal(r.coveredCount, 2);
    assert.deepEqual(r.shortItems, []);
  });
  it('часть не покрывает → partial с деталями', () => {
    const r = summarizeSetFulfillment([prod('a', 200), prod('b', 1)], 155);
    assert.equal(r.status, 'partial');
    assert.equal(r.coveredCount, 1);
    assert.equal(r.shortItems.length, 1);
    assert.equal(r.shortItems[0].id, 'b');
    assert.equal(r.shortItems[0].shortfall, 154);
  });
  it('ни одна не покрывает → risky', () => {
    const r = summarizeSetFulfillment([prod('a', 1), prod('b', 0)], 155);
    assert.equal(r.status, 'risky');
    assert.equal(r.coveredCount, 0);
    assert.equal(r.shortItems.length, 2);
  });
  it('тираж не задан → ok без деталей', () => {
    const r = summarizeSetFulfillment([prod('a', 1)], 0);
    assert.equal(r.status, 'ok');
    assert.deepEqual(r.shortItems, []);
  });
  it('пустой набор → ok', () => {
    const r = summarizeSetFulfillment([], 155);
    assert.equal(r.status, 'ok');
    assert.equal(r.totalCount, 0);
  });
});

describe('formatStockShortfall', () => {
  it('человекочитаемая пометка', () => {
    assert.equal(formatStockShortfall(1, 155), 'остаток 1 шт при тираже 155');
  });
});

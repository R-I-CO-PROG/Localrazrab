import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { filterCatalogForRequest, RELEVANCE_MIN_SCORE } from './catalog-filter.util';
import { clearProductTypeCache } from '../../concept/product-taxonomy';
import type { CatalogProduct } from './catalog.util';

function prod(id: string, name: string, category: string, price = 1200): CatalogProduct {
  return {
    id, name, category, subcategory: null, description: name, price,
    stockAvailable: 500, colors: [], silhouetteImageUrl: '',
    catalogImageUrl: 'https://cdn.example.com/i.jpg', imageUrl: 'https://cdn.example.com/i.jpg',
  };
}

describe('RELEVANCE_MIN_SCORE — пороги в одном месте', () => {
  it('константы заданы', () => {
    assert.equal(RELEVANCE_MIN_SCORE.tech, 75);
    assert.equal(RELEVANCE_MIN_SCORE.default, -40);
  });
});

describe('явно разрешённые категории обходят тематический strict-порог', () => {
  beforeEach(() => clearProductTypeCache());

  it('tech-бриф: разрешённая «Посуда» не вырезается строгим tech-порогом', () => {
    // tech-режим требует score > 75; посуда тематически низко скорит, но пользователь
    // явно разрешил категорию — она обязана дойти до подбора.
    const dishes = Array.from({ length: 6 }, (_, i) =>
      prod(`dish${i}`, `Тарелка керамическая ${i}`, 'Посуда'),
    );
    const techItems = Array.from({ length: 10 }, (_, i) =>
      prod(`pb${i}`, `Пауэрбанк 10000 mAh ${i}`, 'Электроника'),
    );
    const out = filterCatalogForRequest([...dishes, ...techItems], {
      userPrompt: 'подарки для IT-команды, tech, можно посуду',
      quantity: null,
      budgetMin: null,
      budgetMax: 5000,
      colors: [],
      allowedItems: ['Посуда', 'Электроника'],
      forbiddenItems: [],
    });
    assert.ok(
      out.some((p) => p.category === 'Посуда'),
      `явно разрешённая посуда вырезана: ${out.map((p) => p.category).join(',')}`,
    );
  });
});

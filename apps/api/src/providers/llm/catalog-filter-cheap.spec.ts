import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { filterCatalogForRequest } from './catalog-filter.util';
import { clearProductTypeCache } from '../../concept/product-taxonomy';
import type { CatalogProduct } from './catalog.util';

function prod(id: string, name: string, category: string, price: number): CatalogProduct {
  return {
    id,
    name,
    category,
    subcategory: null,
    description: name,
    price,
    stockAvailable: 5000,
    colors: [],
    silhouetteImageUrl: '',
    catalogImageUrl: 'https://cdn.example.com/i.jpg',
    imageUrl: 'https://cdn.example.com/i.jpg',
  };
}

describe('дешёвые товары не отбрасываются жёстким порогом цены', () => {
  beforeEach(() => clearProductTypeCache());

  it('товары за 25–45 ₽ остаются в пуле (нет фикс-порога 50 ₽)', () => {
    const catalog: CatalogProduct[] = [
      prod('pen-cheap', 'Ручка шариковая эконом', 'Ручки', 30),
      prod('badge', 'Значок металлический', 'Прочее', 45),
      ...Array.from({ length: 25 }, (_, i) =>
        prod(`mug${i}`, `Кружка керамическая М${i}`, 'Кружки', 400 + i),
      ),
      ...Array.from({ length: 25 }, (_, i) =>
        prod(`nb${i}`, `Блокнот А5 Б${i}`, 'Ежедневники и блокноты', 500 + i),
      ),
    ];
    const out = filterCatalogForRequest(catalog, {
      userPrompt: 'сувениры для команды',
      quantity: null,
      budgetMin: null,
      budgetMax: null,
      colors: [],
      allowedItems: [],
      forbiddenItems: [],
    });
    assert.ok(
      out.some((p) => p.id === 'pen-cheap'),
      `ручка за 30 ₽ вырезана: ${out.length} товаров в пуле`,
    );
  });
});

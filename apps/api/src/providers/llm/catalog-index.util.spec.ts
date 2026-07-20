import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CatalogProduct } from './catalog.util';
import {
  buildCatalogOverview,
  stratifiedCatalogForLlm,
  toCompactCatalogRow,
} from './catalog-index.util';

function product(partial: Partial<CatalogProduct> & Pick<CatalogProduct, 'id' | 'name'>): CatalogProduct {
  return {
    category: 'Посуда',
    subcategory: null,
    description: null,
    price: 500,
    stockAvailable: 10,
    colors: [],
    silhouetteImageUrl: '/x.png',
    catalogImageUrl: null,
    imageUrl: null,
    sourceId: null,
    externalId: null,
    currency: 'RUB',
    sourceUrl: null,
    ...partial,
  };
}

describe('catalog-index.util IMBA paths', () => {
  it('toCompactCatalogRow uses subcategory as category for LLM', () => {
    const row = toCompactCatalogRow(
      product({
        id: '1',
        name: 'Декантер',
        category: 'Посуда',
        subcategory: 'Продукция / Кухня и посуда / Аксессуары для алкоголя / Декантеры',
      }),
    );
    assert.match(row.category, /декантер/i);
  });

  it('buildCatalogOverview groups by IMBA branch depth 2', () => {
    const catalog = [
      product({
        id: '1',
        name: 'Декантер A',
        subcategory: 'Продукция / Кухня и посуда / Аксессуары для алкоголя / Декантеры',
      }),
      product({
        id: '2',
        name: 'Шейкер B',
        subcategory: 'Продукция / Кухня и посуда / Барные аксессуары / Шейкеры',
      }),
      product({
        id: '3',
        name: 'Ручка C',
        subcategory: 'Продукция / Пишущие инструменты / Ручки',
      }),
    ];
    const overview = buildCatalogOverview(catalog, 51331);
    const names = overview.categories.map((c) => c.name);
    assert.ok(names.includes('Продукция / Кухня и посуда'));
    assert.ok(names.includes('Продукция / Пишущие инструменты'));
    const kitchen = overview.categories.find((c) => c.name === 'Продукция / Кухня и посуда');
    assert.equal(kitchen?.count, 2);
  });

  it('stratifiedCatalogForLlm covers IMBA branches', async () => {
    const catalog: CatalogProduct[] = [];
    for (let i = 0; i < 30; i++) {
      catalog.push(
        product({
          id: `pen-${i}`,
          name: `Ручка ${i}`,
          subcategory: 'Продукция / Пишущие инструменты / Ручки',
        }),
      );
    }
    for (let i = 0; i < 5; i++) {
      catalog.push(
        product({
          id: `shaker-${i}`,
          name: `Шейкер ${i}`,
          subcategory: 'Продукция / Кухня и посуда / Барные аксессуары / Шейкеры',
        }),
      );
    }
    const sample = await stratifiedCatalogForLlm(catalog, { userPrompt: 'бар', colors: [], allowedItems: [], forbiddenItems: [] }, 20);
    const paths = new Set(sample.map((p) => p.subcategory));
    assert.ok(paths.has('Продукция / Кухня и посуда / Барные аксессуары / Шейкеры'));
  });
});

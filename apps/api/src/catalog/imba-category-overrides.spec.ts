import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyCategoryMoves,
  catalogImbaPath,
  effectiveImbaCategory,
  imbaCategoryBranch,
  leafCategoryName,
  normalizeBaseCategory,
} from './imba-category-overrides';

describe('imba-category-overrides', () => {
  it('classifies decanter by name rules', () => {
    const path = normalizeBaseCategory({
      sku: 'X1',
      name: 'Декантер для вина стеклянный',
      category: 'Разное',
    });
    assert.match(path, /декантер/i);
  });

  it('classifies thermos mug by name rules', () => {
    const path = normalizeBaseCategory({
      sku: 'X2',
      name: 'Термокружка стальная 350 мл',
      category: '',
    });
    assert.match(path, /термокружк/i);
  });

  it('applies categoryMoves prefix rewrite', () => {
    const moves = {
      'Продукция / Старое': 'Продукция / Новое',
    };
    const out = applyCategoryMoves('Продукция / Старое / Подтип', moves);
    assert.equal(out, 'Продукция / Новое / Подтип');
  });

  it('effectiveImbaCategory prefers productMoves over base', () => {
    const path = effectiveImbaCategory(
      { sku: 'SKU-99', name: 'Ручка', category: 'Продукция / Пишущие инструменты / Ручки' },
      { productMoves: { 'SKU-99': 'Продукция / Пишущие инструменты / Металлические ручки' } },
    );
    assert.match(path, /металлические ручки/i);
  });

  it('imbaCategoryBranch trims to depth', () => {
    const branch = imbaCategoryBranch(
      'Продукция / Кухня и посуда / Барные аксессуары / Шейкеры',
      2,
    );
    assert.equal(branch, 'Продукция / Кухня и посуда');
  });

  it('leafCategoryName returns last segment', () => {
    assert.equal(leafCategoryName('Продукция / Сумки / Рюкзаки'), 'Рюкзаки');
  });

  it('catalogImbaPath prefers subcategory', () => {
    assert.equal(
      catalogImbaPath({
        category: 'Посуда',
        subcategory: 'Продукция / Аксессуары для алкогольных напитков / Декантеры',
      }),
      'Продукция / Аксессуары для алкогольных напитков / Декантеры',
    );
  });
});

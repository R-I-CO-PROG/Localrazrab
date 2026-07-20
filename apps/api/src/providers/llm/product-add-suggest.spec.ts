import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  localSuggestProductsForAdd,
  buildAddSuggestionMismatches,
  stripAttributeAndColorWords,
} from './product-add-suggest.util';
import { clearProductTypeCache } from '../../concept/product-taxonomy';
import type { CatalogProduct } from './catalog.util';
import type { CatalogFilterInput } from './catalog-filter.util';

function powerbank(
  id: string,
  opts: { mah?: number; color?: string; price?: number; stock?: number } = {},
): CatalogProduct {
  const { mah, color, price = 900, stock = 1000 } = opts;
  return {
    id,
    name: `Пауэрбанк Energy${mah ? ` ${mah} mAh` : ''} ${id}`,
    category: 'Электроника',
    subcategory: 'Внешние аккумуляторы',
    description: 'Внешний аккумулятор для зарядки устройств',
    price,
    stockAvailable: stock,
    colors: color ? [{ name: color }] : [{ name: 'черный' }],
    silhouetteImageUrl: '',
    catalogImageUrl: 'https://cdn.example.com/i.jpg',
    imageUrl: 'https://cdn.example.com/i.jpg',
  } as CatalogProduct;
}

const input: CatalogFilterInput = {
  userPrompt: '',
  quantity: null,
  budgetMin: null,
  budgetMax: null,
  colors: [],
  allowedItems: [],
  forbiddenItems: [],
};

describe('localSuggestProductsForAdd: ярусы тип → атрибуты → цвет → тираж → остаток бюджета', () => {
  beforeEach(() => clearProductTypeCache());

  it('точная ёмкость важнее цвета: 5000-чёрный выше 10000-синего', () => {
    const catalog = [
      powerbank('pb10-blue', { mah: 10000, color: 'синий' }),
      powerbank('pb5-black', { mah: 5000, color: 'черный' }),
    ];
    const picked = localSuggestProductsForAdd(
      catalog,
      'пауэрбанк 5000 мАч, синий',
      input,
      5,
      new Set(),
    );
    assert.equal(picked[0]?.id, 'pb5-black');
  });

  it('при равных атрибутах побеждает цвет из запроса', () => {
    const catalog = [
      powerbank('pb5-black', { mah: 5000, color: 'черный' }),
      powerbank('pb5-blue', { mah: 5000, color: 'синий' }),
    ];
    const picked = localSuggestProductsForAdd(
      catalog,
      'пауэрбанк 5000 мАч, синий',
      input,
      5,
      new Set(),
    );
    assert.equal(picked[0]?.id, 'pb5-blue');
  });

  it('при равных атрибутах и цвете выше тот, у кого остаток покрывает тираж', () => {
    const catalog = [
      powerbank('pb-low-stock', { mah: 5000, color: 'синий', stock: 120 }),
      powerbank('pb-ok-stock', { mah: 5000, color: 'синий', stock: 900 }),
    ];
    const picked = localSuggestProductsForAdd(
      catalog,
      'пауэрбанк 5000 мАч, синий',
      input,
      5,
      new Set(),
      { tirage: 300, remainingBudget: null },
    );
    assert.equal(picked[0]?.id, 'pb-ok-stock');
  });

  it('при прочих равных выше тот, кто помещается в остаток бюджета', () => {
    const catalog = [
      powerbank('pb-expensive', { mah: 5000, color: 'синий', price: 2600 }),
      powerbank('pb-fits', { mah: 5000, color: 'синий', price: 1200 }),
    ];
    const picked = localSuggestProductsForAdd(
      catalog,
      'пауэрбанк 5000 мАч, синий',
      input,
      5,
      new Set(),
      { tirage: 0, remainingBudget: 1500 },
    );
    assert.equal(picked[0]?.id, 'pb-fits');
  });

  it('нет точных вариантов → добор ближайшими, а не пусто', () => {
    const catalog = [
      powerbank('pb10', { mah: 10000, color: 'черный' }),
      powerbank('pb20', { mah: 20000, color: 'черный' }),
    ];
    const picked = localSuggestProductsForAdd(
      catalog,
      'пауэрбанк 5000 мАч, синий',
      input,
      5,
      new Set(),
    );
    assert.equal(picked.length, 2);
    assert.equal(picked[0]?.id, 'pb10'); // 10000 ближе к 5000, чем 20000
  });
});

describe('buildAddSuggestionMismatches', () => {
  beforeEach(() => clearProductTypeCache());

  it('точный кандидат — без пометок', () => {
    const notes = buildAddSuggestionMismatches(
      powerbank('pb', { mah: 5000, color: 'синий', price: 900, stock: 900 }),
      'пауэрбанк 5000 мАч, синий',
      { tirage: 300, remainingBudget: 1500 },
    );
    assert.deepEqual(notes, []);
  });

  it('фиксирует отклонения по ёмкости, цвету, тиражу и остатку бюджета', () => {
    const notes = buildAddSuggestionMismatches(
      powerbank('pb', { mah: 10000, color: 'черный', price: 2000, stock: 120 }),
      'пауэрбанк 5000 мАч, синий',
      { tirage: 300, remainingBudget: 1500 },
    );
    assert.ok(notes.some((n) => n.includes('10000 мАч вместо 5000 мАч')), `нет ёмкости: ${notes}`);
    assert.ok(notes.some((n) => n.includes('синий')), `нет цвета: ${notes}`);
    assert.ok(notes.some((n) => n.includes('остаток 120') && n.includes('300')), `нет тиража: ${notes}`);
    assert.ok(notes.some((n) => n.includes('500') && n.includes('бюджет')), `нет бюджета: ${notes}`);
  });

  it('без тиража и бюджета в контексте — только атрибуты/цвет', () => {
    const notes = buildAddSuggestionMismatches(
      powerbank('pb', { mah: 5000, color: 'синий', price: 99999, stock: 1 }),
      'пауэрбанк 5000 мАч, синий',
      { tirage: 0, remainingBudget: null },
    );
    assert.deepEqual(notes, []);
  });
});

describe('stripAttributeAndColorWords', () => {
  it('убирает цвета, единицы и числа — остаётся тип для SQL-поиска', () => {
    assert.equal(
      stripAttributeAndColorWords('Пауэрбанк на 5000 мАч, синий'),
      'Пауэрбанк на',
    );
    assert.equal(stripAttributeAndColorWords('серая кружка 300 мл'), 'кружка');
  });

  it('если после чистки пусто — возвращает исходный текст', () => {
    assert.equal(stripAttributeAndColorWords('синий 5000 мАч'), 'синий 5000 мАч');
  });
});

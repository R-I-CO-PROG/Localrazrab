import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isCompatibleComplement, hasAnchorAffinity } from './catalog-anchor-affinity.util';
import type { CatalogProduct } from './catalog.util';

function p(name: string, category = 'Прочее'): CatalogProduct {
  return {
    id: name, name, category, subcategory: category, description: '', price: 900,
    stockAvailable: 100, colors: [], silhouetteImageUrl: '', catalogImageUrl: 'x', imageUrl: 'x',
  } as CatalogProduct;
}

describe('Совместимость комплемента с якорем (повербанк, прогон 3:10)', () => {
  const ANCHOR = 'powerbank';
  const LABEL = 'беспроводная зарядка';

  it('якорь-повербанк имеет карту совместимости', () => {
    assert.equal(hasAnchorAffinity('powerbank', 'беспроводная зарядка'), true);
    assert.equal(hasAnchorAffinity('mug', 'кружка'), false); // неизвестный якорь — не гейтим
  });

  it('несвязанное к повербанку — НЕ совместимо (помада/несессер/сумка/блокнот)', () => {
    for (const [n, c] of [
      ['Гигиеническая помада «Chapstick», белый', 'Гигиенические помады'],
      ['Несессер Колумб, черный', 'Сумки и рюкзаки'],
      ['Поясная сумка SPIRIT, Серый', 'Сумки и рюкзаки'],
      ['Блокнот «Color» линованный А5', 'Ежедневники и блокноты'],
    ] as const) {
      assert.equal(isCompatibleComplement(ANCHOR, LABEL, p(n, c)), false, `${n} не должен подходить к повербанку`);
    }
  });

  it('связанное к повербанку — совместимо (кабель/зарядка/наушники/подставка/хаб)', () => {
    for (const [n, c] of [
      ['USB-кабель 3-в-1 Type-C', 'Электроника и гаджеты'],
      ['Беспроводное зарядное устройство-подставка', 'Электроника'],
      ['Наушники беспроводные TWS', 'Электроника'],
      ['Подставка для телефона с беспроводной зарядкой', 'Электроника'],
      ['USB-хаб на 4 порта', 'Электроника'],
      ['Внешний аккумулятор 10000 мАч', 'Электроника'],
    ] as const) {
      assert.equal(isCompatibleComplement(ANCHOR, LABEL, p(n, c)), true, `${n} должен подходить к повербанку`);
    }
  });

  it('неизвестный якорь (кружка) — комплемент всегда совместим (не ломаем обычные наборы)', () => {
    assert.equal(isCompatibleComplement('mug', 'кружка', p('Блокнот А5', 'Ежедневники')), true);
    assert.equal(isCompatibleComplement('mug', 'кружка', p('Плед флисовый', 'Пледы')), true);
  });
});

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { assembleFromPool } from './catalog-set-assembler.util';
import { SelectionLedger } from './catalog-selection-ledger';
import { clearProductTypeCache } from '../../concept/product-taxonomy';
import type { CatalogProduct } from './catalog.util';

function prod(id: string, name: string, category: string, price: number): CatalogProduct {
  return {
    id, name, category, subcategory: null, description: name, price,
    stockAvailable: 50, colors: [], silhouetteImageUrl: '',
    catalogImageUrl: 'https://cdn.example.com/i.jpg', imageUrl: 'https://cdn.example.com/i.jpg',
  };
}
const ledger = () => new SelectionLedger(new Set(), new Set(), new Set(), 'беспроводная зарядка');

describe('Якорь-гейт в сборщике: к повербанку — связанное, иначе соло (прогон 3:10)', () => {
  beforeEach(() => clearProductTypeCache());

  const pb = prod('pb', 'Внешний аккумулятор 5000 мАч, черный', 'Электроника и гаджеты', 1000);
  const cable = prod('cbl', 'USB-кабель 3-в-1 Type-C', 'Электроника и гаджеты', 400);
  const pomada = prod('pm', 'Гигиеническая помада Chapstick', 'Гигиенические помады', 58);
  const beltbag = prod('bb', 'Поясная сумка SPIRIT', 'Сумки и рюкзаки', 559);

  it('в якорь-режиме добирает КАБЕЛЬ (связанный), а помаду/поясную сумку — нет', () => {
    const out = assembleFromPool({
      pool: [pb, cable, pomada, beltbag],
      productIds: ['pb'], // байер выбрал повербанк
      ledger: ledger(), minItems: 1, maxItems: 2, budgetPerSet: 1500,
      brief: 'беспроводная зарядка для телефона', brandColors: [], fullCatalog: [pb, cable, pomada, beltbag],
      mandatoryTypes: ['powerbank'],
      anchorType: 'powerbank', anchorLabel: 'беспроводная зарядка для телефона',
    });
    const names = out.map((p) => p.name);
    assert.ok(names.some((n) => /аккумулятор/i.test(n)), 'повербанк должен быть');
    assert.ok(names.some((n) => /кабель/i.test(n)), `кабель должен добраться, получили: ${names.join(' | ')}`);
    assert.ok(!names.some((n) => /помада|поясная\s+сумк/i.test(n)), `несвязанное не должно попасть: ${names.join(' | ')}`);
  });

  it('нет связанного комплемента → повербанк СОЛО (не пихаем помаду/сумку)', () => {
    const out = assembleFromPool({
      pool: [pb, pomada, beltbag],
      productIds: ['pb'],
      ledger: ledger(), minItems: 1, maxItems: 2, budgetPerSet: 1500,
      brief: 'беспроводная зарядка для телефона', brandColors: [], fullCatalog: [pb, pomada, beltbag],
      mandatoryTypes: ['powerbank'],
      anchorType: 'powerbank', anchorLabel: 'беспроводная зарядка для телефона',
    });
    assert.equal(out.length, 1, `ожидали соло-повербанк, получили: ${out.map((p) => p.name).join(' | ')}`);
    assert.ok(/аккумулятор/i.test(out[0].name));
  });

  it('БЕЗ якорь-режима (обычный набор) — гейт не активен, добор как раньше', () => {
    const out = assembleFromPool({
      pool: [pb, cable, pomada, beltbag],
      productIds: ['pb', 'bb'], // байер выбрал повербанк + сумку
      ledger: ledger(), minItems: 2, maxItems: 2, budgetPerSet: 3000,
      brief: 'подарочный набор сотрудникам', brandColors: [], fullCatalog: [pb, cable, pomada, beltbag],
      // anchorType не задан → гейт спит
    });
    assert.ok(out.length >= 1);
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isExcluded } from './catalog-shortlist.util';
import { crossConceptLineKeys } from './catalog-variant.util';
import type { CatalogProduct } from './catalog.util';

function p(name: string, category = 'Прочее'): CatalogProduct {
  return {
    id: name, name, category, subcategory: null, description: '', price: 900,
    stockAvailable: 100, colors: [], silhouetteImageUrl: '', catalogImageUrl: 'x', imageUrl: 'x',
  } as CatalogProduct;
}

describe('isExcluded: сильный матчер поверх slug/категории (каналы B/D/G)', () => {
  it('ловит запрет даже при мис-типизации (нестандартное имя без slug-ключа)', () => {
    // «Внешний аккумулятор Wolfrock …» может типизироваться не как powerbank — но матчер по имени ловит.
    assert.equal(isExcluded(p('Внешний аккумулятор Wolfrock 10000 mAh', 'Электроника и гаджеты'), ['аккумуляторы']), true);
    assert.equal(isExcluded(p('Power Bank Basis 2000 mAh'), ['пауэр банки']), true);
    assert.equal(isExcluded(p('Bluetooth колонка Bardo'), ['колонки беспроводные']), true);
    assert.equal(isExcluded(p('Лампа с колонкой и беспроводной зарядкой Alladin'), ['колонки беспроводные']), true);
  });

  it('регресс: «ручки» НЕ исключает «Сумку с ручками» (короткий термин — не матч по имени)', () => {
    assert.equal(isExcluded(p('Сумка с ручками из хлопка', 'Сумки'), ['ручки']), false);
  });

  it('легитимные настольные товары не исключаются', () => {
    const forbid = ['упаковки', 'пауэр банки', 'аккумуляторы', 'колонки беспроводные'];
    assert.equal(isExcluded(p('Настольный органайзер', 'Офис'), forbid), false);
    assert.equal(isExcluded(p('USB-хаб 4 порта', 'Электроника'), forbid), false);
    assert.equal(isExcluded(p('Ежедневник А5', 'Ежедневники'), forbid), false);
  });

  it('пустой список — ничего не исключаем', () => {
    assert.equal(isExcluded(p('Power Bank'), []), false);
    assert.equal(isExcluded(p('Power Bank'), undefined), false);
  });
});

describe('Межнаборный line-key: разные пауэрбанки/колонки → один ключ (диверсификация)', () => {
  it('два РАЗНЫХ пауэрбанка получают один ключ line:powerbank', () => {
    const a = crossConceptLineKeys(p('Внешний аккумулятор Bplanner Power 4 ST, 8000 mAh'));
    const b = crossConceptLineKeys(p('Портативное зарядное устройство Брадуэлл, 2200 mAh'));
    assert.ok(a.includes('line:powerbank'), `A keys: ${a.join(',')}`);
    assert.ok(b.includes('line:powerbank'), `B keys: ${b.join(',')}`);
  });

  it('«повербанк» (кириллица) и «мАч» тоже дают line:powerbank', () => {
    assert.ok(crossConceptLineKeys(p('Повербанк 5000')).includes('line:powerbank'));
    assert.ok(crossConceptLineKeys(p('Зарядка 10000 мАч чёрная')).includes('line:powerbank'));
  });

  it('две разные колонки → один ключ line:speaker', () => {
    assert.ok(crossConceptLineKeys(p('Беспроводная Bluetooth колонка Charge')).includes('line:speaker'));
    assert.ok(crossConceptLineKeys(p('Портативная колонка Tempo')).includes('line:speaker'));
  });
});

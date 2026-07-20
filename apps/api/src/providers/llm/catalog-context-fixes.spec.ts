import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildBriefRelevanceContext, scoreBriefRelevanceWithContext } from './catalog-brief-relevance.util';
import { detectTypeSlug, clearProductTypeCache } from '../../concept/product-taxonomy';
import type { CatalogProduct } from './catalog.util';

function p(name: string, category = 'Прочее', price = 500): CatalogProduct {
  return {
    id: name, name, category, subcategory: null, description: name, price,
    stockAvailable: 100, colors: [], silhouetteImageUrl: '', catalogImageUrl: 'x', imageUrl: 'x',
    externalId: name, sourceId: 'oasis',
  } as CatalogProduct;
}
const rel = (name: string, brief: string, cat = 'Прочее') =>
  scoreBriefRelevanceWithContext(p(name, cat), buildBriefRelevanceContext(brief, []));

// C1 — «кружка … с ручкой-карабином» это КРУЖКА, а не ручка (pen ловил подстроку «ручк»)
describe('таксономия: кружка с ручкой ≠ ручка (C1)', () => {
  beforeEach(() => clearProductTypeCache());
  it('«Стальная кружка … с ручкой-карабином» → mug', () => {
    assert.equal(
      detectTypeSlug(p('Стальная кружка Elbrus с двойными стенками и ручкой-карабином, 300 мл', 'Кружки')),
      'mug',
    );
  });
  it('«термокружка с ручкой» → thermos_mug, не pen', () => {
    assert.equal(detectTypeSlug(p('Термокружка Stinger с ручкой, 400 мл', 'Посуда')), 'thermos_mug');
  });
  it('сумка с ручками → не pen', () => {
    assert.notEqual(detectTypeSlug(p('Сумка-шоппер с длинными ручками', 'Сумки')), 'pen');
  });
  it('настоящая шариковая ручка всё ещё pen', () => {
    assert.equal(detectTypeSlug(p('Ручка шариковая Senator, синий', 'Ручки')), 'pen');
  });
  it('«Набор Aurora (ручка+карандаш)» всё ещё pen', () => {
    assert.equal(detectTypeSlug(p('Набор "Aurora" (ручка+карандаш), металл', 'Ручки')), 'pen');
  });
});

// C1b — сувенирная флешка типизируется по «флеш», а не по слову-форме (футболка/ручка)
describe('таксономия: флешка по «флеш», не по форме (C1b)', () => {
  beforeEach(() => clearProductTypeCache());
  it('«Флешка в виде футболки» → flash, не tshirt', () => {
    assert.equal(detectTypeSlug(p('Флешка в виде футболки, 64 Гб', 'Электроника')), 'flash');
  });
  it('«Флешка в виде ручки» → flash, не pen', () => {
    assert.equal(detectTypeSlug(p('Флешка в виде ручки с мини чипом, 16 Гб', 'Электроника')), 'flash');
  });
  it('обычная футболка всё ещё tshirt', () => {
    assert.equal(detectTypeSlug(p('Футболка Premium мужская', 'Одежда')), 'tshirt');
  });
});

// C1c — подарочная коробка/упаковка → packaging (отсекается из наполнения набора)
describe('таксономия: подарочная коробка → packaging (C1c)', () => {
  beforeEach(() => clearProductTypeCache());
  it('«Подарочная коробка без ложемента (крышка-дно)» → packaging', () => {
    assert.equal(
      detectTypeSlug(p('Подарочная коробка без ложемента (крышка-дно, 20 х h 3,5 х 14 см)', 'Подарочные наборы')),
      'packaging',
    );
  });
  it('«Коробка подарочная с лентой» → packaging', () => {
    assert.equal(detectTypeSlug(p('Коробка подарочная с лентой', 'Подарочные наборы')), 'packaging');
  });
  it('сумка-шоппер под категорией «Подарочные наборы» → НЕ packaging', () => {
    assert.notEqual(detectTypeSlug(p('Сумка-шоппер BLACK&WHITE', 'Подарочные наборы')), 'packaging');
  });
});

// C2 — игровой набор под категорией «Отдых и спорт» не должен становиться fitness
describe('таксономия: набор игр ≠ фитнес (C2)', () => {
  beforeEach(() => clearProductTypeCache());
  it('«Набор игр Joy 4в1» [Отдых и спорт] → не fitness', () => {
    assert.notEqual(detectTypeSlug(p('Набор игр "Joy" 4в1', 'Отдых и спорт')), 'fitness');
  });
  it('«Настольная игра Мемо» → не fitness', () => {
    assert.notEqual(detectTypeSlug(p('Настольная игра «Мемо»', 'Отдых и спорт')), 'fitness');
  });
  it('настоящая скакалка всё ещё fitness', () => {
    assert.equal(detectTypeSlug(p('Скакалка REGINA из хлопка', 'Отдых и спорт')), 'fitness');
  });
});

// C3 — оружейная символика вне военного/охотничьего контекста отсекается
describe('контекст: оружейная символика не по брифу (C3)', () => {
  beforeEach(() => clearProductTypeCache());
  it('флешка-патрон от АК-47 врачам — reject', () => {
    assert.ok(rel('Флешка в виде патрона от AK-47, 4 Гб', 'подарки врачам на день медицинского работника') <= -70);
  });
  it('«USB автомат Калашникова» офису — reject', () => {
    assert.ok(rel('USB-флешка автомат Калашникова, 8 Гб', 'подарки коллегам в офис') <= -70);
  });
  it('брелок-пистолет женщинам на 8 марта — reject', () => {
    assert.ok(rel('Брелок-пистолет металлический', 'подарки женщинам на 8 марта') <= -70);
  });
  it('охотничьему клубу флешка-патрон — НЕ reject', () => {
    assert.ok(rel('Флешка в виде патрона от AK-47, 4 Гб', 'подарки для охотничьего клуба, оружейная тематика') > -70);
  });
  it('обычная флешка врачам — НЕ reject этим правилом', () => {
    assert.ok(rel('Флешка промо прямоугольная, 8 Гб', 'подарки врачам на день медицинского работника') > -70);
  });
  it('«патрон E27» (ламповый) не путается с боеприпасом', () => {
    assert.ok(rel('Патрон E27 для лампы, керамический', 'подарки коллегам в офис') > -70);
  });
});

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildBriefRelevanceContext, scoreBriefRelevanceWithContext } from './catalog-brief-relevance.util';
import { clearProductTypeCache } from '../../concept/product-taxonomy';
import type { CatalogProduct } from './catalog.util';

function p(name: string, category = 'Прочее', price = 700): CatalogProduct {
  return {
    id: name, name, category, subcategory: null, description: name, price,
    stockAvailable: 100, colors: [], silhouetteImageUrl: '', catalogImageUrl: 'x', imageUrl: 'x',
  } as CatalogProduct;
}
const rel = (name: string, brief: string, cat = 'Прочее') =>
  scoreBriefRelevanceWithContext(p(name, cat), buildBriefRelevanceContext(brief, []));

const NY = 'подбери набор для новогоднего празднования, товаров 5-6 штук';

describe('Сезонный гейт: зима/Новый год ≠ лето/пляж', () => {
  beforeEach(() => clearProductTypeCache());

  it('пляжный коврик в новогоднем наборе — reject', () => {
    assert.ok(rel('Коврик пляжный', NY, 'Электроника') <= -70);
  });
  it('поло с коротким рукавом в новогоднем наборе — reject/сильный штраф', () => {
    assert.ok(rel('Рубашка поло "Star" мужская, оранжевый', NY, 'Одежда') <= -70);
  });
  it('гамак/мангал/купальник в новогоднем наборе — reject', () => {
    assert.ok(rel('Гамак туристический', NY) <= -70);
    assert.ok(rel('Мангал складной', NY) <= -70);
  });
  it('майка (безрукавка) в новогоднем наборе — reject', () => {
    assert.ok(rel('Майка "Texas" мужская, красный', NY, 'Одежда') <= -70);
  });
  it('«полотенце» НЕ путается с «поло» (нет ложного reject)', () => {
    assert.ok(rel('Полотенце банное махровое', NY, 'Текстиль') > -70);
  });
  it('складной зонт (от дождя) уместен в любой сезон — не reject', () => {
    assert.ok(rel('Зонт складной "Frisco" механический', NY, 'Зонты') > -70);
  });
  it('зимнее/праздничное (плед/свеча/термокружка) — не зарезано', () => {
    assert.ok(rel('Плед флисовый', NY, 'Текстиль') > -70);
    assert.ok(rel('Термокружка стальная', NY, 'Посуда') > -70);
  });
  it('пляжный коврик в ЛЕТНЕМ брифе — НЕ зарезан этим гейтом', () => {
    assert.ok(rel('Коврик пляжный', 'летний фестиваль на открытом воздухе', 'Электроника') > -70);
  });
});

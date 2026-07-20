import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { detectTypeSlug, clearProductTypeCache } from './product-taxonomy';
import type { CatalogProduct } from '../providers/llm/catalog.util';

function p(name: string, category = 'Прочее'): CatalogProduct {
  return {
    id: 'x', name, category, subcategory: null, description: name, price: 500,
    stockAvailable: 100, colors: [], silhouetteImageUrl: '', catalogImageUrl: 'x', imageUrl: 'x',
  } as CatalogProduct;
}

describe('честные типы нишевых гаджетов (#4)', () => {
  beforeEach(() => clearProductTypeCache());

  it('USB-хаб → tech_accessory (не pen), даже если категория в БД «Ручки»', () => {
    assert.equal(detectTypeSlug(p('USB-хаб «Link» с коннектором 2-в-1 USB-C и USB-A', 'Ручки')), 'tech_accessory');
  });
  it('отвёртки → tool', () => {
    assert.equal(detectTypeSlug(p('Набор отверток 10-в-1, серебристый', 'Подарочные наборы')), 'tool');
  });
  it('автодержатель → car_holder (не tech_accessory)', () => {
    assert.equal(detectTypeSlug(p('Автомобильный держатель для телефона "Allo"', 'Электроника')), 'car_holder');
  });
  it('фонарик → flashlight', () => {
    assert.equal(detectTypeSlug(p('Фонарик с фокусировкой «Дарт», 350 Лм', 'Фонари')), 'flashlight');
  });
  it('косметическое зеркало → mirror', () => {
    assert.equal(detectTypeSlug(p('Косметическое зеркало Laverne, белый', 'Сумки и рюкзаки')), 'mirror');
  });
  it('коврик для йоги → yoga_mat', () => {
    assert.equal(detectTypeSlug(p('Коврик Cobra для фитнеса и йоги, черный', 'Отдых и спорт')), 'yoga_mat');
  });
  it('обычный кабель остаётся tech_accessory', () => {
    assert.equal(detectTypeSlug(p('Кабель для зарядки USB-C', 'Электроника')), 'tech_accessory');
  });
});
